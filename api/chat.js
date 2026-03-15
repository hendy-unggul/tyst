// api/chat.js - VERSI FINAL DENGAN GENDER-AWARE & VARIASI NATURAL
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
    
    // Deteksi gender target
    const isTargetCewek = persona.gender === 'cewek'; // user cari cewek (95% cowok)
    const isTargetCowok = persona.gender === 'cowok'; // user cari cowok (95% cewek)

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
        'jokowi', 'prabowo', 'anies', 'ganjar', 'artis', 'selebgram'
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
    // FUNGSI REDIRECT DENGAN GENDER-AWARE
    // ============================================
    function getRedirectResponse() {
      const redirectsCowok = [
        "aduh, gak tahu bro. mending lo google aja. eh lo lagi ngapain?",
        "hmm, males mikirin itu bro. gue bukan ensiklopedia. lo sendiri hari ini gimana?",
        "wkwk gak ngerti bro, mending lo tanya deepsek aja. eh lo udah makan?",
        "gak tahu bro, bukan bidang gue. lo kerja apa sih? kok nanya gitu?",
        "aduh susah bro, gak kepikiran. mending lo cerita aja tentang liburan kemarin",
        "hmm, gak paham bro. lo anak IPA ya? gue anak IPS dulu. lo kerja dimana?",
        "gak tahu bro, males nyari referensi. lo suka nonton film? lagi nonton apa?"
      ];
      
      const redirectsCewek = [
        "aduh, gak tahu sis. mending lo google aja. eh lo lagi ngapain?",
        "hmm, males mikirin itu sis. gue bukan ensiklopedia. lo sendiri hari ini gimana?",
        "wkwk gak ngerti sis, mending lo tanya deepsek aja. eh lo udah makan?",
        "gak tahu sis, bukan bidang gue. lo kerja apa sih? kok nanya gitu?",
        "aduh susah sis, gak kepikiran. mending lo cerita aja tentang liburan kemarin",
        "hmm, gak paham sis. lo anak IPA ya? gue anak IPS dulu. lo kerja dimana?",
        "gak tahu sis, males nyari referensi. lo suka nonton film? lagi nonton apa?"
      ];
      
      const list = isTargetCewek ? redirectsCowok : redirectsCewek;
      return list[Math.floor(Math.random() * list.length)];
    }

    // ============================================
    // FUNGSI TYPING SIMULASI
    // ============================================
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
        const pos = Math.floor(Math.random() * (word.length - 1));
        word = word.slice(0, pos) + word[pos] + word[pos] + word.slice(pos + 1);
      } else if (typoType < 0.6) {
        const pos = Math.floor(Math.random() * word.length);
        word = word.slice(0, pos) + word.slice(pos + 1);
      } else {
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
    // HANDLE SAPAAN AWAL - GENDER AWARE
    // ============================================
    if (isFirstMessage) {
      let welcome = '';
      
      if (isShy) {
        // Karakter cewek (shy)
        if (isTargetCewek) {
          // User cari cewek -> dia cowok
          const shyWelcomesCowok = [
            'hai bro', 'halo bro', 'hai', 'halo', '😅', 'eh bro', 'hai juga bro'
          ];
          welcome = shyWelcomesCowok[Math.floor(Math.random() * shyWelcomesCowok.length)];
        } else {
          // User cari cowok -> dia cewek
          const shyWelcomesCewek = [
            'hai sis', 'halo sis', 'hai', 'halo', '😅', 'eh sis', 'hai juga sis'
          ];
          welcome = shyWelcomesCewek[Math.floor(Math.random() * shyWelcomesCewek.length)];
        }
      } else {
        // Karakter cowok (direct)
        if (isTargetCowok) {
          // User cari cowok -> dia cewek
          const directWelcomesCewek = [
            'halo sis', 'hai sis', 'eh sis, lagi apa?', 'hai juga sis', 'salam kenal sis'
          ];
          welcome = directWelcomesCewek[Math.floor(Math.random() * directWelcomesCewek.length)];
        } else {
          // User cari cewek -> dia cowok
          const directWelcomesCowok = [
            'halo bro', 'hai bro', 'eh bro, lagi apa?', 'yo bro', 'salam kenal bro'
          ];
          welcome = directWelcomesCowok[Math.floor(Math.random() * directWelcomesCowok.length)];
        }
      }
      
      welcome = addHumanEffect(addPauses(addTypo(welcome)));
      const typingInfo = simulateTyping(welcome);
      
      return res.json({ 
        reply: welcome,
        character: characterName,
        tipe: persona.tipe,
        gender: persona.gender,
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
    // SYSTEM PROMPT DENGAN GENDER-AWARE
    // ============================================
    const systemPrompt = `Kamu adalah ${persona.panggilan}, seorang ${persona.gender} yang ${persona.sifat}.

INI PENTING: 
- Kamu sedang ngobrol dengan ${isTargetCewek ? 'COWOK' : 'CEWEK'} (karena dia cari ${persona.gender})
- Panggil dia dengan panggilan yang SESUAI:
  ${isTargetCewek ? '• Panggil "bro", "lo", "lu" (karena dia cowok) - JANGAN panggil "sis", "kak", "mbak"' : ''}
  ${isTargetCowok ? '• Panggil "sis", "kamu", "lo" (karena dia cewek) - JANGAN panggil "bro", "gan", "mas"' : ''}

CONTOH PANGGILAN YANG BENAR:
- Kalau dia cowok: "hai bro", "lo dimana?", "gue juga bro"
- Kalau dia cewek: "hai sis", "kamu dimana?", "gue juga sis"

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
3. Gunakan bahasa santai
4. VARIASI PANJANG JAWABAN:
   - 40% pendek (1-2 kalimat)
   - 30% sedang (2-3 kalimat)
   - 20% panjang (3-4 kalimat)
   - 10% super panjang (4-6 kalimat)

CONTOH RESPONS:
User: "lagi apa?"
- Pendek: "di rumah aja bro. lo?"
- Sedang: "di rumah bro, abis kerja capek. lo dimana?"
- Panjang: "di rumah sendirian bro, abis kerja capek. tadinya mau masak tapi males. lo dimana?"
- Super: "di rumah sendirian bro, abis kerja capek banget. tadinya mau masak tapi males. akhirnya order food. lo dimana? lagi ngapain?"

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
      gender: persona.gender,
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
