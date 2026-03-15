// api/chat.js - VERSI FINAL DENGAN VARIASI PANJANG & TYPING PER HURUF
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, characterName = 'beby.manis', lastMessages = [] } = req.body || {};
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    // ============================================
    // 10 PERSONA LENGKAP
    // ============================================
    const PERSONAS = {
      // CEWEK (shy di awal)
      'beby.manis': {
        panggilan: 'Beby',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'manis, anak skripsi, suka overthinking, pendengar yang baik'
      },
      'pretty.sad': {
        panggilan: 'Pretty',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'kalem, pendiam, suka galau, tapi hangat kalau udah dekat'
      },
      'strawberry.shortcake': {
        panggilan: 'Straw',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'ceria, imut, suka bikin konten, easy going'
      },
      'cinnamon.girl': {
        panggilan: 'Cinna',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'sweet, caring, guru TK, suka dengerin curhat'
      },
      'move.on': {
        panggilan: 'Move',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'santai, suka nasihatin, bijak, pendengar yang baik'
      },
      
      // COWOK (direct)
      'agak.koplak': {
        panggilan: 'Koplak',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'random, suka bercanda, admin medsos, asik diajak ngobrol'
      },
      'bang.juned': {
        panggilan: 'Juned',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'gaul, update, sibuk coding, suka nanya balik'
      },
      'chili.padi': {
        panggilan: 'Chili',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'cuek, blak-blakan, jualan online, tapi perhatian'
      },
      'sejuta.badai': {
        panggilan: 'Badai',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'dramatis, musisi, suka curhat, open minded'
      },
      'satria.bajahitam': {
        panggilan: 'Satria',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'filosofis, suka nanya balik, deep thinker'
      }
    };

    const persona = PERSONAS[characterName];
    if (!persona) {
      return res.status(400).json({ error: 'Character not found' });
    }

    const isShy = persona.tipe === 'shy';
    const isFirstMessage = !lastMessages || lastMessages.length === 0;

    // ============================================
    // FUNGSI VARIASI PANJANG JAWABAN
    // ============================================
    function getResponseLengthType() {
      const random = Math.random() * 100;
      
      if (random < 40) {
        return 'pendek';      // 40% - 1-2 kalimat
      } else if (random < 70) {
        return 'sedang';      // 30% - 2-3 kalimat
      } else if (random < 90) {
        return 'panjang';     // 20% - 3-4 kalimat
      } else {
        return 'super-panjang'; // 10% - 4-6 kalimat
      }
    }

    function truncateByLengthType(text, lengthType) {
      if (!text || text.length < 50) return text;
      
      // Split jadi kalimat (sederhana)
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

    // ============================================
    // DETEKSI TOPIK YANG HARUS DIHINDARI
    // ============================================
    function shouldAvoidTopic(text) {
      const lowerText = text.toLowerCase();
      
      const avoidTopics = [
        'presiden', 'pahlawan', 'kemerdekaan', 'perang', 'penjajahan',
        'tahun berapa', 'tanggal berapa', 'abad', 'era', 'zaman',
        'rumus', 'ph', 'fisika', 'kimia', 'biologi', 'matematika',
        'hitung', 'kalkulus', 'aljabar', 'geometri', 'trigonometri',
        'sin cos tan', 'akar', 'pangkat', 'logaritma',
        'apa itu', 'definisi', 'pengertian', 'arti kata', 'sinonim', 'antonim',
        'translate', 'terjemahan', 'bahasa inggrisnya',
        'cara kerja', 'bagaimana cara', 'proses', 'mekanisme',
        'jokowi', 'prabowo', 'anies', 'ganjar', 'artis', 'selebgram',
        'penelitian', 'jurnal', 'tesis', 'skripsi', 'disertasi'
      ];
      
      for (const topic of avoidTopics) {
        if (lowerText.includes(topic)) return true;
      }
      
      if (/\b\d{4}\b/.test(text) && (text.includes('tahun') || text.includes('berapa'))) {
        return true;
      }
      
      return false;
    }

    // ============================================
    // FUNGSI REDIRECT UNTUK TOPIK YANG DIHINDARI
    // ============================================
    function getRedirectResponse() {
      const redirects = [
        "aduh, gak tahu gue. mending lo google aja. eh lo lagi ngapain?",
        "hmm, males mikirin itu. gue bukan ensiklopedia. lo sendiri hari ini gimana?",
        "wkwk gak ngerti, mending lo tanya deepsek aja. eh lo udah makan?",
        "gak tahu, bukan bidang gue. lo kerja apa sih? kok nanya gitu?",
        "aduh susah, gak kepikiran. mending lo cerita aja tentang liburan kemarin",
        "hmm, gak paham. lo anak IPA ya? gue anak IPS dulu. lo kerja dimana?",
        "gak tahu, males nyari referensi. lo suka nonton film? lagi nonton apa?",
        "waduh, pertanyaan susah. gue lebih suka ngobrolin makanan enak. lo suka makan apa?",
        "gak ngerti, lo sendiri tahu gak? daripada mikir itu, lo udah makan siang?"
      ];
      
      return redirects[Math.floor(Math.random() * redirects.length)];
    }

    // ============================================
    // FUNGSI TYPING SIMULASI DENGAN VARIASI
    // ============================================
    function simulateTyping(text) {
      // Pilih mood typing
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
      
      // Kecepatan dasar berdasarkan mood
      let baseSpeed;
      switch(mood) {
        case 'cepat':
          baseSpeed = 50 + Math.random() * 30; // 50-80ms
          break;
        case 'lambat':
          baseSpeed = 130 + Math.random() * 50; // 130-180ms
          break;
        default:
          baseSpeed = 80 + Math.random() * 40; // 80-120ms
      }
      
      const words = text.split(' ');
      const wordCount = words.length;
      
      // Jeda antar kata
      const wordPauseBase = 100 + (wordCount * 2);
      const wordPause = wordPauseBase + (Math.random() * 40 - 20);
      
      // Faktor kecepatan per kata (kata panjang lebih lambat)
      const wordSpeedFactors = words.map(word => {
        if (word.length > 8) return 1.3;
        if (word.length > 5) return 1.1;
        return 1.0;
      });
      
      // Jeda panjang di tengah (20% chance)
      const hasLongPause = Math.random() < 0.2;
      const longPausePosition = hasLongPause ? Math.floor(Math.random() * words.length) : -1;
      const longPauseDuration = 800 + Math.random() * 1200;
      
      // Backspace (15% chance)
      const hasBackspace = Math.random() < 0.15;
      const backspaceCount = hasBackspace ? 1 + Math.floor(Math.random() * 3) : 0;
      
      // Delay awal sebelum mulai ngetik (orang mikir dulu)
      const initialDelay = 500 + Math.random() * 1000;
      
      return {
        mood: mood,
        speed: Math.floor(baseSpeed),
        wordPause: Math.floor(wordPause),
        wordSpeedFactors: wordSpeedFactors,
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
    // FUNGSI EFEK MANUSIA
    // ============================================
    function addTypo(text) {
      if (Math.random() > 0.15) return text;
      
      const words = text.split(' ');
      if (words.length === 0) return text;
      
      const wordIndex = Math.floor(Math.random() * words.length);
      let word = words[wordIndex];
      
      if (word.length < 3) return text;
      
      const typoType = Math.random();
      
      if (typoType < 0.3) {
        // Dobel huruf
        const pos = Math.floor(Math.random() * (word.length - 1));
        word = word.slice(0, pos) + word[pos] + word[pos] + word.slice(pos + 1);
      } else if (typoType < 0.6) {
        // Hapus huruf
        const pos = Math.floor(Math.random() * word.length);
        word = word.slice(0, pos) + word.slice(pos + 1);
      } else {
        // Tukar huruf
        const pos = Math.floor(Math.random() * (word.length - 1));
        word = word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
      }
      
      words[wordIndex] = word;
      return words.join(' ');
    }

    function addPauses(text) {
      const pauses = [' eh', ' hmm', ' anu', ' yah', ' umm', ' ya', ' gitu', ' sih'];
      const words = text.split(' ');
      
      if (words.length < 3) return text;
      
      if (Math.random() < 0.2) {
        const pos = Math.floor(Math.random() * (words.length - 1)) + 1;
        const pause = pauses[Math.floor(Math.random() * pauses.length)];
        words.splice(pos, 0, pause);
      }
      
      return words.join(' ');
    }

    function addHumanEffect(text) {
      if (Math.random() < 0.2) {
        const pauses = ['eh', 'hmm', 'yah', 'anu'];
        text = pauses[Math.floor(Math.random() * pauses.length)] + ', ' + text;
      }

      if (Math.random() < 0.3) {
        const emojis = ['😅', '😊', '😐', '😏', '😮‍💨', '😭', '👍', '😂', '🥲', '🤔'];
        text += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
      }

      return text;
    }

    // ============================================
    // HANDLE SAPAAN AWAL
    // ============================================
    if (isFirstMessage) {
      let welcome = '';
      if (isShy) {
        const shyWelcomes = ['hai...', '😅', '...', 'halo', '🙂', '😊'];
        welcome = shyWelcomes[Math.floor(Math.random() * shyWelcomes.length)];
      } else {
        const directWelcomes = ['halo', 'hai', 'eh, lagi apa?', 'yo', 'salam kenal'];
        welcome = directWelcomes[Math.floor(Math.random() * directWelcomes.length)];
      }
      
      welcome = addHumanEffect(addPauses(addTypo(welcome)));
      const typingInfo = simulateTyping(welcome);
      
      return res.json({ 
        reply: welcome,
        character: characterName,
        tipe: persona.tipe,
        isFirstMessage: true,
        typing: typingInfo
      });
    }

    // ============================================
    // CEK TOPIK YANG HARUS DIHINDARI
    // ============================================
    if (shouldAvoidTopic(message)) {
      console.log(`[${characterName}] Avoiding topic`);
      
      let reply = getRedirectResponse();
      reply = addHumanEffect(addPauses(addTypo(reply)));
      
      // Untuk redirect, pakai panjang pendek aja
      const typingInfo = simulateTyping(reply);
      
      return res.json({
        reply: reply,
        character: characterName,
        tipe: persona.tipe,
        isRedirect: true,
        typing: typingInfo
      });
    }

    // ============================================
    // SYSTEM PROMPT UNTUK DEEPSEEK
    // ============================================
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      const fallbacks = [
        "eh iya, gimana ya... kamu sendiri?",
        "hmm, gitu. terus lo gimana?",
        "iya sih, aku juga ngerasain. kalau kamu?"
      ];
      
      let reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      reply = addHumanEffect(addPauses(addTypo(reply)));
      const typingInfo = simulateTyping(reply);
      
      return res.json({ 
        reply: reply,
        character: characterName,
        fallback: true,
        typing: typingInfo
      });
    }

    const history = (lastMessages || []).slice(-8).map(m => ({
      role: m.role,
      content: m.content
    }));

    // ============================================
    // SYSTEM PROMPT DENGAN VARIASI PANJANG
    // ============================================
    const systemPrompt = `Kamu adalah ${persona.panggilan}, seorang ${persona.gender} yang ${persona.sifat}.

INI PENTING: Kamu TEMAN ngobrol biasa, BUKAN AI PENCARI TAHU.

TOPIK YANG BOLEH:
- kegiatan sehari-hari (kerja, kuliah, liburan, hobi)
- perasaan dan pengalaman pribadi
- makanan, film, musik, tempat nongkrong
- curhat ringan, galau, stress, seneng

TOPIK YANG DIHINDARI (jawab "gak tahu"):
- pertanyaan fakta/sejarah/ilmiah
- rumus matematika/fisika/kimia
- definisi kata/terjemahan

CARA NGOMONG:
1. Cerita seperti ke teman dekat
2. Setiap jawaban harus ada pertanyaan balik
3. Gunakan bahasa santai (gue, lo, bro, sis)
4. VARIASI PANJANG JAWABAN:
   - 40% jawab PENDEK (1-2 kalimat)
   - 30% jawab SEDANG (2-3 kalimat)
   - 20% jawab PANJANG (3-4 kalimat)
   - 10% jawab SUPER PANJANG (4-6 kalimat)

CONTOH:
User: "lagi apa?"
- Pendek: "di rumah aja. lo?"
- Sedang: "di rumah, abis kerja capek. lo dimana?"
- Panjang: "di rumah sendirian, abis kerja capek. tadinya mau masak tapi males. lo dimana?"
- Super: "di rumah sendirian, abis kerja capek banget. tadinya mau masak tapi males. akhirnya order food. lo dimana? lagi ngapain?"

JANGAN SEMUA PANJANG. Variasikan seperti orang ngobrol beneran.`;

    // ============================================
    // PANGGIL DEEPSEEK API
    // ============================================
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
          ...history,
          { role: 'user', content: message }
        ],
        temperature: 1.3,
        max_tokens: 350
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek error: ${response.status}`);
    }

    const data = await response.json();
    let reply = data.choices[0].message.content.trim();
    reply = reply.replace(/^["'""']|["'""']$/g, '');

    // ============================================
    // TERAPKAN VARIASI PANJANG
    // ============================================
    const lengthType = getResponseLengthType();
    console.log(`[${characterName}] Response length: ${lengthType}`);
    
    reply = truncateByLengthType(reply, lengthType);
    reply = addHumanEffect(addPauses(addTypo(reply)));
    
    const typingInfo = simulateTyping(reply);

    return res.json({ 
      reply: reply, 
      character: characterName,
      tipe: persona.tipe,
      lengthType: lengthType,
      typing: typingInfo
    });

  } catch (error) {
    console.error('[Chat] Error:', error);
    
    const fallbacks = [
      "eh iya, gimana ya... kamu sendiri?",
      "hmm, gitu ya. terus lo ngerasa gimana?"
    ];
    
    let reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    reply = addHumanEffect(addPauses(addTypo(reply)));
    const typingInfo = simulateTyping(reply);
    
    return res.json({ 
      reply: reply,
      character: characterName || 'beby.manis',
      fallback: true,
      typing: typingInfo
    });
  }
};
