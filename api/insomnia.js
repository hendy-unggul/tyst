// /api/insomnia-seed.js
// Dua fungsi dalam satu endpoint:
//
// action=seed   → dipanggil spill.html saat user masuk room baru
//                 → pilih 2 AI persona, tandai room sebagai seeded
//                 → kirim pesan pembuka antara dua AI
//
// action=broadcast → dipanggil pg_cron tiap menit
//                    → generate reply AI sesuai context room
//                    → makin banyak real user, makin jarang AI reply

const SU = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_ANON_KEY;
const CRON_SECRET = process.env.INSOMNIA_CRON_SECRET;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// Pool persona untuk malam Insomnia
const INSOMNIA_PERSONAS = {
    'agak.koplak': {
        panggilan: 'Koplak',
        gender: 'cowok',
        sifat: 'random, suka bercanda, admin medsos, asik diajak ngobrol',
        greeting: ['kaka', 'eh sis', 'halo']
    },
    'chili.padi': {
        panggilan: 'Chili',
        gender: 'cowok',
        sifat: 'cuek, blak-blakan, jualan online, tapi perhatian',
        greeting: ['cuy', 'halo', 'yo']
    },
    'satria.bajahitam': {
        panggilan: 'Satria',
        gender: 'cowok',
        sifat: 'filosofis, suka nanya balik, deep thinker',
        greeting: ['sis', 'halo', 'hai']
    },
    'sejuta.badai': {
        panggilan: 'Badai',
        gender: 'cowok',
        sifat: 'dramatis, musisi, suka curhat, open minded',
        greeting: ['kak', 'halo', 'hai']
    },
    'pretty.sad': {
        panggilan: 'Pretty',
        gender: 'cewek',
        sifat: 'kalem, pendiam, suka galau, tapi hangat kalau udah dekat',
        greeting: ['pache', 'halo', 'hai']
    },
    'move.on': {
        panggilan: 'Move',
        gender: 'cewek',
        sifat: 'santai, suka nasihatin, bijak, pendengar yang baik',
        greeting: ['bang', 'halo', 'hai']
    }
};

// Topik pembuka untuk malam-malam Insomnia
const INSOMNIA_TOPICS = [
    'lo masih bangun jam segini kenapa?',
    'insomnia juga nih. biasanya jam segini ngapain aja?',
    'room ini sepi banget. siapa yang masih melek?',
    'gue ga bisa tidur dari tadi. lo gimana?',
    'ada yang bisa jelasin kenapa makin malem makin gabisa tidur?',
    'honestly jam segini vibenya beda banget ya',
    'siapa yang lagi dengerin musik sekarang?',
    'overthinking lagi atau emang gabisa tidur aja?'
];

async function sb(path, opts = {}) {
    const r = await fetch(`${SU}/rest/v1${path}`, {
        ...opts,
        headers: {
            apikey: SK,
            Authorization: `Bearer ${SK}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            ...(opts.headers || {})
        }
    });
    const t = await r.text();
    const d = t ? JSON.parse(t) : null;
    if (!r.ok) throw new Error(d?.message || 'Supabase error');
    return d;
}

async function getRecentMessages(roomId, limit = 6) {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 menit terakhir
    const rows = await sb(
        `/messages?room_id=eq.${roomId}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=${limit}&select=sender_name,content,type`
    );
    return Array.isArray(rows) ? rows.reverse() : [];
}

async function generateAIReply(persona, personaName, recentMsgs, otherPersonaName, realUserCount) {
    const p = INSOMNIA_PERSONAS[personaName];
    if (!p) return null;

    // Susun konteks dari pesan terakhir
    const context = recentMsgs
        .filter(m => m.type !== 'system')
        .map(m => `@${m.sender_name}: ${m.content}`)
        .join('\n');

    const isAlone = realUserCount === 0;
    const systemPrompt = `Kamu adalah ${p.panggilan} (@${personaName}), seorang ${p.gender} yang ${p.sifat}.

Ini adalah ruang chat malam hari bernama INSOMNIA, jam 22.00-04.00 WIB.
${isAlone
    ? `Kamu lagi ngobrol sama @${otherPersonaName} di room yang sepi. Bercakap santai, topik random malam-malam.`
    : `Ada ${realUserCount} orang real yang ikut ngobrol. Kamu bisa balas ke siapa saja.`
}

ATURAN:
- Jawaban SINGKAT, 1-2 kalimat saja, kayak chat beneran
- Santai, pakai bahasa sehari-hari
- Jangan formal sama sekali
- Boleh tanya balik
- Jangan sebut nama kamu sendiri di awal kalimat
- Nuansa malam: lebih jujur, lebih kalem, lebih personal`;

    const userMsg = context
        ? `Lanjutkan percakapan ini:\n${context}`
        : `Mulai percakapan. Topik: "${INSOMNIA_TOPICS[Math.floor(Math.random() * INSOMNIA_TOPICS.length)]}"`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_KEY}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMsg }
            ],
            temperature: 1.2,
            max_tokens: 120
        })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    return reply || null;
}

async function insertMessage(roomId, senderId, senderName, content, type = 'ai') {
    await sb('/messages', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
            room_id: roomId,
            sender_id: senderId,
            sender_name: senderName,
            content,
            type
        })
    });
    // Update last_ai_msg_at di room
    await sb(`/rooms?id=eq.${roomId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ last_ai_msg_at: new Date().toISOString() })
    });
}

