// api/messages.js — disesuaikan dengan struktur chat_messages existing
// Kolom: match_id, user_id, username, message, is_system, created_at

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(path, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Prefer':        method === 'POST' ? 'return=representation' : ''
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(`${SUPABASE_URL}/rest/v1${path}`, opts);
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // ── POST: kirim pesan ─────────────────────────────────────
    if (req.method === 'POST') {
        const { roomId, senderId, senderName, content, isSystem = false } = req.body || {};

        if (!roomId || !senderId || !senderName || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (content.length > 500) {
            return res.status(400).json({ error: 'Message too long (max 500)' });
        }

        try {
            // Verifikasi room masih active via channel_name
            const rooms = await sb(
                `/active_chats?channel_name=eq.${roomId}&status=eq.active&select=id`
            );
            if (!rooms || !rooms.length) {
                return res.status(404).json({ error: 'Room not found or ended' });
            }

            // Insert pakai struktur existing: match_id, user_id, username, message
            const msg = await sb('/chat_messages', 'POST', {
                match_id:  roomId,
                user_id:   senderId,
                username:  senderName,
                message:   content.trim(),
                is_system: isSystem
            });

            return res.status(200).json(msg?.[0] || { ok: true });
        } catch (e) {
            console.error('Send message error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    }

    // ── GET: ambil pesan baru ─────────────────────────────────
    if (req.method === 'GET') {
        const { roomId, since } = req.query || {};

        if (!roomId) return res.status(400).json({ error: 'roomId required' });

        try {
            // Pakai match_id (bukan room_id) sesuai struktur existing
            let path = `/chat_messages?match_id=eq.${roomId}&order=created_at.asc&limit=100`;
            if (since) path += `&created_at=gt.${encodeURIComponent(since)}`;

            const messages = await sb(path);

            // Normalisasi response agar frontend tetap pakai field 'content' & 'sender_id'
            const normalized = (messages || []).map(m => ({
                id:          m.id,
                room_id:     m.match_id,
                sender_id:   m.user_id,
                sender_name: m.username,
                content:     m.message,
                is_system:   m.is_system,
                created_at:  m.created_at
            }));

            return res.status(200).json(normalized);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
