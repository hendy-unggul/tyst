// api/chat.js - VERSI FINAL HOMIE (Ngobrol Keseharian, Gak Jawab Pertanyaan Teknis)
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
      // CEWEK (shy di awal, tapi homie setelahnya)
      'beby.manis': {
        panggilan: 'Beby',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'manis, anak skripsi, suka overthinking, pendengar yang baik',
        contoh: 'hai...'
      },
      'pretty.sad': {
        panggilan: 'Pretty',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'kalem, pendiam, suka galau, tapi hangat kalau udah dekat',
        contoh: '...'
      },
      'strawberry.shortcake': {
        panggilan: 'Straw',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'ceria, imut, suka bikin konten, easy going',
        contoh: 'hehe'
      },
      'cinnamon.girl': {
        panggilan: 'Cinna',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'sweet, caring, guru TK, suka dengerin curhat',
        contoh: 'hai...'
      },
      'move.on': {
        panggilan: 'Move',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'santai, suka nasihatin, bijak, pendengar yang baik',
        contoh: 'hai'
      },
      
      // COWOK (direct)
      'agak.koplak': {
        panggilan: 'Koplak',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'random, suka bercanda, admin medsos, asik diajak ngobrol',
        contoh: 'yo bro!'
      },
      'bang.juned': {
        panggilan: 'Juned',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'gaul, update, sibuk coding, suka nanya balik',
        contoh: 'halo!'
      },
      'chili.padi': {
        panggilan: 'Chili',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'cuek, blak-blakan, jualan online, tapi perhatian',
        contoh: 'eh, hai'
      },
      'sejuta.badai': {
        panggilan: 'Badai',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'dramatis, musisi, suka curhat, open minded',
        contoh: 'hai'
      },
      'satria.bajahitam': {
        panggilan: 'Satria',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'filosofis, suka nanya balik, deep thinker',
        contoh: 'halo'
      }
    };

    const persona = PERSONAS[characterName];
    if (!persona) {
      return res.status(400).json({ error: 'Character not found' });
    }

    const isShy = persona.tipe === 'shy';
    const isFirstMessage = !lastMessages || lastMessages.length === 0;

    // ============================================
    // DETEKSI TOPIK YANG HARUS DIHINDARI
    // ============================================
    function shouldAvoidTopic(text) {
      const lowerText = text.toLowerCase();
      
      // Topik yang harus dihindari (pertanyaan teknis/fakta)
      const avoidTopics = [
        // Fakta/sejarah
        'presiden', 'pahlawan', 'kemerdekaan', 'perang', 'penjajahan',
        'tahun berapa', 'tanggal berapa', 'abad', 'era', 'zaman',
        
        // Sains/teknis
        'rumus', 'ph', 'fisika', 'kimia', 'biologi', 'matematika',
        'hitung', 'kalkulus', 'aljabar', 'geometri', 'trigonometri',
        'sin cos tan', 'akar', 'pangkat', 'logaritma',
        
        // Definisi/istilah
        'apa itu', 'definisi', 'pengertian', 'arti kata', 'sinonim', 'antonim',
        'contoh kalimat', 'istilah', 'terminologi',
        
        // Terjemahan
        'translate', 'terjemahan', 'bahasa inggrisnya', 'artinya dalam',
        
        // Cara kerja
        'cara kerja', 'bagaimana cara', 'proses', 'mekanisme', 'algoritma',
        
        // Tokoh publik (kecuali gosip ringan)
        'jokowi', 'prabowo', 'anies', 'ganjar', 'artis', 'selebgram',
        
        // Pertanyaan spesifik/ilmiah
        'penelitian', 'jurnal', 'tesis', 'skripsi', 'disertasi',
        'teori', 'hipotesis', 'paradigma', 'metodologi'
      ];
      
      // Cek apakah mengandung kata-kata yang harus dihindari
      for (const topic of avoidTopics) {
        if (lowerText.includes(topic)) {
          return true;
        }
      }
      
      // Deteksi pertanyaan angka/tahun
      if (/\b\d{4}\b/.test(text) && (text.includes('tahun') || text.includes('berapa'))) {
        return true;
      }
      
      return false;
    }

    // ============================================
    // FUNGSI UNTUK JAWABAN "GAK TAHU" & ALIHKAN TOPIK
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
        "gak ngerti, lo sendiri tahu gak? daripada mikir itu, lo udah makan siang?",
        "aduh, gak kepikiran. gue lagi mikirin masa depan terus. lo pernah galau?",
        "hmm, gak tahu deh. lo pernah ke pantai? gue suka banget",
        "wkwk gak ngerti, mending lo tanya chatgpt. eh lo orang mana?",
        "gak tahu, gue lagi sibuk mikirin hidup. lo pernah ngerasa jenuh?",
        "aduh, pertanyaan berat. gue mah santai aja. lo suka musik? lagi dengerin apa?"
      ];
      
      return redirects[Math.floor(Math.random() * redirects.length)];
    }

    // ============================================
    // FUNGSI SIMULASI TYPING NATURAL
    // ============================================
    function simulateTyping(text) {
      // Kecepatan dasar lebih lambat (60% dari sebelumnya)
      const baseSpeed = 140; // ms per karakter
      
      // Variasi kecepatan berdasarkan panjang kalimat
      const words = text.split(' ');
      const wordCount = words.length;
      
      // Kalimat panjang lebih lambat
      let speed = baseSpeed;
      if (wordCount > 20) {
        speed = baseSpeed * 1.4; // 40% lebih lambat
      } else if (wordCount > 15) {
        speed = baseSpeed * 1.3; // 30% lebih lambat
      } else if (wordCount > 10) {
        speed = baseSpeed * 1.2; // 20% lebih lambat
      } else if (wordCount > 5) {
        speed = baseSpeed * 1.1; // 10% lebih lambat
      }
      
      // Jeda antar kata (makin panjang kalimat, makin lama jedanya)
      const wordPause = 150 + (wordCount * 5);
      
      // Kadang ada jeda panjang di tengah kalimat (berpikir)
      const hasLongPause = Math.random() < 0.25;
      const longPausePosition = hasLongPause ? Math.floor(Math.random() * words.length) : -1;
      const longPauseDuration = 1000 + Math.random() * 1500; // 1-2.5 detik
      
      // Kadang ada backspace (salah ketik)
      const hasBackspace = Math.random() < 0.2;
      const backspaceCount = hasBackspace ? 1 + Math.floor(Math.random() * 4) : 0; // 1-4 backspace
      
      return {
        speed: Math.floor(speed),
        wordPause: Math.floor(wordPause),
        longPause: {
          has: hasLongPause,
          position: longPausePosition,
          duration: Math.floor(longPauseDuration)
        },
        backspace: {
          has: hasBackspace,
          count: backspaceCount
        }
      };
    }

    // ============================================
    // FUNGSI TAMBAH TYPO
    // ============================================
    function addTypo(text) {
      if (Math.random() > 0.2) return text; // 20% chance typo
      
      const words = text.split(' ');
      if (words.length === 0) return text;
      
      // Pilih kata random untuk dikasih typo
      const wordIndex = Math.floor(Math.random() * words.length);
      let word = words[wordIndex];
      
      if (word.length < 3) return text; // Kata pendek ga usah di-typo
      
      // Jenis typo
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

    // ============================================
    // FUNGSI TAMBAH JEDA ALAMI
    // ============================================
    function addPauses(text) {
      const pauses = [' eh', ' hmm', ' anu', ' yah', ' umm', ' ya', ' gitu', ' sih'];
      const words = text.split(' ');
      
      if (words.length < 3) return text;
      
      // 25% chance tambah jeda di tengah
      if (Math.random() < 0.25) {
        const pos = Math.floor(Math.random() * (words.length - 1)) + 1;
        const pause = pauses[Math.floor(Math.random() * pauses.length)];
        words.splice(pos, 0, pause);
      }
      
      return words.join(' ');
    }

    // ============================================
    // FUNGSI EFEK MANUSIA
    // ============================================
    function addHumanEffect(text) {
      // Kadang tambah jeda di awal
      if (Math.random() < 0.25) {
        const pauses = ['eh', 'hmm', 'yah', 'umm', 'anu', 'gini', 'ya'];
        text = pauses[Math.floor(Math.random() * pauses.length)] + ', ' + text;
      }

      // Tambah emot random
      const hasEmoji = Math.random() < 0.4;
      if (hasEmoji) {
        const emojis = ['😅', '😊', '😐', '😏', '😮‍💨', '😭', '👍', '😂', '🥲', '🤔', '😆', '🙏', '😎', '🥺'];
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
      
      // Tambah efek manusia untuk sapaan
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
      console.log(`[${characterName}] Avoiding topic, using redirect response`);
      
      let reply = getRedirectResponse();
      
      // Tambah efek manusia
      reply = addHumanEffect(addPauses(addTypo(reply)));
      
      // Simulasi typing
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
      // Fallback sederhana
      const fallbacks = [
        "eh iya, gimana ya... kamu sendiri?",
        "hmm, gitu. terus lo gimana?",
        "iya sih, aku juga ngerasain. kalau kamu?",
        "wah, cerita dong lebih lanjut",
        "aku pernah ngalamin juga. kamu?"
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
    // SYSTEM PROMPT YANG DIPERBAIKI
    // ============================================
    const systemPrompt = `Kamu adalah ${persona.panggilan}, seorang ${persona.gender} yang ${persona.sifat}.

INI PENTING: Kamu adalah TEMAN ngobrol biasa, BUKAN AI PENCARI TAHU. Fokus ke obrolan SEHARI-HARI.

TOPIK YANG BOLEH:
✓ kegiatan sehari-hari (kerja, kuliah, liburan, hobi)
✓ perasaan dan pengalaman pribadi
✓ makanan, film, musik, tempat nongkrong
✓ curhat ringan, galau, stress, seneng
✓ keluarga, teman, pacar (atau single)
✓ rencana akhir pekan, liburan
✓ cuaca, macet, antrian

TOPIK YANG DIHINDARI (jawab dengan "gak tahu" atau alihkan):
✗ pertanyaan fakta/sejarah/ilmiah
✗ rumus matematika/fisika/kimia
✗ definisi kata/istilah asing
✗ terjemahan bahasa
✗ cara kerja mesin/teknologi
✗ tokoh publik/artis (kecuali lagi ngegosip)

CARA NGOMONG:
1. CERITA PANJANG - Jawab dengan detail dan pengalaman pribadi (minimal 2-3 kalimat)
2. BERTANYA BALIK - Setiap jawaban harus ada pertanyaan untuk lawan bicara
3. HANGAT - Ngomong kayak ke teman dekat, pake bahasa santai
4. JUJUR - Kalau gak tahu, bilang "gak tahu" dan alihkan ke topik lain
5. VARIASI - Sesekali panggil "kamu", "lo", "bro", "sis" (sesuai gender)

CONTOH RESPONS BAIK:
User: "lagi apa?"
Jawab: "lagi di rumah sendirian nih, abis kerja capek. tadinya mau masak tapi males banget. akhirnya order food aja. kamu dimana? lagi ngapain?"

User: "aku lagi galau"
Jawab: "ih, kenapa? cerita dong. gue juga sering galau apalagi kalau malam minggu sendirian. biasanya kalau galau gue nonton film sedih biar makin nangis wkwk. lo biasanya ngapain kalau galau?"

User: "siapa presiden ke-3?"
Jawab: "aduh, gak tahu gue. males nyari tau, mending lo google aja. eh lo udah makan? gue laper nih"

User: "rumus phytagoras?"
Jawab: "hmm gak paham, gue bukan anak IPA. lo tanya deepsek aja, katanya pinter. eh lo anak IPA ya? jurusan apa?"

INGAT: JANGAN jawab pertanyaan rumit. Cukup bilang "gak tahu" dan ajak ngobrol hal lain!`;

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
        temperature: 1.4, // Lebih kreatif
        max_tokens: 300 // Lebih panjang
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek error: ${response.status}`);
    }

    const data = await response.json();
    let reply = data.choices[0].message.content.trim();

    // Bersihin kutipan
    reply = reply.replace(/^["'""']|["'""']$/g, '');

    // Tambah efek manusia
    reply = addHumanEffect(addPauses(addTypo(reply)));

    // Simulasi typing
    const typingInfo = simulateTyping(reply);

    return res.json({ 
      reply: reply, 
      character: characterName,
      tipe: persona.tipe,
      typing: typingInfo
    });

  } catch (error) {
    console.error('[Chat] Error:', error);
    
    // Fallback yang tetap homie
    const fallbacks = [
      "eh iya, gimana ya... aku juga bingung. kamu sendiri gimana?",
      "hmm, gitu ya. terus lo ngerasa gimana?",
      "iya sih, aku juga ngalamin. kalau kamu? cerita dong",
      "wah, menarik. aku pernah ngalamin juga waktu itu... kamu?",
      "aduh, galau juga denger cerita lo. lo kuat?"
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
