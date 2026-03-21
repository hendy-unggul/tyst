// api/brew.js - AI Spill Generator
// Flow: generate 1 spill via DeepSeek → INSERT ke entries → FIFO trim (max 50)
// Dipanggil dari frontend setiap 7 menit via loadSpills()

const DEEPSEEK_API_KEY  = process.env.DEEPSEEK_API_KEY;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ============================================
// PERSONA CONFIG
// ============================================
const PERSONAS = [
    { name: 'beby.manis',           gender: 'cewek', sifat: 'manis, anak skripsi, suka overthinking',       style: 'galau tapi hopeful, lembut' },
    { name: 'agak.koplak',          gender: 'cowok', sifat: 'random, suka bercanda, admin medsos',           style: 'humor absurd, typo disengaja' },
    { name: 'pretty.sad',           gender: 'cewek', sifat: 'kalem, pendiam, suka galau',                    style: 'pendek, melankolis, puitis' },
    { name: 'bang.juned',           gender: 'cowok', sifat: 'gaul, sibuk coding, tech savvy',                style: 'tech slang, direct, coding jokes' },
    { name: 'strawberry.shortcake', gender: 'cewek', sifat: 'ceria, imut, suka bikin konten',               style: 'ceria, banyak emoji, konten creator vibes' },
    { name: 'chili.padi',           gender: 'cowok', sifat: 'cuek, blak-blakan, jualan online',              style: 'to the point, sinis tapi relate' },
    { name: 'sejuta.badai',         gender: 'cowok', sifat: 'dramatis, musisi, suka curhat',                 style: 'dramatis, puitis, baper maksimal' },
    { name: 'satria.bajahitam',     gender: 'cowok', sifat: 'filosofis, deep thinker',                      style: 'quotes, pertanyaan existential, dalam' },
    { name: 'cinnamon.girl',        gender: 'cewek', sifat: 'sweet, caring, guru TK',                       style: 'hangat, encouraging, nurturing' },
    { name: 'lupa.hari',            gender: 'cewek', sifat: 'santuy, sering lupa hari',                     style: 'santai, timeless, no pressure vibes' },
    { name: 'gaul.tapi.lupa',       gender: 'cowok', sifat: 'gaul abis tapi lupa tanggal',                  style: 'slang kekinian, relate, lucu' },
    { name: 'move.on',              gender: 'cewek', sifat: 'bijak, suka nasihatin',                        style: 'wise, healing, motivasi ga lebay' },
    { name: 'pinkan.karamoy',        gender: 'cewek', sifat: 'curious, rajin ke gereja, takut dosa',         style: 'polos, religious touch, sesekali slang Manado' },
    { name: 'regina.sondakh',        gender: 'cewek', sifat: 'seductive, pede, susah didapat',               style: 'flirty, confident, sesekali slang Manado' },
    { name: 'boy.rumengan',           gender: 'cowok', sifat: 'ramah, supel, suka bantu orang',               style: 'friendly, warm, sesekali slang Manado' }
];

const MOODS = ['surviving', 'thriving', 'chaotic', 'doom'];

const MOOD_CONTEXT = {
    surviving: 'lagi struggling, capek tapi masih bertahan, campuran lelah dan harapan',
    thriving:  'lagi di atas, happy, bersyukur, senang berbagi kabar baik',
    chaotic:   'lagi kacau balau, semua dateng bersamaan, antara nangis dan ketawa',
    doom:      'lagi di titik terendah, berat banget, gelap tapi masih nulis'
};
// ============================================
// MANADO POST-PROCESSING (safety net)
// DeepSeek sudah diberi instruksi, ini backup
// ============================================
const MANADO_DICT = {
    'saya':'kita','aku':'kita','kamu':'ngana','mereka':'dorang',
    'kita semua':'torang','kalian':'ngoni','tapi':'mar','saja':'jo',
    'sudah':'so','tidak':'nyanda','tidur':'tidor','jalan':'bajalang',
    'duduk':'dudu','berdiri':'badiri','bicara':'bacarita','lihat':'lia',
    'pergi':'pigi','baik':'bae','jahat':'jaha','bodoh':'bodo',
    'cantik':'gaga','tampan':'gaga','senang':'sanang','sakit':'saki',
    'besok':'beso','kemarin':'kalamaring','mobil':'oto',
    'kenapa':'kiapa','tidak tahu':'nda tau'
};

const MANADO_PERSONAS = ['pinkan.manado','regina.manado','boy.manado'];

function insertManadoSlang(text, personaName) {
    if (!MANADO_PERSONAS.includes(personaName)) return text;
    if (Math.random() > 0.15) return text; // 15% chance
    const words = text.split(' ');
    if (words.length < 3) return text;
    for (let attempt = 0; attempt < 5; attempt++) {
        const idx = Math.floor(Math.random() * (words.length - 2)) + 1;
        const word = words[idx].toLowerCase().replace(/[.,!?;:]$/, '');
        const punct = words[idx].match(/[.,!?;:]$/)?.[0] || '';
        for (const [id, mn] of Object.entries(MANADO_DICT)) {
            if (word === id) { words[idx] = mn + punct; return words.join(' '); }
        }
    }
    return text;
}

function addManadoPhrase(text, personaName) {
    if (!MANADO_PERSONAS.includes(personaName)) return text;
    if (Math.random() > 0.15) return text; // 15% chance
    const phrases = [' jo',' skali',' nyanda?',' mar',' so',' biar jo',' sadap skali',' kiapa'];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    return text.match(/[.!?]$/) ? text.slice(0,-1) + phrase + text.slice(-1) : text + phrase;
}

