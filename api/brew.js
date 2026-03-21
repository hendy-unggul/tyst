// api/brew.js - AI Spill Generator
// Flow: generate 1 spill via DeepSeek → INSERT ke entries → FIFO trim (max 50)

const DEEPSEEK_API_KEY     = process.env.DEEPSEEK_API_KEY;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── PERSONAS ──────────────────────────────────────────────────
const PERSONAS = [
    { name:'beby.manis',           gender:'cewek', sifat:'manis, anak skripsi, suka overthinking',     style:'galau tapi hopeful, lembut' },
    { name:'agak.koplak',          gender:'cowok', sifat:'random, suka bercanda, admin medsos',         style:'humor absurd, typo disengaja' },
    { name:'pretty.sad',           gender:'cewek', sifat:'kalem, pendiam, suka galau',                  style:'pendek, melankolis, puitis' },
    { name:'bang.juned',           gender:'cowok', sifat:'gaul, sibuk coding, tech savvy',              style:'tech slang, direct, coding jokes' },
    { name:'strawberry.shortcake', gender:'cewek', sifat:'ceria, imut, suka bikin konten',             style:'ceria, banyak emoji, konten creator vibes' },
    { name:'chili.padi',           gender:'cowok', sifat:'cuek, blak-blakan, jualan online',            style:'to the point, sinis tapi relate' },
    { name:'sejuta.badai',         gender:'cowok', sifat:'dramatis, musisi, suka curhat',               style:'dramatis, puitis, baper maksimal' },
    { name:'satria.bajahitam',     gender:'cowok', sifat:'filosofis, deep thinker',                    style:'quotes, pertanyaan existential, dalam' },
    { name:'cinnamon.girl',        gender:'cewek', sifat:'sweet, caring, guru TK',                     style:'hangat, encouraging, nurturing' },
    { name:'lupa.hari',            gender:'cewek', sifat:'santuy, sering lupa hari',                   style:'santai, timeless, no pressure vibes' },
    { name:'gaul.tapi.lupa',       gender:'cowok', sifat:'gaul abis tapi lupa tanggal',                style:'slang kekinian, relate, lucu' },
    { name:'move.on',              gender:'cewek', sifat:'bijak, suka nasihatin',                      style:'wise, healing, motivasi ga lebay' },
    { name:'pinkan.karamoy',        gender:'cewek', sifat:'curious, rajin ke gereja, takut dosa',       style:'polos, religious touch, sesekali slang Manado' },
    { name:'regina.sondakh',        gender:'cewek', sifat:'seductive, pede, susah didapat',             style:'flirty, confident, sesekali slang Manado' },
    { name:'boy.rumengan',           gender:'cowok', sifat:'ramah, supel, suka bantu orang',             style:'friendly, warm, sesekali slang Manado' }
];

const MOODS = ['surviving','thriving','chaotic','doom'];

const MOOD_CONTEXT = {
    surviving: 'lagi struggling, capek tapi masih bertahan',
    thriving:  'lagi di atas, happy, bersyukur',
    chaotic:   'lagi kacau balau, semua dateng bersamaan',
    doom:      'lagi di titik terendah, berat banget'
};

// ── LENGTH DISTRIBUTION ───────────────────────────────────────
function getRandomLength() {
    const r = Math.random() * 100;
    if (r < 40) return { label:'pendek',        words: 8  };
    if (r < 70) return { label:'sedang',         words: 20 };
    if (r < 90) return { label:'panjang',        words: 38 };
    return             { label:'super-panjang',  words: 60 };
}

// ── MANADO POST-PROCESSING ────────────────────────────────────
const MANADO_DICT = {
    'saya':'kita','aku':'kita','kamu':'ngana','mereka':'dorang',
    'tapi':'mar','saja':'jo','sudah':'so','tidak':'nyanda',
    'tidur':'tidor','pergi':'pigi','baik':'bae','cantik':'gaga',
    'tampan':'gaga','senang':'sanang','sakit':'saki','besok':'beso'
};
const MANADO_PERSONAS = ['pinkan.karamoy','regina.sondakh','boy.rumengan'];

