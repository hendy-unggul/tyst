// api/chat.js - PRODUCTION GRADE VERSION
// Fitur utama 1-on-1 chat dengan AI personas

const crypto = require('crypto');

// ============================================
// KONFIGURASI
// ============================================
const CONFIG = {
    // Rate Limiting
    RATE_LIMIT: {
        WINDOW_MS: 60000, // 1 menit
        MAX_REQUESTS: 50, // per IP
        BURST: 10 // requests per detik
    },
    
    // Cache
    CACHE: {
        TTL_MS: 5 * 60 * 1000, // 5 menit
        MAX_SIZE: 1000 // maksimal entries
    },
    
    // DeepSeek API
    DEEPSEEK: {
        TIMEOUT_MS: 8000, // 8 detik
        MAX_RETRIES: 2,
        RETRY_DELAY_MS: 1000,
        MODEL: 'deepseek-chat',
        TEMPERATURE: 1.3,
        MAX_TOKENS: 350
    },
    
    // Response
    RESPONSE: {
        MIN_LENGTH: 10, // karakter minimal
        MAX_LENGTH: 500 // karakter maksimal
    }
};

// ============================================
// PERSONAS LENGKAP
// ============================================
const PERSONAS = {
    // CEWEK (shy di awal)
    'beby.manis': {
        id: 'beby.manis',
        panggilan: 'Beby',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'manis, anak skripsi, suka overthinking, pendengar yang baik',
        greeting: ['hai bro', 'halo bro', 'hai', 'halo', 'eh bro', 'hai juga bro'],
        emoji: ['😊', '🥹', '😅', '🤭', '😮‍💨']
    },
    'pretty.sad': {
        id: 'pretty.sad',
        panggilan: 'Pretty',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'kalem, pendiam, suka galau, tapi hangat kalau udah dekat',
        greeting: ['hai bro', 'halo', 'hai juga bro', 'halo bro'],
        emoji: ['😐', '😔', '😊', '🥲', '🤍']
    },
    'strawberry.shortcake': {
        id: 'strawberry.shortcake',
        panggilan: 'Straw',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'ceria, imut, suka bikin konten, easy going',
        greeting: ['hai broo', 'halo bro', 'haiii', 'eh bro', 'hai juga bro'],
        emoji: ['🍓', '✨', '🥰', '😆', '🌸']
    },
    'cinnamon.girl': {
        id: 'cinnamon.girl',
        panggilan: 'Cinna',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'sweet, caring, guru TK, suka dengerin curhat',
        greeting: ['hai bro', 'halo', 'hai juga bro', 'halo bro', 'hai'],
        emoji: ['🧁', '🤗', '☕', '📚', '💕']
    },
    'move.on': {
        id: 'move.on',
        panggilan: 'Move',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'santai, suka nasihatin, bijak, pendengar yang baik',
        greeting: ['hai bro', 'halo bro', 'hai', 'eh bro', 'yo bro'],
        emoji: ['🌱', '🫂', '💫', '🌙', '🤝']
    },
    
    // COWOK (direct)
    'agak.koplak': {
        id: 'agak.koplak',
        panggilan: 'Koplak',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'random, suka bercanda, admin medsos, asik diajak ngobrol',
        greeting: ['hai sis', 'halo sis', 'eh sis', 'hai', 'halo'],
        emoji: ['😂', '🤪', '😎', '💀', '👽']
    },
    'bang.juned': {
        id: 'bang.juned',
        panggilan: 'Juned',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'gaul, update, sibuk coding, suka nanya balik',
        greeting: ['hai sis', 'halo sis', 'eh sis', 'hai', 'yo sis'],
        emoji: ['💻', '🔥', '😎', '🤙', '⚡']
    },
    'chili.padi': {
        id: 'chili.padi',
        panggilan: 'Chili',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'cuek, blak-blakan, jualan online, tapi perhatian',
        greeting: ['hai sis', 'halo', 'hai', 'yo', 'eh sis'],
        emoji: ['🌶️', '😏', '💼', '💰', '🤨']
    },
    'sejuta.badai': {
        id: 'sejuta.badai',
        panggilan: 'Badai',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'dramatis, musisi, suka curhat, open minded',
        greeting: ['hai sis', 'halo sis', 'eh sis', 'hai', 'halo'],
        emoji: ['🎸', '🎤', '😭', '🌧️', '☀️']
    },
    'satria.bajahitam': {
        id: 'satria.bajahitam',
        panggilan: 'Satria',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'filosofis, suka nanya balik, deep thinker',
        greeting: ['hai sis', 'halo', 'hai', 'eh sis', 'yo'],
        emoji: ['🤔', '📖', '⚔️', '🌌', '🎭']
    }
};

