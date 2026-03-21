// api/brew.js
// Generate 1 AI spill → INSERT ke entries → FIFO trim max 50

const DEEPSEEK_API_KEY     = process.env.DEEPSEEK_API_KEY;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const PERSONAS = [
    { name:'beby.manis',           gender:'cewek', sifat:'manis, anak skripsi, overthinking',      style:'galau tapi hopeful, lembut' },
    { name:'agak.koplak',          gender:'cowok', sifat:'random, suka bercanda, admin medsos',    style:'humor absurd, typo disengaja' },
    { name:'pretty.sad',           gender:'cewek', sifat:'kalem, pendiam, suka galau',             style:'pendek, melankolis, puitis' },
    { name:'bang.juned',           gender:'cowok', sifat:'gaul, sibuk coding, tech savvy',         style:'tech slang, direct' },
    { name:'strawberry.shortcake', gender:'cewek', sifat:'ceria, imut, suka bikin konten',        style:'ceria, banyak emoji' },
    { name:'chili.padi',           gender:'cowok', sifat:'cuek, blak-blakan, jualan online',       style:'to the point, sinis tapi relate' },
    { name:'sejuta.badai',         gender:'cowok', sifat:'dramatis, musisi, suka curhat',          style:'dramatis, puitis, baper' },
    { name:'satria.bajahitam',     gender:'cowok', sifat:'filosofis, deep thinker',               style:'quotes, existential' },
    { name:'cinnamon.girl',        gender:'cewek', sifat:'sweet, caring, guru TK',                style:'hangat, nurturing' },
    { name:'lupa.hari',            gender:'cewek', sifat:'santuy, sering lupa hari',              style:'santai, timeless' },
    { name:'gaul.tapi.lupa',       gender:'cowok', sifat:'gaul abis tapi lupa tanggal',           style:'slang kekinian, lucu' },
    { name:'move.on',              gender:'cewek', sifat:'bijak, suka nasihatin',                 style:'wise, healing' },
    { name:'pinkan.karamoy',        gender:'cewek', sifat:'curious, rajin ke gereja, takut dosa',  style:'polos, religious, slang Manado' },
    { name:'regina.sondakh',        gender:'cewek', sifat:'seductive, pede, susah didapat',        style:'flirty, confident, slang Manado' },
    { name:'boy.rumengan',           gender:'cowok', sifat:'ramah, supel, suka bantu orang',        style:'friendly, warm, slang Manado' }
];

const MOODS = ['surviving','thriving','chaotic','doom'];

const MOOD_CONTEXT = {
    surviving: 'lagi struggling, capek tapi masih bertahan',
    thriving:  'lagi di atas, happy, bersyukur',
    chaotic:   'lagi kacau balau, semua dateng bersamaan',
    doom:      'lagi di titik terendah, berat banget'
};

const FALLBACK = {
    surviving: ['deadline makin deket tapi gue masih kuat 😮‍💨','capek tapi belum boleh berhenti'],
    thriving:  ['alhamdulillah hari ini banyak hal baik ✨','kerja keras akhirnya kebayar'],
    chaotic:   ['hari ini semua dateng bersamaan 🔥','chaos tapi masih ketawa'],
    doom:      ['capek banget fisik sama mental 🥲','pengen rebahan aja selamanya']
};

function getRandomLength() {
    const r = Math.random() * 100;
    if(r < 40) return { label:'pendek',       words:8  };
    if(r < 70) return { label:'sedang',        words:20 };
    if(r < 90) return { label:'panjang',       words:38 };
    return             { label:'super-panjang', words:60 };
}

async function generateSpill(persona, mood, wordTarget) {
    const isManado = persona.name.includes('manado');
    const manado   = isManado
        ? 'Sesekali sisipkan 1-2 kata slang Manado (jo, so, skali, nyanda, mar, gaga, bae) secara natural. '
        : '';

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role:    'system',
                        content: `Kamu adalah ${persona.name}, seorang ${persona.gender} dengan karakter: ${persona.sifat}. Style nulis kamu: ${persona.style}. Kamu nulis di Twitter/X — jujur, raw, personal.`
                    },
                    {
                        role:    'user',
                        content: `Tulis 1 spill dengan mood "${mood}" (${MOOD_CONTEXT[mood]}). Panjang: sekitar ${wordTarget} kata. Bahasa gaul Indonesia. ${manado}JANGAN hashtag. JANGAN list. Output hanya teks spill saja.`
                    }
                ],
                temperature:       1.2,
                max_tokens:        150,
                presence_penalty:  0.8,
                frequency_penalty: 0.5
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);
        if(!res.ok) throw new Error(`DeepSeek ${res.status}`);
        const data = await res.json();
        return data.choices[0].message.content.trim().replace(/^["'""']|["'""']$/g, '');
    } catch(e) {
        clearTimeout(timeout);
        throw e;
    }
}

async function insertToDB(username, content, mood) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/insert_ai_spill`, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ p_username: username, p_content: content, p_mood: mood })
    });
    const text = await res.text();
    if(!res.ok) throw new Error(`DB insert ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if(req.method === 'OPTIONS') return res.status(200).end();
    if(req.method === 'GET')     return res.json({ ok: true, service: 'brew' });

    if(req.method === 'POST') {
        const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
        const mood    = MOODS[Math.floor(Math.random() * MOODS.length)];
        const length  = getRandomLength();

        // 1. Generate via DeepSeek (fallback jika gagal)
        let content, usedFallback = false;
        try {
            content = await generateSpill(persona, mood, length.words);
        } catch(e) {
            console.warn(`[Brew] DeepSeek failed: ${e.message}`);
            const list = FALLBACK[mood] || FALLBACK.surviving;
            content      = list[Math.floor(Math.random() * list.length)];
            usedFallback = true;
        }

        // 2. INSERT ke DB + FIFO trim
        try {
            const result = await insertToDB(persona.name, content, mood);
            return res.json({
                success:      true,
                persona:      persona.name,
                mood,
                lengthType:   length.label,
                usedFallback,
                total:        result?.total || null
            });
        } catch(e) {
            console.error('[Brew] DB error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
