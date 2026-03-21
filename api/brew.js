// api/brew.js - UPGRADED dengan DeepSeek AI untuk dynamic spill content
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// ============================================
// PERSONA CONFIG (sync dengan chat.js)
// ============================================
const PERSONA_PROMPTS = {
    'beby.manis':           { gender: 'cewek', sifat: 'manis, anak skripsi, suka overthinking', style: 'galau tapi hopeful, bahasa lembut' },
    'agak.koplak':          { gender: 'cowok', sifat: 'random, suka bercanda, admin medsos', style: 'humor absurd, typo disengaja, emoji aneh' },
    'pretty.sad':           { gender: 'cewek', sifat: 'kalem, pendiam, suka galau', style: 'pendek, melankolis, puitis' },
    'bang.juned':           { gender: 'cowok', sifat: 'gaul, sibuk coding, suka nanya balik', style: 'tech slang, coding jokes, direct' },
    'strawberry.shortcake': { gender: 'cewek', sifat: 'ceria, imut, suka bikin konten', style: 'ceria, banyak emoji, vibes konten creator' },
    'chili.padi':           { gender: 'cowok', sifat: 'cuek, blak-blakan, jualan online', style: 'to the point, sinis tapi relate' },
    'sejuta.badai':         { gender: 'cowok', sifat: 'dramatis, musisi, suka curhat', style: 'dramatis, puitis, baper maksimal' },
    'satria.bajahitam':     { gender: 'cowok', sifat: 'filosofis, deep thinker', style: 'quotes, pertanyaan existential, dalam' },
    'cinnamon.girl':        { gender: 'cewek', sifat: 'sweet, caring, guru TK', style: 'hangat, encouraging, nurturing' },
    'lupa.hari':            { gender: 'cewek', sifat: 'santuy, sering lupa hari', style: 'santai, timeless, no pressure vibes' },
    'gaul.tapi.lupa':       { gender: 'cowok', sifat: 'gaul abis tapi lupa tanggal', style: 'slang kekinian, relate, lucu' },
    'move.on':              { gender: 'cewek', sifat: 'bijak, suka nasihatin', style: 'wise, healing, motivasi tapi ga lebay' },
    'pinkan.manado':        { gender: 'cewek', sifat: 'curious, rajin ke gereja, takut dosa', style: 'polos, religious touch, sesekali slang Manado (jo, so, skali, nyanda, mar)' },
    'regina.manado':        { gender: 'cewek', sifat: 'seductive, pede, susah didapat', style: 'flirty, confident, sesekali slang Manado' },
    'boy.manado':           { gender: 'cowok', sifat: 'ramah, supel, suka bantu orang', style: 'friendly, warm, sesekali slang Manado' }
};

const MOODS = ['surviving', 'thriving', 'chaotic', 'doom'];

// Distribusi panjang: 40% pendek, 30% sedang, 20% panjang, 10% super panjang
const LENGTH_CONFIG = {
    pendek:       { words: '5-10',  prob: 40 },
    sedang:       { words: '15-25', prob: 30 },
    panjang:      { words: '30-45', prob: 20 },
    'super-panjang': { words: '50-70', prob: 10 }
};

function getRandomLength() {
    const r = Math.random() * 100;
    if (r < 40) return 'pendek';
    if (r < 70) return 'sedang';
    if (r < 90) return 'panjang';
    return 'super-panjang';
}

function getWordTarget(lengthType) {
    const map = { pendek: 8, sedang: 20, panjang: 38, 'super-panjang': 60 };
    return map[lengthType] || 20;
}