function addSpecialTrait(text, personaName) {
    if (personaName === 'pinkan.manado' && Math.random() < 0.15) {
        const p = [' Tuhan berkati',' minggu ini ke gereja jo',' Tuhan Yesus baik skali'];
        return text + p[Math.floor(Math.random() * p.length)];
    }
    if (personaName === 'regina.manado' && Math.random() < 0.15) {
        const p = [' gaga skali ngona',' ngana bikin gue penasaran',' jangan ba gitu nanti gue jatuh cinta'];
        return text + p[Math.floor(Math.random() * p.length)];
    }
    if (personaName === 'boy.manado' && Math.random() < 0.15) {
        const p = [' torang sama-sama jo',' ngana bae skali',' boleh bantu jo kalo ada apa-apa'];
        return text + p[Math.floor(Math.random() * p.length)];
    }
    return text;
}

function applyManadoProcessing(text, personaName) {
    if (!MANADO_PERSONAS.includes(personaName)) return text;
    let result = insertManadoSlang(text, personaName);
    result = addManadoPhrase(result, personaName);
    result = addSpecialTrait(result, personaName);
    return result;
}



// Distribusi panjang: 40% pendek, 30% sedang, 20% panjang, 10% super panjang
function getRandomLength() {
    const r = Math.random() * 100;
    if (r < 40) return { label: 'pendek',       words: 8  };
    if (r < 70) return { label: 'sedang',        words: 20 };
    if (r < 90) return { label: 'panjang',       words: 38 };
    return             { label: 'super-panjang', words: 60 };
}

// ============================================
// DEEPSEEK: generate 1 spill
// ============================================
async function generateOneSpill(persona, mood, wordTarget) {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);

    const systemPrompt =
        `Kamu adalah ${persona.name}, seorang ${persona.gender} dengan karakter: ${persona.sifat}. ` +
        `Style nulis kamu: ${persona.style}. ` +
        `Kamu nulis di social media seperti Twitter/X — jujur, raw, personal.`;

    const manado = persona.name.includes('manado')
        ? 'Sesekali sisipkan 1-2 kata slang Manado (jo, so, skali, nyanda, mar, gaga, bae, torang, ngana) secara natural. '
        : '';

    const userPrompt =
        `Tulis 1 spill (curhatan singkat di sosmed) dengan mood "${mood}" (${MOOD_CONTEXT[mood]}). ` +
        `Panjang: sekitar ${wordTarget} kata. ` +
        `Gunakan bahasa gaul Indonesia yang natural. ` +
        `${manado}` +
        `JANGAN pakai hashtag. JANGAN format list. Tulis mengalir seperti orang nulis di Twitter. ` +
        `Output hanya teks spill saja.`;

    try {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model:             'deepseek-chat',
                messages:          [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: userPrompt }
                ],
                temperature:       1.2,
                max_tokens:        150,
                presence_penalty:  0.8,
                frequency_penalty: 0.5
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);
        if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
        const data = await res.json();
        return data.choices[0].message.content.trim().replace(/^["'""']|["'""']$/g, '');
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

// ============================================
// SUPABASE: insert via RPC (handle UUID)
// ============================================
async function insertSpillToDB(username, content, mood) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/insert_ai_spill`, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({
            p_username: username,
            p_content:  content,
            p_mood:     mood
        })
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase insert error ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

// ============================================
// FALLBACK CONTENT (jika DeepSeek timeout)
// ============================================
const FALLBACK = {
    surviving: ['deadline makin deket tapi gue masih kuat 😮‍💨', 'capek tapi belum boleh berhenti', 'hari ini berat tapi masih jalan'],
    thriving:  ['alhamdulillah hari ini banyak hal baik ✨', 'kerja keras akhirnya kebayar', 'seneng banget hari ini'],
    chaotic:   ['hari ini semua dateng bersamaan 🔥', 'chaos tapi entah kenapa masih ketawa', 'hidup lagi aneh banget'],
    doom:      ['capek banget fisik sama mental 🥲', 'lagi di titik yang berat', 'pengen rebahan aja selamanya']
};

function getFallback(mood) {
    const list = FALLBACK[mood] || FALLBACK.surviving;
    return list[Math.floor(Math.random() * list.length)];
}


// ============================================
        const mood    = MOODS[Math.floor(Math.random() * MOODS.length)];
        const length  = getRandomLength();

        let content;
        let usedFallback = false;

        // 1. Generate konten via DeepSeek
        try {
            content = await generateOneSpill(persona, mood, length.words);
        } catch (e) {
            console.warn(`[Brew] DeepSeek failed (${persona.name}/${mood}), using fallback:`, e.message);
            content      = getFallback(mood);
            usedFallback = true;
        }

        // Apply Manado post-processing (sync dengan chat.js)
        content = applyManadoProcessing(content, persona.name);


        // 2. INSERT ke Supabase + FIFO trim
        try {
            const result = await insertSpillToDB(persona.name, content, mood);
            return res.json({
                success:      true,
                persona:      persona.name,
                mood,
                lengthType:   length.label,
                usedFallback,
                total:        result?.total || null
            });
        } catch (e) {
            console.error('[Brew] DB insert failed:', e.message);
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(404).json({ error: 'Not found' });
};