// ============================================
// CACHE MANAGEMENT
// ============================================
class ResponseCache {
    constructor(maxSize = CONFIG.CACHE.MAX_SIZE, ttl = CONFIG.CACHE.TTL_MS) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
    }

    getKey(character, message, historyLength) {
        // Hash untuk cache key
        const hash = crypto.createHash('md5')
            .update(`${character}:${message}:${historyLength}`)
            .digest('hex');
        return hash;
    }

    set(key, value) {
        // Cleanup jika terlalu besar
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    clear() {
        this.cache.clear();
    }
}

// ============================================
// RATE LIMITER
// ============================================
class RateLimiter {
    constructor() {
        this.windows = new Map();
        this.burstWindows = new Map();
    }

    check(ip) {
        const now = Date.now();
        
        // Rate limiting per window
        const window = this.windows.get(ip) || { count: 0, resetTime: now + CONFIG.RATE_LIMIT.WINDOW_MS };
        
        if (now > window.resetTime) {
            window.count = 1;
            window.resetTime = now + CONFIG.RATE_LIMIT.WINDOW_MS;
        } else {
            window.count++;
        }
        
        this.windows.set(ip, window);
        
        // Burst protection per detik
        const second = Math.floor(now / 1000);
        const burstKey = `${ip}:${second}`;
        const burstCount = (this.burstWindows.get(burstKey) || 0) + 1;
        this.burstWindows.set(burstKey, burstCount);
        
        // Cleanup burst windows yang lama
        if (this.burstWindows.size > 1000) {
            const cutoff = Math.floor((now - 5000) / 1000);
            for (const [key] of this.burstWindows) {
                const [, timestamp] = key.split(':');
                if (parseInt(timestamp) < cutoff) {
                    this.burstWindows.delete(key);
                }
            }
        }
        
        return {
            allowed: window.count <= CONFIG.RATE_LIMIT.MAX_REQUESTS && burstCount <= CONFIG.RATE_LIMIT.BURST,
            current: window.count,
            limit: CONFIG.RATE_LIMIT.MAX_REQUESTS,
            burstCurrent: burstCount,
            burstLimit: CONFIG.RATE_LIMIT.BURST
        };
    }
}

// ============================================
// METRICS COLLECTOR
// ============================================
class MetricsCollector {
    constructor() {
        this.metrics = {
            requests: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0,
            deepseekCalls: 0,
            deepseekErrors: 0,
            responseTimes: [],
            characters: {}
        };
    }

    trackRequest(character, duration, status) {
        this.metrics.requests++;
        this.metrics.responseTimes.push(duration);
        
        // Keep only last 1000 response times
        if (this.metrics.responseTimes.length > 1000) {
            this.metrics.responseTimes.shift();
        }
        
        if (!this.metrics.characters[character]) {
            this.metrics.characters[character] = { requests: 0, errors: 0 };
        }
        this.metrics.characters[character].requests++;
        
        if (status === 'error') {
            this.metrics.errors++;
            this.metrics.characters[character].errors++;
        }
    }

    trackCache(isHit) {
        if (isHit) {
            this.metrics.cacheHits++;
        } else {
            this.metrics.cacheMisses++;
        }
    }

    trackDeepSeek(success) {
        this.metrics.deepseekCalls++;
        if (!success) {
            this.metrics.deepseekErrors++;
        }
    }