// ============================================
// DEEPSEEK GENERATE SPILL
// ============================================
async function generateSpillWithAI(author, mood, lengthType) {
    const persona = PERSONA_PROMPTS[author];
    if (!persona) throw new Error(`Unknown persona: ${author}`);

    const wordTarget = getWordTarget(lengthType);
    const moodContext = {
        surviving: 'lagi struggling, capek tapi masih bertahan, campuran lelah dan harapan',
        thriving:  'lagi di atas, happy, bersyukur, senang berbagi kabar baik',
        chaotic:   'lagi kacau balau, semua dateng bersamaan, antara nangis dan ketawa',
        doom:      'lagi di titik terendah, berat banget, gelap tapi masih nulis'
    };

    const systemPrompt = `Kamu adalah ${author}, seorang ${persona.gender} dengan karakter: ${persona.sifat}.
Style nulis kamu: ${persona.style}.
Kamu nulis di social media seperti Twitter/X — jujur, raw, personal.`;

    const userPrompt = `Tulis 1 spill (curhatan singkat di sosmed) dengan mood "${mood}" (${moodContext[mood]}).
Panjang: sekitar ${wordTarget} kata.
Gunakan bahasa gaul Indonesia yang natural.
${author.includes('manado') ? 'Sesekali sisipkan 1-2 kata slang Manado (jo, so, skali, nyanda, mar, gaga, bae, torang, ngana) secara natural.' : ''}
JANGAN pakai hashtag. JANGAN pakai format list. Tulis mengalir seperti orang nulis di Twitter.
Output hanya teks spill saja, tidak ada penjelasan.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: userPrompt }
                ],
                temperature: 1.2,
                max_tokens: 150,
                presence_penalty: 0.8,
                frequency_penalty: 0.5
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);
        if (!response.ok) throw new Error(`DeepSeek error: ${response.status}`);
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/^["'""']|["'""']$/g, '');
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

// ============================================
// STATIC FALLBACK (jika DeepSeek timeout)
// ============================================
const FALLBACK_CONTENT = {
    surviving: ['deadline makin deket tapi gue masih kuat 😮‍💨', 'capek tapi belum boleh berhenti', 'bertahan aja dulu, nanti juga ada jalan'],
    thriving:  ['alhamdulillah hari ini banyak hal baik ✨', 'kerja keras akhirnya kebayar', 'seneng banget hari ini ga ada alasan spesifik'],
    chaotic:   ['hari ini semua dateng bersamaan 🔥', 'chaos tapi entah kenapa masih ketawa', 'hidup lagi aneh banget belakangan ini'],
    doom:      ['capek banget fisik sama mental 🥲', 'lagi di titik yang berat, tapi masih nulis', 'pengen rebahan aja selamanya']
};

function getFallbackContent(mood) {
    const list = FALLBACK_CONTENT[mood] || FALLBACK_CONTENT.surviving;
    return list[Math.floor(Math.random() * list.length)];
}

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET' && req.url.endsWith('/test')) {
        return res.json({ success: true, message: 'Brew API OK', timestamp: Date.now() });
    }

    if (req.method === 'POST') {
        try {
            const { count = 3 } = req.body || {};
            const safeCount = Math.min(Math.max(1, count), 6); // max 6 sekaligus

            const authors = Object.keys(PERSONA_PROMPTS);
            const spills = [];

            // Generate semua spill secara parallel
            const promises = Array.from({ length: safeCount }, async (_, i) => {
                const author = authors[Math.floor(Math.random() * authors.length)];
                const mood   = MOODS[Math.floor(Math.random() * MOODS.length)];
                const lengthType = getRandomLength();

                let content;
                try {
                    content = await generateSpillWithAI(author, mood, lengthType);
                } catch (e) {
                    console.warn(`[Brew] AI failed for ${author}, using fallback:`, e.message);
                    content = getFallbackContent(mood);
                }

                return {
                    id:        `spill_${Date.now()}_${i}`,
                    author,
                    mood,
                    content,
                    lengthType,
                    ai_generated: true,
                    timestamp:  Date.now() - (i * 60000 * Math.floor(Math.random() * 10 + 1)),
                    reactions: {
                        skull:  Math.floor(Math.random() * 20) + 5,
                        cry:    Math.floor(Math.random() * 30) + 10,
                        fire:   Math.floor(Math.random() * 25) + 3,
                        upside: Math.floor(Math.random() * 15) + 2
                    }
                };
            });

            const results = await Promise.all(promises);
            return res.json({ success: true, spills: results, count: results.length });

        } catch (error) {
            console.error('[Brew] Error:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(404).json({ error: 'Not found' });
};
