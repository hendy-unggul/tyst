// api/invite.js v3
// Privacy-first: username tidak pernah expose ke client lain
// waiting_room sebagai mutex untuk concurrent bidding

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(path, method='GET', body=null) {
    const opts = {
        method,
        headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
    };
    if(body) opts.body = JSON.stringify(body);
    const res  = await fetch(`${SUPABASE_URL}/rest/v1${path}`, opts);
    const text = await res.text();
    if(!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

async function rpc(fn, params) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify(params)
    });
    const text = await res.text();
    if(!res.ok) throw new Error(`RPC ${fn} error: ${text}`);
    return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if(req.method === 'OPTIONS') return res.status(200).end();

    // ── POST ─────────────────────────────────────────────────
    if(req.method === 'POST') {
        const { action, userId, username, sessionId, vibe, invitationId } = req.body || {};
        if(!userId || !username) return res.status(400).json({ error: 'userId and username required' });

        // REGISTER: user buka halaman → set online
        if(action === 'register') {
            try {
                await rpc('register_online', {
                    p_user_id: userId, p_username: username, p_session_id: sessionId || ''
                });
                return res.status(200).json({ ok: true });
            } catch(e) { return res.status(500).json({ error: e.message }); }
        }

        // HEARTBEAT: update last_heartbeat
        if(action === 'heartbeat') {
            try {
                await sb(`/online_users?user_id=eq.${userId}`, 'PATCH',
                    { last_heartbeat: new Date().toISOString() });
                return res.status(200).json({ ok: true });
            } catch(e) { return res.status(500).json({ error: e.message }); }
        }

        // BID: klik HOT TAKE / SOFT TALK
        // Cek waiting_room dulu, jika tidak ada → blast invitation
        if(action === 'bid') {
            if(!vibe) return res.status(400).json({ error: 'vibe required' });
            try {
                const result = await rpc('start_bidding', {
                    p_user_id:    userId,
                    p_session_id: sessionId || '',
                    p_vibe:       vibe
                });
                // PRIVACY: result tidak mengandung nama/id partner
                return res.status(200).json(result);
            } catch(e) { return res.status(500).json({ error: e.message }); }
        }

        // ACCEPT: invitee accept invitation
        if(action === 'accept') {
            if(!invitationId) return res.status(400).json({ error: 'invitationId required' });
            try {
                const result = await rpc('accept_invitation', {
                    p_invitation_id: invitationId,
                    p_invitee_id:    userId
                });
                // PRIVACY: result hanya berisi room_id dan vibe, tanpa nama
                return res.status(200).json(result);
            } catch(e) { return res.status(500).json({ error: e.message }); }
        }

        // DECLINE: invitee decline
        if(action === 'decline') {
            if(!invitationId) return res.status(400).json({ error: 'invitationId required' });
            try {
                await sb(`/invitations?id=eq.${invitationId}&invitee_id=eq.${userId}`,
                    'PATCH', { status: 'declined' });
                return res.status(200).json({ ok: true });
            } catch(e) { return res.status(500).json({ error: e.message }); }
        }

        return res.status(400).json({ error: 'Unknown action' });
    }

    // ── GET ───────────────────────────────────────────────────
    if(req.method === 'GET') {
        const { userId, role } = req.query || {};
        if(!userId) return res.status(400).json({ error: 'userId required' });

        // INVITER: poll apakah ada yang accept
        if(role === 'inviter') {
            try {
                const result = await rpc('check_match_status', { p_user_id: userId });
                // PRIVACY: hanya return room_id, tanpa nama partner
                return res.status(200).json(result);
            } catch(e) { return res.status(500).json({ error: e.message }); }
        }

        // INVITEE: cek apakah ada invitation masuk
        if(role === 'invitee') {
            try {
                const data = await sb(
                    `/invitations?invitee_id=eq.${userId}&status=eq.pending` +
                    `&expires_at=gt.${new Date().toISOString()}` +
                    `&select=id,vibe,expires_at&order=created_at.desc&limit=1`
                );
                if(data && data.length > 0) {
                    // PRIVACY: hanya return id, vibe, expires_at
                    // TANPA inviter_id atau inviter_name
                    return res.status(200).json({
                        hasInvitation: true,
                        invitation: {
                            id:         data[0].id,
                            vibe:       data[0].vibe,
                            expires_at: data[0].expires_at
                        }
                    });
                }
                return res.status(200).json({ hasInvitation: false });
            } catch(e) { return res.status(500).json({ error: e.message }); }
        }

        // ONLINE COUNT: hitung user online (bukan waiting, bukan in_chat)
        if(role === 'count') {
            try {
                const data = await sb('/online_users?status=eq.online&select=user_id');
                return res.status(200).json({ count: Array.isArray(data) ? data.length : 0 });
            } catch(e) { return res.status(500).json({ error: e.message }); }
        }

        return res.status(400).json({ error: 'role required' });
    }

    // ── DELETE: user offline atau end chat ────────────────────
    if(req.method === 'DELETE') {
        const { userId, roomId } = req.body || {};
        try {
            if(userId) {
                // Expire semua pending invitation dari user ini
                await sb(`/invitations?inviter_id=eq.${userId}&status=eq.pending`,
                    'PATCH', { status: 'expired' });
                // Hapus dari waiting_room
                await sb(`/waiting_room?user_id=eq.${userId}`, 'DELETE');
                // Set offline
                await sb(`/online_users?user_id=eq.${userId}`, 'DELETE');
            }
            if(roomId) {
                // End chat
                await sb(`/active_chats?channel_name=eq.${roomId}`,
                    'PATCH', { status: 'ended', ended_at: new Date().toISOString() });
                // Reset kedua user ke online
                const chats = await sb(
                    `/active_chats?channel_name=eq.${roomId}&select=user1_id,user2_id`
                );
                if(chats?.[0]) {
                    const { user1_id, user2_id } = chats[0];
                    await sb(`/online_users?user_id=in.(${user1_id},${user2_id})`,
                        'PATCH', { status: 'online' });
                }
            }
            return res.status(200).json({ ok: true });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