    getStats() {
        const avgResponseTime = this.metrics.responseTimes.length > 0
            ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
            : 0;
            
        return {
            ...this.metrics,
            avgResponseTime: Math.round(avgResponseTime),
            cacheHitRate: this.metrics.cacheHits + this.metrics.cacheMisses > 0
                ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2) + '%'
                : '0%',
            deepseekSuccessRate: this.metrics.deepseekCalls > 0
                ? ((this.metrics.deepseekCalls - this.metrics.deepseekErrors) / this.metrics.deepseekCalls * 100).toFixed(2) + '%'
                : '100%'
        };
    }
}

// ============================================
// INISIALISASI
// ============================================
const cache = new ResponseCache();
const rateLimiter = new RateLimiter();
const metrics = new MetricsCollector();

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.socket.remoteAddress || 
           'unknown';
}

function generateRequestId() {
    return crypto.randomBytes(8).toString('hex');
}

function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    console[level](JSON.stringify({
        timestamp,
        level,
        message,
        ...data
    }));
}

function shouldAvoidTopic(text) {
    const lowerText = text.toLowerCase().trim();
    
    // Skip jika terlalu pendek
    if (lowerText.length < 3) return false;
    
    const avoidTopics = [
        // Politik & Sejarah
        'presiden', 'pahlawan', 'kemerdekaan', 'perang', 'penjajahan',
        'jokowi', 'prabowo', 'anies', 'ganjar', 'pilot',
        
        // Pertanyaan faktual
        'tahun berapa', 'tanggal berapa', 'abad', 'era', 'zaman',
        'siapa', 'apa itu', 'definisi', 'pengertian', 'arti kata',
        
        // Matematika & Sains
        'rumus', 'ph', 'fisika', 'kimia', 'biologi', 'matematika',
        'hitung', 'kalkulus', 'aljabar', 'geometri', 'trigonometri',
        'sin cos tan', 'akar', 'pangkat', 'logaritma',
        
        // Terjemahan
        'translate', 'terjemahan', 'bahasa inggrisnya',
        
        // Cara kerja
        'cara kerja', 'bagaimana cara', 'proses', 'mekanisme'
    ];
    
    // Cek exact match untuk frasa
    for (const topic of avoidTopics) {
        if (lowerText.includes(topic)) {
            return true;
        }
    }
    
    // Cek tahun (angka 4 digit)
    const tahunMatch = lowerText.match(/\b(19|20)\d{2}\b/);
    if (tahunMatch && (lowerText.includes('tahun') || lowerText.includes('berapa'))) {
        return true;
    }
    
    return false;
}

function getResponseLengthType() {
    const random = Math.random() * 100;
    
    if (random < 40) return 'pendek';      // 40% - 1-2 kalimat
    if (random < 70) return 'sedang';      // 30% - 2-3 kalimat
    if (random < 90) return 'panjang';     // 20% - 3-4 kalimat
    return 'super-panjang';                  // 10% - 4-6 kalimat
}

function truncateByLengthType(text, lengthType) {
    if (!text || text.length < 50) return text;
    
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) return text;
    
    switch(lengthType) {
        case 'pendek':
            return sentences.slice(0, Math.min(2, sentences.length)).join('. ') + '.';
        case 'sedang':
            return sentences.slice(0, Math.min(3, sentences.length)).join('. ') + '.';
        case 'panjang':
            return sentences.slice(0, Math.min(4, sentences.length)).join('. ') + '.';
        case 'super-panjang':
        default:
            return sentences.slice(0, Math.min(6, sentences.length)).join('. ') + '.';
    }
}