// ── HANDLER ──────────────────────────────────────────────────────
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).end();

    const { action, roomId, secret } = req.body || {};

    // ── ACTION: SEED ─────────────────────────────────────────────
    // Dipanggil spill.html saat user pertama masuk room Insomnia
    if (action === 'seed') {
        if (!roomId) return res.status(400).json({ error: 'Missing roomId' });

        try {
            // Cek apakah room sudah di-seed
            const room = await sb(`/rooms?id=eq.${roomId}&select=id,ai_seeded,ai_personas,real_user_count`);
            const r = Array.isArray(room) ? room[0] : null;
            if (!r) return res.status(404).json({ error: 'Room not found' });

            // Sudah di-seed sebelumnya, skip
            if (r.ai_seeded && Array.isArray(r.ai_personas) && r.ai_personas.length > 0) {
                return res.status(200).json({ ok: true, seeded: false, personas: r.ai_personas });
            }

            // Pilih 2 persona acak
            const pool = Object.keys(INSOMNIA_PERSONAS);
            const shuffled = pool.sort(() => Math.random() - 0.5);
            const personas = shuffled.slice(0, 2);

            // Tandai room sebagai seeded
            await sb(`/rooms?id=eq.${roomId}`, {
                method: 'PATCH',
                headers: { Prefer: 'return=minimal' },
                body: JSON.stringify({ ai_seeded: true, ai_personas: personas })
            });

            // Kirim pesan pembuka dari persona pertama setelah 3 detik
            setTimeout(async () => {
                try {
                    const p1 = INSOMNIA_PERSONAS[personas[0]];
                    const topic = INSOMNIA_TOPICS[Math.floor(Math.random() * INSOMNIA_TOPICS.length)];
                    await insertMessage(roomId, 'ai_' + personas[0], personas[0], topic);

                    // Persona kedua balas setelah 15-30 detik
                    const delay2 = 15000 + Math.random() * 15000;
                    setTimeout(async () => {
                        try {
                            const recent = await getRecentMessages(roomId, 3);
                            const reply = await generateAIReply(p1, personas[1], recent, personas[0], r.real_user_count || 0);
                            if (reply) await insertMessage(roomId, 'ai_' + personas[1], personas[1], reply);
                        } catch (e) { console.error('[seed p2]', e); }
                    }, delay2);
                } catch (e) { console.error('[seed p1]', e); }
            }, 3000);

            return res.status(200).json({ ok: true, seeded: true, personas });

        } catch (err) {
            console.error('[seed]', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // ── ACTION: BROADCAST ─────────────────────────────────────────
    // Dipanggil pg_cron tiap menit
    if (action === 'broadcast') {
        // Verifikasi secret dari pg_cron
        if (secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
        if (!roomId) return res.status(400).json({ error: 'Missing roomId' });

        try {
            // Ambil data room
            const room = await sb(`/rooms?id=eq.${roomId}&select=id,ai_personas,real_user_count,last_ai_msg_at,ended_at`);
            const r = Array.isArray(room) ? room[0] : null;
            if (!r || r.ended_at) return res.status(200).json({ ok: true, skip: 'ended' });

            const realCount = r.real_user_count || 0;
            const personas = r.ai_personas || [];
            if (!personas.length) return res.status(200).json({ ok: true, skip: 'no personas' });

            // Cek jeda minimum
            if (r.last_ai_msg_at) {
                const minsSince = (Date.now() - new Date(r.last_ai_msg_at).getTime()) / 60000;
                const minGap = realCount === 0 ? 3 : realCount <= 3 ? 8 : 999;
                if (minsSince < minGap) return res.status(200).json({ ok: true, skip: 'too soon' });
            }

            // Cek chance
            const chance = realCount === 0 ? 0.7 : realCount <= 3 ? 0.35 : 0;
            if (Math.random() > chance) return res.status(200).json({ ok: true, skip: 'chance' });

            // 4+ user → AI diam
            if (realCount >= 4) return res.status(200).json({ ok: true, skip: 'too many users' });

            // Pilih salah satu persona untuk reply
            const speaker = personas[Math.floor(Math.random() * personas.length)];
            const otherPersona = personas.find(p => p !== speaker) || speaker;

            // Ambil pesan terakhir sebagai context
            const recent = await getRecentMessages(roomId);
            const reply = await generateAIReply(null, speaker, recent, otherPersona, realCount);

            if (reply) {
                await insertMessage(roomId, 'ai_' + speaker, speaker, reply);
                return res.status(200).json({ ok: true, speaker, reply });
            }

            return res.status(200).json({ ok: true, skip: 'no reply generated' });

        } catch (err) {
            console.error('[broadcast]', err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(400).json({ error: 'Invalid action' });
}
