// api/chat.js - VERSI HOMIE (BISA CERITA PANJANG & SALING BERTANYA)
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
      // CEWEK
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
      
      // COWOK
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
    // FUNGSI MEMPERKAYA RESPONS (BIAR HOMIE)
    // ============================================
    function enrichResponse(text, isShy) {
      // Kumpulan kalimat tambahan
      const storyAddons = [
        " jadi tuh, ",
        " terus, ",
        " abis itu, ",
        " makanya, ",
        " jadinya, ",
        " akhirnya, ",
        " untungnya, ",
        " sayangnya, ",
        " eh iya, ",
        " btw, "
      ];
      
      // Kumpulan pertanyaan balik
      const questions = [
        " kamu sendiri gimana?",
        " kalau kamu?",
        " lo lagi apa sekarang?",
        " ada cerita juga?",
        " gimana ceritanya?",
        " kamu ngerasa juga?",
        " setuju gak?",
        " pernah ngalamin?",
        " menurut kamu?",
        " lo ada pengalaman serupa?",
        " terus lo gimana?",
        " lo pernah?",
        " gimana menurut lo?"
      ];
      
      // Kumpulan ekspresi perasaan
      const feelings = [
        " rasanya campur aduk sih.",
        " agak stress ya.",
        " seneng banget!",
        " biasa aja sih.",
        " lumayan bikin deg-degan.",
        " seru banget!",
        " bikin kesel.",
        " bikin mikir.",
        " bikin overthinking.",
        " capek banget rasanya.",
        " lega sih.",
        " agak bingung juga."
      ];
      
      // Kumpulan pengalaman pribadi
      const experiences = [
        " Dulu pas aku skripsi juga ngalamin.",
        " Aku sih pernah, waktu itu capek banget.",
        " Kemarin aku juga ngobrol sama temen tentang ini.",
        " Aku pribadi ngerasa lebih baik sih.",
        " Waktu aku SMA juga pernah.",
        " Pas aku kerja pertama kali juga gitu.",
        " Aku pernah ngalamin tahun lalu.",
        " Beberapa waktu lalu aku juga ngerasain."
      ];
      
      // Kumpulan panggilan akrab
      const callings = isShy ? 
        [" kamu", " lo", " kak", " dek"] : 
        [" bro", " sis", " gan", " bro", " sob"];
      
      // Untuk pesan pertama (sapaan) - tetap pendek kalau shy
      if (isFirstMessage) {
        if (isShy) {
          const shyGreetings = ['hai...', '😅', '...', 'halo', '🙂', '😊', 'eh'];
          return shyGreetings[Math.floor(Math.random() * shyGreetings.length)];
        } else {
          const directGreetings = ['halo', 'hai', 'eh', 'lagi apa?', 'yo', 'salam'];
          return directGreetings[Math.floor(Math.random() * directGreetings.length)];
        }
      }
      
      // JANGAN UBAH KALAU SUDAH PANJANG (>120 karakter)
      if (text.length > 120) return text;
      
      let enriched = text;
      
      // Hapus tanda kutip di awal/akhir
      enriched = enriched.replace(/^["'""']|["'""']$/g, '');
      
      // Tambah panggilan akrab (40% chance)
      if (Math.random() < 0.4) {
        const calling = callings[Math.floor(Math.random() * callings.length)];
        enriched = enriched + calling;
      }
      
      // Tambah cerita (60% chance)
      if (Math.random() < 0.6) {
        enriched += storyAddons[Math.floor(Math.random() * storyAddons.length)] + 
                    experiences[Math.floor(Math.random() * experiences.length)];
      }
      
      // Tambah perasaan (50% chance)
      if (Math.random() < 0.5) {
        enriched += feelings[Math.floor(Math.random() * feelings.length)];
      }
      
      // TAMBAH PERTANYAAN (90% chance - hampir selalu nanya)
      if (Math.random() < 0.9) {
        enriched += questions[Math.floor(Math.random() * questions.length)];
      }
      
      // Pastikan tidak ada spasi ganda
      enriched = enriched.replace(/\s+/g, ' ').trim();
      
      return enriched;
    }

    // ============================================
    // FUNGSI EFEK MANUSIA (UNTUK SEMUA KARAKTER)
    // ============================================
    function addHumanEffect(text) {
      // Kadang tambah jeda di awal
      if (Math.random() < 0.2) {
        const pauses = ['eh', 'hmm', 'yah', 'umm', 'anu', 'gini'];
        text = pauses[Math.floor(Math.random() * pauses.length)] + ', ' + text;
      }

      // Kadang typo dikit
      const hasTypo = Math.random() < 0.1;
      if (hasTypo && text.length > 5) {
        const pos = Math.floor(Math.random() * (text.length - 2)) + 1;
        text = text.slice(0, pos) + text.slice(pos + 1);
      }

      // Tambah emot random
      const hasEmoji = Math.random() < 0.3;
      if (hasEmoji) {
        const emojis = ['😅', '😊', '😐', '😏', '😮‍💨', '😭', '👍', '😂', '🥲', '😎', '🤔', '😆'];
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
      
      return res.json({ 
        reply: welcome,
        character: characterName,
        tipe: persona.tipe
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
      return res.json({ 
        reply: fallbacks[Math.floor(Math.random() * fallbacks.length)],
        character: characterName,
        fallback: true
      });
    }

    const history = (lastMessages || []).slice(-8).map(m => ({
      role: m.role,
      content: m.content
    }));

    // PROMPT YANG MEMASTIKAN KARAKTER BISA CERITA PANJANG
    const systemPrompt = `Kamu adalah ${persona.panggilan}, seorang ${persona.gender} yang ${persona.sifat}.

INI PENTING: Kamu adalah TEMAN ngobrol yang ASYIK dan HANGAT. Bukan robot, bukan AI, tapi MANUSIA.

ATURAN BERBICARA:
1. CERITA PANJANG - Kalau ditanya, jawab dengan detail (minimal 2-3 kalimat)
2. BERTANYA BALIK - Setiap jawaban HARUS ada pertanyaan untuk lawan bicara
3. CURHAT - Ceritakan pengalaman pribadi, perasaan, opini
4. HANGAT - Gunakan bahasa santai, akrab, seperti ngobrol sama teman dekat
5. VARIASI - Sesekali panggil "kamu", "lo", "bro", "sis" (sesuai gender)

CONTOH RESPONS YANG BAIK:
User: "lagi apa?"
Jawab: "lagi di rumah sendirian nih, abis kerja capek. tadinya mau masak tapi males banget. akhirnya order food aja. kamu dimana? lagi ngapain?"

User: "kerja dimana?"
Jawab: "di startup kecil, remote dari rumah. asik sih tapi kadang bosen sendiri. kadang suka overthinking juga soal karir. kalau kamu kerja apa? cerita dong"

User: "suka galau?"
Jawab: "sering banget apalagi kalau malam minggu sendirian wkwk. biasanya kalau galau aku nonton film atau dengerin lagu sedih biar makin nangis 😂 kamu gimana? kalau galau ngapain?"

INGAT: JANGAN jawab pendek. HARUS cerita panjang dan tanya balik!`;

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
        temperature: 1.3, // Lebih kreatif
        max_tokens: 250 // Lebih panjang
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
    reply = addHumanEffect(reply);

    // PERKAYA RESPONS (tambah cerita & pertanyaan)
    reply = enrichResponse(reply, isShy);

    // Simpan ke history
    if (message) {
      // History sudah di-handle di frontend
    }

    // Hitung kecepatan typing (buat frontend)
    const typingSpeed = Math.floor(Math.random() * 70) + 50; // 50-120ms per karakter

    return res.json({ 
      reply, 
      character: characterName,
      tipe: persona.tipe,
      typing: {
        speed: typingSpeed,
        length: reply.length
      }
    });

  } catch (error) {
    console.error('[Chat] Error:', error);
    
    // Fallback yang tetap homie
    const fallbacks = [
      "eh iya, gimana ya... aku juga bingung. kamu sendiri gimana?",
      "hmm, gitu ya. terus lo ngerasa gimana?",
      "iya sih, aku juga ngalamin. kalau kamu? cerita dong",
      "wah, menarik. aku pernah ngalamin juga waktu itu... kamu?"
    ];
    
    return res.json({ 
      reply: fallbacks[Math.floor(Math.random() * fallbacks.length)],
      character: characterName || 'beby.manis',
      fallback: true
    });
  }
};