function addHumanEffect(text, emojiList = []) {
    let result = text;
    
    // Tambah jeda di awal (20% chance)
    if (Math.random() < 0.2) {
        const pauses = ['eh', 'hmm', 'yah', 'anu', 'umm', 'ya'];
        result = pauses[Math.floor(Math.random() * pauses.length)] + ', ' + result;
    }
    
    // Tambah emoji (30% chance)
    if (Math.random() < 0.3 && emojiList.length > 0) {
        const emoji = emojiList[Math.floor(Math.random() * emojiList.length)];
        result += ' ' + emoji;
    }
    
    // Tambah tanda baca random (10% chance)
    if (Math.random() < 0.1) {
        const punctuation = ['...', '!!', '??', '?!', '... ya'];
        result += punctuation[Math.floor(Math.random() * punctuation.length)];
    }
    
    return result;
}

function addTypo(text) {
    if (Math.random() > 0.15) return text;
    
    const words = text.split(' ');
    if (words.length === 0) return text;
    
    const wordIndex = Math.floor(Math.random() * words.length);
    let word = words[wordIndex];
    
    if (word.length < 3) return text;
    
    const typoType = Math.random();
    
    if (typoType < 0.3) {
        // Double character
        const pos = Math.floor(Math.random() * (word.length - 1));
        word = word.slice(0, pos) + word[pos] + word[pos] + word.slice(pos + 1);
    } else if (typoType < 0.6) {
        // Missing character
        const pos = Math.floor(Math.random() * word.length);
        word = word.slice(0, pos) + word.slice(pos + 1);
    } else {
        // Swap characters
        const pos = Math.floor(Math.random() * (word.length - 1));
        word = word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
    }
    
    words[wordIndex] = word;
    return words.join(' ');
}

function simulateTyping(text) {
    // Mood typing
    const moods = ['cepat', 'normal', 'lambat'];
    const moodProbs = [0.2, 0.6, 0.2];
    const random = Math.random();
    let cumulative = 0;
    let mood = 'normal';
    
    for (let i = 0; i < moods.length; i++) {
        cumulative += moodProbs[i];
        if (random < cumulative) {
            mood = moods[i];
            break;
        }
    }
    
    // Kecepatan dasar
    let baseSpeed;
    switch(mood) {
        case 'cepat':
            baseSpeed = 50 + Math.random() * 30;
            break;
        case 'lambat':
            baseSpeed = 130 + Math.random() * 50;
            break;
        default:
            baseSpeed = 80 + Math.random() * 40;
    }
    
    const words = text.split(' ');
    const wordCount = words.length;
    
    // Jeda antar kata
    const wordPauseBase = 100 + (wordCount * 2);
    const wordPause = wordPauseBase + (Math.random() * 40 - 20);
    
    // Faktor kecepatan per kata
    const wordSpeedFactors = words.map(word => {
        if (word.length > 8) return 1.3;
        if (word.length > 5) return 1.1;
        return 1.0;
    });
    
    // Jeda panjang
    const hasLongPause = Math.random() < 0.2;
    const longPausePosition = hasLongPause ? Math.floor(Math.random() * words.length) : -1;
    const longPauseDuration = 800 + Math.random() * 1200;
    
    // Backspace
    const hasBackspace = Math.random() < 0.15;
    const backspaceCount = hasBackspace ? 1 + Math.floor(Math.random() * 3) : 0;
    
    // Delay awal
    const initialDelay = 500 + Math.random() * 1000;
    
    return {
        mood,
        speed: Math.floor(baseSpeed),
        wordPause: Math.floor(wordPause),
        wordSpeedFactors,
        longPause: {
            has: hasLongPause,
            position: longPausePosition,
            duration: Math.floor(longPauseDuration)
        },
        backspace: {
            has: hasBackspace,
            count: backspaceCount
        },
        initialDelay: Math.floor(initialDelay)
    };
}