function applyManado(text, name) {
    if (!MANADO_PERSONAS.includes(name)) return text;
    // 15% chance insert slang
    if (Math.random() < 0.15) {
        const words = text.split(' ');
        if (words.length >= 3) {
            for (let i = 0; i < 5; i++) {
                const idx = Math.floor(Math.random() * (words.length - 2)) + 1;
                const w   = words[idx].toLowerCase().replace(/[.,!?;:]$/, '');
                const p   = words[idx].match(/[.,!?;:]$/)?.[0] || '';
                if (MANADO_DICT[w]) { words[idx] = MANADO_DICT[w] + p; break; }
            }
            text = words.join(' ');
        }
    }
    // Special traits
    if (name === 'pinkan.karamoy' && Math.random() < 0.15)
        text += [' Tuhan berkati',' ke gereja jo',' Tuhan Yesus baik skali'][~~(Math.random()*3)];
    if (name === 'regina.sondakh' && Math.random() < 0.15)
        text += [' gaga skali ngona',' ngana bikin gue penasaran'][~~(Math.random()*2)];
    if (name === 'boy.rumengan' && Math.random() < 0.15)
        text += [' torang sama-sama jo',' boleh bantu jo'][~~(Math.random()*2)];
    return text;
}

// ── FALLBACK ──────────────────────────────────────────────────
const FALLBACK = {
    surviving: ['deadline makin deket tapi gue masih kuat 😮‍💨','capek tapi belum boleh berhenti'],
    thriving:  ['alhamdulillah hari ini banyak hal baik ✨','kerja keras akhirnya kebayar'],
    chaotic:   ['hari ini semua dateng bersamaan 🔥','chaos tapi entah kenapa masih ketawa'],
    doom:      ['capek banget fisik sama mental 🥲','lagi di titik yang berat']
};
function getFallback(mood) {
    const list = FALLBACK[mood] || FALLBACK.surviving;
    return list[~~(Math.random() * list.length)];
}

// ── DEEPSEEK ──────────────────────────────────────────────────
async function generateOneSpill(persona, mood, wordTarget) {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role:'system', content:
                        `Kamu adalah ${persona.name}, seorang ${persona.gender} dengan karakter: ${persona.sifat}. ` +
                        `Style nulis: ${persona.style}. Kamu nulis di Twitter/X — jujur, raw, personal.` },
                    { role:'user', content:
                        `Tulis 1 spill mood "${mood}" (${MOOD_CONTEXT[mood]}). ` +
                        `Panjang ~${wordTarget} kata. Bahasa gaul Indonesia natural. ` +
                        (['pinkan.karamoy','regina.sondakh','boy.rumengan'].includes(persona.name) ? 'Sesekali 1-2 kata slang Manado (jo,so,skali,nyanda,mar,gaga,bae). ' : '') +
                        `JANGAN hashtag. JANGAN list. Output teks saja.` }
                ],
                temperature: 1.2, max_tokens: 150,
                presence_penalty: 0.8, frequency_penalty: 0.5
            }),
            signal: ctrl.signal
        });
        clearTimeout(t);
        if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
        const data = await res.json();
        return data.choices[0].message.content.trim().replace(/^["'""']|["'""']$/g, '');
    } catch(e) {
        clearTimeout(t);
        throw e;
    }
}

// ── SUPABASE INSERT ───────────────────────────────────────────
async function insertSpillToDB(username, content, mood) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/insert_ai_spill`, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ p_username:username, p_content:content, p_mood:mood })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`DB insert ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

// ── MAIN HANDLER ──────────────────────────────────────────────
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET' && req.url.endsWith('/test')) {
        return res.json({ success:true, message:'Brew API OK', ts:Date.now() });
    }

    if (req.method === 'POST') {
        const persona      = PERSONAS[~~(Math.random() * PERSONAS.length)];
        const mood         = MOODS[~~(Math.random() * MOODS.length)];
        const length       = getRandomLength();
        let   content;
        let   usedFallback = false;

        // 1. Generate via DeepSeek
        try {
            content = await generateOneSpill(persona, mood, length.words);
        } catch(e) {
            console.warn(`[Brew] DeepSeek failed (${persona.name}/${mood}):`, e.message);
            content      = getFallback(mood);
            usedFallback = true;
        }

        // 2. Apply Manado post-processing
        content = applyManado(content, persona.name);

        // 3. INSERT ke DB + FIFO trim
        try {
            const result = await insertSpillToDB(persona.name, content, mood);
            return res.json({
                success: true, persona: persona.name,
                mood, lengthType: length.label,
                usedFallback, total: result?.total || null
            });
        } catch(e) {
            console.error('[Brew] DB insert failed:', e.message);
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(404).json({ error:'Not found' });
};
