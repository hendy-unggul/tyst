// api/match.js v2
// Disesuaikan dengan struktur tabel existing:
//   - active_chats menggunakan channel_name sebagai room identifier
//   - waiting_room menggunakan kolom gender yang sudah ada

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(path, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(`${SUPABASE_URL}/rest/v1${path}`, opts);
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
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
    if (!res.ok) throw new Error(`RPC ${fn} error ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // ── POST: join queue / try match / heartbeat ──────────────
    if (req.method === 'POST') {
        const { action, userId, username, genderWant, sessionId } = req.body || {};

        if (!userId || !username) {
            return res.status(400).json({ error: 'userId and username required' });
        }

        // HEARTBEAT
        if (action === 'heartbeat') {
            try {
                await sb(
                    `/waiting_room?user_id=eq.${userId}&session_id=eq.${sessionId}&status=eq.waiting`,
                    'PATCH',
                    { last_heartbeat: new Date().toISOString() }
                );
                await sb(
                    `/online_users?user_id=eq.${userId}`,
                    'PATCH',
                    { last_heartbeat: new Date().toISOString() }
                );
                return res.status(200).json({ ok: true });
            } catch (e) {
                console.error('Heartbeat error:', e.message);
                return res.status(500).json({ error: e.message });
            }
        }

        // JOIN / MATCH
        if (!genderWant || !sessionId) {
            return res.status(400).json({ error: 'genderWant and sessionId required' });
        }

        try {
            const result = await rpc('match_users', {
                p_user_id:     userId,
                p_username:    username,
                p_gender_want: genderWant,
                p_session_id:  sessionId
            });

            // Jika matched, jadwalkan cleanup waiting_room setelah 10 detik
            // (beri waktu agar kedua client sempat baca status matched)
            if (result && result.matched) {
                setTimeout(async () => {
                    try {
                        await sb(`/waiting_room?user_id=eq.${userId}&status=eq.matched`, 'DELETE');
                    } catch(e) { /* non-fatal */ }
                }, 10000);
            }

            return res.status(200).json(result);
        } catch (e) {
            console.error('Match error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    }

    // ── DELETE: leave queue atau end chat ─────────────────────
    if (req.method === 'DELETE') {
        const { userId, roomId } = req.body || {};

        try {
            if (userId) {
                await sb(`/waiting_room?user_id=eq.${userId}`, 'DELETE');
                await sb(
                    `/online_users?user_id=eq.${userId}`,
                    'PATCH',
                    { status: 'online', last_heartbeat: new Date().toISOString() }
                );
            }

            if (roomId) {
                // Ambil data room
                const chats = await sb(
                    `/active_chats?channel_name=eq.${roomId}&select=user1_id,user2_id`
                );

                // Tandai ended
                await sb(
                    `/active_chats?channel_name=eq.${roomId}`,
                    'PATCH',
                    { status: 'ended', ended_at: new Date().toISOString() }
                );

                // Bersihkan kedua user dari waiting_room & reset status
                if (chats && chats[0]) {
                    const { user1_id, user2_id } = chats[0];
                    await sb(`/waiting_room?user_id=in.(${user1_id},${user2_id})`, 'DELETE');
                    await sb(
                        `/online_users?user_id=in.(${user1_id},${user2_id})`,
                        'PATCH',
                        { status: 'online' }
                    );
                }
            }

            return res.status(200).json({ ok: true });
        } catch (e) {
            console.error('Leave/end error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