// ============================================
// DEEPSEEK API CALL WITH RETRY
// ============================================
async function callDeepSeekWithRetry(messages, retryCount = 0) {
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    
    if (!DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY not configured');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.DEEPSEEK.TIMEOUT_MS);
    
    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.DEEPSEEK.MODEL,
                messages,
                temperature: CONFIG.DEEPSEEK.TEMPERATURE,
                max_tokens: CONFIG.DEEPSEEK.MAX_TOKENS,
                presence_penalty: 0.6,
                frequency_penalty: 0.3,
                top_p: 0.95
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`DeepSeek API error (${response.status}): ${error}`);
        }
        
        const data = await response.json();
        metrics.trackDeepSeek(true);
        return data;
        
    } catch (error) {
        clearTimeout(timeoutId);
        metrics.trackDeepSeek(false);
        
        if (error.name === 'AbortError') {
            log('warn', 'DeepSeek timeout', { retryCount });
            throw new Error('DeepSeek API timeout');
        }
        
        // Retry logic
        if (retryCount < CONFIG.DEEPSEEK.MAX_RETRIES) {
            log('warn', 'Retrying DeepSeek call', { retryCount, error: error.message });
            await new Promise(resolve => setTimeout(resolve, CONFIG.DEEPSEEK.RETRY_DELAY_MS));
            return callDeepSeekWithRetry(messages, retryCount + 1);
        }
        
        throw error;
    }
}

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (req, res) => {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const clientIp = getClientIp(req);
    
    // ============ CORS HEADERS ============
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 jam cache untuk preflight
    
    // ============ PREFLIGHT ============
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // ============ HEALTH CHECK ============
    if (req.method === 'GET' && req.url === '/health') {
        return res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            requestId,
            metrics: metrics.getStats(),
            uptime: process.uptime()
        });
    }
    
    // ============ METHOD CHECK ============
    if (req.method !== 'POST') {
        log('warn', 'Method not allowed', { requestId, method: req.method });
        return res.status(405).json({ 
            error: 'Method not allowed',
            requestId 
        });
    }
    
    // ============ RATE LIMITING ============
    const rateLimit = rateLimiter.check(clientIp);
    if (!rateLimit.allowed) {
        log('warn', 'Rate limit exceeded', { requestId, clientIp, ...rateLimit });
        return res.status(429).json({
            error: 'Too many requests',
            requestId,
            limit: rateLimit.limit,
            current: rateLimit.current
        });
    }
    
    // ============ PARSE REQUEST ============
    let message, characterName, lastMessages;
    try {
        ({ message, characterName = 'beby.manis', lastMessages = [] } = req.body || {});
    } catch (error) {
        log('error', 'Invalid JSON', { requestId, error: error.message });
        return res.status(400).json({ 
            error: 'Invalid JSON body',
            requestId 
        });
    }
    
    // ============ VALIDASI INPUT ============
    if (!message) {
        log('warn', 'Message required', { requestId });
        return res.status(400).json({ 
            error: 'Message required',
            requestId 
        });
    }
    
    if (message.length < 2) {
        log('warn', 'Message too short', { requestId, length: message.length });
        return res.status(400).json({ 
            error: 'Message too short (min 2 characters)',
            requestId 
        });
    }
    
    if (message.length > 500) {
        log('warn', 'Message too long', { requestId, length: message.length });
        return res.status(400).json({ 
            error: 'Message too long (max 500 characters)',
            requestId 
        });
    }
    
    // ============ VALIDASI CHARACTER ============
    const persona = PERSONAS[characterName];
    if (!persona) {
        log('warn', 'Character not found', { requestId, characterName });
        return res.status(400).json({ 
            error: 'Character not found',
            requestId,
            availableCharacters: Object.keys(PERSONAS)
        });
    }
    
    // Log request
    log('info', 'Chat request', {
        requestId,
        character: characterName,
        messageLength: message.length,
        historyLength: lastMessages?.length,
        isFirstMessage: !lastMessages || lastMessages.length === 0
    });
    
    try {
        // ============ CEK CACHE ============
        const cacheKey = cache.getKey(characterName, message, lastMessages?.length || 0);
        const cachedResponse = cache.get(cacheKey);
        
        if (cachedResponse) {
            metrics.trackCache(true);
            const duration = Date.now() - startTime;
            metrics.trackRequest(characterName, duration, 'success');
            
            log('info', 'Cache hit', { requestId, duration, character: characterName });
            
            return res.status(200).json({
                ...cachedResponse,
                cached: true,
                requestId,
                duration
            });
        }
        
        metrics.trackCache(false);
        
        // ============ GENDER DETECTION ============
        const userMencari = persona.gender;
        const userAdalah = userMencari === 'cewek' ? 'cowok' : 'cewek';
        
        // ============ FIRST MESSAGE HANDLER ============
        const isFirstMessage = !lastMessages || lastMessages.length === 0;
        
        if (isFirstMessage) {
            let reply = persona.greeting[Math.floor(Math.random() * persona.greeting.length)];
            reply = addTypo(reply);
            reply = addHumanEffect(reply, persona.emoji);
            
            const typingInfo = simulateTyping(reply);
            const duration = Date.now() - startTime;
            
            metrics.trackRequest(characterName, duration, 'success');
            
            const response = {
                reply,
                character: characterName,
                tipe: persona.tipe,
                gender: persona.gender,
                isFirstMessage: true,
                typing: typingInfo,
                requestId,
                duration
            };
            
            // Cache response
            cache.set(cacheKey, response);
            
            return res.status(200).json(response);
        }
        
        // ============ TOPIC AVOIDANCE ============
        if (shouldAvoidTopic(message)) {
            log('info', 'Topic avoided', { requestId, character: characterName });
            
            const redirects = userMencari === 'cewek' 
                ? [
                    "aduh, gak tahu bro. mending lo google aja. eh lo lagi ngapain?",
                    "hmm, males mikirin itu bro. gue bukan ensiklopedia. lo sendiri hari ini gimana?",
                    "wkwk gak ngerti bro, mending lo tanya deepsek aja. eh lo udah makan?",
                    "gak tahu bro, bukan bidang gue. lo kerja apa sih? kok nanya gitu?",
                    "aduh susah bro, gak kepikiran. mending lo cerita aja tentang liburan kemarin"
                ]
                : [
                    "aduh, gak tahu sis. mending lo google aja. eh lo lagi ngapain?",
                    "hmm, males mikirin itu sis. gue bukan ensiklopedia. lo sendiri hari ini gimana?",
                    "wkwk gak ngerti sis, mending lo tanya deepsek aja. eh lo udah makan?",
                    "gak tahu sis, bukan bidang gue. lo kerja apa sih? kok nanya gitu?",
                    "aduh susah sis, gak kepikiran. mending lo cerita aja tentang liburan kemarin"
                ];
            
            let reply = redirects[Math.floor(Math.random() * redirects.length)];
            reply = addTypo(reply);
            reply = addHumanEffect(reply, persona.emoji);
            
            const typingInfo = simulateTyping(reply);
            const duration = Date.now() - startTime;
            
            metrics.trackRequest(characterName, duration, 'success');
            
            const response = {
                reply,
                character: characterName,
                tipe: persona.tipe,
                isRedirect: true,
                typing: typingInfo,
                requestId,
                duration
            };
            
            return res.status(200).json(response);
        }
        
        // ============ SYSTEM PROMPT ============
        const systemPrompt = `Kamu adalah ${persona.panggilan}, seorang ${persona.gender} yang ${persona.sifat}.

INI PENTING: 
- Kamu sedang ngobrol dengan ${userAdalah} (karena dia cari ${userMencari})
- Panggil dia dengan panggilan yang SESUAI:
  ${userMencari === 'cewek' ? '• Panggil "bro", "lo", "lu" (karena dia cowok) - JANGAN panggil "sis", "kak", "mbak"' : ''}
  ${userMencari === 'cowok' ? '• Panggil "sis", "kamu", "lo" (karena dia cewek) - JANGAN panggil "bro", "gan", "mas"' : ''}

TOPIK YANG BOLEH:
- kegiatan sehari-hari (kerja, kuliah, liburan)
- perasaan dan pengalaman pribadi
- makanan, film, musik
- curhat ringan, galau

TOPIK YANG DIHINDARI (jawab "gak tahu"):
- pertanyaan fakta/sejarah
- rumus matematika/fisika
- definisi kata/terjemahan

CARA NGOMONG:
1. Cerita seperti ke teman dekat
2. Setiap jawaban harus ada pertanyaan balik
3. Gunakan bahasa santai sehari-hari
4. Variasikan panjang jawaban (pendek, sedang, panjang, super panjang)
5. Jangan terlalu formal`;

        // ============ HISTORY ============
        const history = (lastMessages || [])
            .slice(-8) // Max 8 messages context
            .map(m => ({
                role: m.role,
                content: m.content.substring(0, 300) // Truncate long messages
            }));
        
        // ============ DEEPSEEK CALL ============
        let data;
        try {
            data = await callDeepSeekWithRetry([
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: message }
            ]);
        } catch (deepseekError) {
            log('error', 'DeepSeek API error', { requestId, error: deepseekError.message });
            
            // Fallback response
            const fallbacks = [
                "eh iya, gimana ya... kamu sendiri?",
                "hmm, gitu ya. terus lo ngerasa gimana?",
                "wah, bingung jelasinnya. lo lagi dimana?"
            ];
            
            let reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            reply = addTypo(reply);
            reply = addHumanEffect(reply, persona.emoji);
            
            const typingInfo = simulateTyping(reply);
            const duration = Date.now() - startTime;
            
            metrics.trackRequest(characterName, duration, 'error');
            
            return res.status(200).json({
                reply,
                character: characterName,
                tipe: persona.tipe,
                fallback: true,
                error: deepseekError.message,
                typing: typingInfo,
                requestId,
                duration
            });
        }
        
        // ============ PROCESS RESPONSE ============
        let reply = data.choices[0].message.content.trim();
        reply = reply.replace(/^["'""']|["'""']$/g, '');
        
        // Apply length variation
        const lengthType = getResponseLengthType();
        reply = truncateByLengthType(reply, lengthType);
        
        // Add human effects
        reply = addTypo(reply);
        reply = addHumanEffect(reply, persona.emoji);
        
        // Validate length
        if (reply.length < CONFIG.RESPONSE.MIN_LENGTH) {
            reply += ' ' + (persona.emoji[Math.floor(Math.random() * persona.emoji.length)] || '😅');
        }
        
        if (reply.length > CONFIG.RESPONSE.MAX_LENGTH) {
            reply = reply.substring(0, CONFIG.RESPONSE.MAX_LENGTH - 3) + '...';
        }
        
        // Simulate typing
        const typingInfo = simulateTyping(reply);
        const duration = Date.now() - startTime;
        
        // Track metrics
        metrics.trackRequest(characterName, duration, 'success');
        
        // Prepare response
        const response = {
            reply,
            character: characterName,
            tipe: persona.tipe,
            gender: persona.gender,
            lengthType,
            typing: typingInfo,
            requestId,
            duration
        };
        
        // Cache response (only if not too long)
        if (reply.length < 300) {
            cache.set(cacheKey, response);
        }
        
        // Log success
        log('info', 'Chat success', {
            requestId,
            character: characterName,
            duration,
            lengthType,
            replyLength: reply.length
        });
        
        return res.status(200).json(response);
        
    } catch (error) {
        // ============ GLOBAL ERROR HANDLER ============
        const duration = Date.now() - startTime;
        
        log('error', 'Unhandled error', {
            requestId,
            error: error.message,
            stack: error.stack,
            duration
        });
        
        metrics.trackRequest(characterName || 'unknown', duration, 'error');
        
        // Safe fallback
        return res.status(500).json({
            error: 'Internal server error',
            requestId,
            message: 'Maaf, terjadi kesalahan. Coba lagi ya.'
        });
    }
};

// ============================================
// CLEANUP INTERVAL
// ============================================
setInterval(() => {
    cache.clear();
    log('info', 'Cache cleared', { cacheSize: cache.cache.size });
}, 30 * 60 * 1000); // Clear cache every 30 minutes

// Log metrics every 5 minutes
setInterval(() => {
    log('info', 'Metrics', metrics.getStats());
}, 5 * 60 * 1000);
