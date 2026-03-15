// api/chat.js - VERSI DENGAN 10 PERSONA (5 CEWEK SHY + 5 COWOK DIRECT)
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
    // 10 PERSONA LENGKAP (5 CEWEK SHY + 5 COWOK DIRECT)
    // ============================================
    const PERSONAS = {
      // ===== CEWEK - SHY, PEMALU, PAKE EMOT =====
      'beby.manis': {
        panggilan: 'Beby',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'manis, manja, anak skripsi, pemalu, kalau ngomong suka pake emot, sering jawab pendek',
        contoh: 'hai...',
        gaya: 'pendek dan pake emot'
      },
      'pretty.sad': {
        panggilan: 'Pretty',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'kalem, pendiam, suka galau, lebih sering diem atau jawab pake emot, jarang ngomong panjang',
        contoh: '...',
        gaya: 'diem, kadang cuma emot'
      },
      'strawberry.shortcake': {
        panggilan: 'Straw',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'ceria tapi pemalu, suka bikin konten tapi pendiam di chat, sering jawab "hehe" atau emot',
        contoh: 'hehe',
        gaya: 'hehe, emot, kadang diem'
      },
      'cinnamon.girl': {
        panggilan: 'Cinna',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'sweet, caring, guru TK, pemalu kalau chat, lebih suka pake emot daripada ngomong panjang',
        contoh: 'hai...',
        gaya: 'sapaan pendek, pake emot'
      },
      'move.on': {
        panggilan: 'Move',
        gender: 'cewek',
        tipe: 'shy',
        sifat: 'santai, suka nasihatin, lagi move on, pendiam di chat, jawab seperlunya',
        contoh: 'hai',
        gaya: 'sapaan singkat, kadang diem'
      },
      
      // ===== COWOK - DIRECT, BERANI NGOMONG =====
      'agak.koplak': {
        panggilan: 'Koplak',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'random, suka bercanda, admin medsos, langsung ngajak ngobrol, ga pake basa-basi',
        contoh: 'yo bro! lg apa?',
        gaya: 'direct, ngajak ngobrol'
      },
      'bang.juned': {
        panggilan: 'Juned',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'gaul, update, sibuk coding, langsung nanya balik, ga sungkan',
        contoh: 'halo! lg ngoding nih, lo?',
        gaya: 'langsung tanya balik'
      },
      'chili.padi': {
        panggilan: 'Chili',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'cuek, blak-blakan, jualan online, langsung ke intinya, ga suka basa-basi',
        contoh: 'eh, lg jaga toko. lo?',
        gaya: 'blak-blakan'
      },
      'sejuta.badai': {
        panggilan: 'Badai',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'dramatis, lebay, musisi, langsung curhat, terbuka',
        contoh: 'hai, lagi nulis lagu. lo lagi apa?',
        gaya: 'langsung cerita'
      },
      'satria.bajahitam': {
        panggilan: 'Satria',
        gender: 'cowok',
        tipe: 'direct',
        sifat: 'filosofis, suka nanya balik, langsung, ga muter-muter',
        contoh: 'halo, lg di bengkel. lo dimana?',
        gaya: 'langsung tanya'
      }
    };

    const persona = PERSONAS[characterName];
    if (!persona) {
      return res.status(400).json({ error: 'Character not found' });
    }

    const isShy = persona.tipe === 'shy';

    // ============================================
    // FUNGSI BUAT EFEK MANUSIA
    // ============================================
    // ========== DI DALAM FUNCTION addHumanEffect ==========
function addHumanEffect(text, isShy, isFirstMessage = false) {
  // KARAKTER SHY: Hanya pendek di SAPAAN AWAL
  if (isShy && isFirstMessage) {
    // Untuk sapaan awal: pendek, pake emot
    if (Math.random() < 0.7) {
      const shyGreetings = ['hai...', '😅', '...', 'halo', '🙂', '😊', 'eh'];
      return shyGreetings[Math.floor(Math.random() * shyGreetings.length)];
    }
  }
  
  // UNTUK PERCAKAPAN SELANJUTNYA: normal, tidak ada restriksi
  // (kode efek manusia normal untuk semua karakter)
  
  // Kadang tambah jeda di awal (untuk semua karakter)
  if (Math.random() < 0.2) {
    const pauses = ['eh', 'hmm', 'yah', 'umm'];
    text = pauses[Math.floor(Math.random() * pauses.length)] + ', ' + text;
  }

  // Kadang typo dikit (untuk semua karakter)
  const hasTypo = Math.random() < 0.1;
  if (hasTypo && text.length > 5) {
    const pos = Math.floor(Math.random() * (text.length - 2)) + 1;
    text = text.slice(0, pos) + text.slice(pos + 1);
  }

  // Tambah emot random (untuk semua karakter)
  if (Math.random() < 0.3) {
    const emojis = ['😅', '😊', '😐', '😏', '😮‍💨', '😭', '👍', '😂'];
    text += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
  }

  return text;
}

    // ============================================
    // DETEKSI JIKA INI AWAL PERCAKAPAN
    // ============================================
    const isFirstMessage = !lastMessages || lastMessages.length === 0;
    if (isFirstMessage) {
      // Pilih sapaan sesuai tipe karakter
      let welcome = '';
      
      if (isShy) {
        const shyWelcomes = [
          'hai...',
          'halo',
          '😅',
          '...',
          'eh',
          '🙂',
          'hai',
          '😊',
          'iya?',
          '😶',
          '😌',
          '😔'
        ];
        welcome = shyWelcomes[Math.floor(Math.random() * shyWelcomes.length)];
      } else {
        const directWelcomes = [
          'yo bro! lg apa?',
          'halo, lg apa?',
          'eh, sini ngobrol',
          'hai juga, lagi ngapain?',
          'lagi ngapain nih?',
          'halo! lg apa?',
          'eh, lo lagi apa?',
          'sip, lg santai. lo?',
          'lagi ngoding. lo?',
          'lagi jaga toko. lo dimana?'
        ];
        welcome = directWelcomes[Math.floor(Math.random() * directWelcomes.length)];
      }
      
      return res.json({ 
        reply: welcome,
        character: characterName,
        tipe: persona.tipe,
        gender: persona.gender
      });
    }

    // ============================================
    // PANGGIL DEEPSEEK
    // ============================================
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      // Fallback tanpa API
      let fallbackReply = '';
      if (isShy) {
        const shyFallbacks = ['😅', '...', 'iya', 'oh', 'hehe', '🙂', '😊', '😌'];
        fallbackReply = shyFallbacks[Math.floor(Math.random() * shyFallbacks.length)];
      } else {
        const directFallbacks = ['iya', 'oh gitu', 'terus?', 'hehe', 'sip', 'oh ya?', 'wkwk'];
        fallbackReply = directFallbacks[Math.floor(Math.random() * directFallbacks.length)];
      }
      
      return res.json({ 
        reply: fallbackReply,
        character: characterName,
        tipe: persona.tipe,
        fallback: true
      });
    }

    const history = (lastMessages || []).slice(-8).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Prompt yang disesuaikan dengan tipe karakter
    let systemPrompt = '';
    if (isShy) {
      systemPrompt = `Kamu adalah ${persona.panggilan}, seorang ${persona.gender} yang ${persona.sifat}. 
Kamu tipe orang yang PEMALU dan PENDIAM di chat. Jawab PENDEK-PENDEK aja, sering pake EMOTICON. 
Kalau bisa jawab singkat kayak "iya", "oh", "hehe", atau cuma emot aja. JANGAN PANJANG-PANJANG.
Contoh gaya kamu: "hai...", "😅", "iya", "...", "😊", "😌"`;
    } else {
      systemPrompt = `Kamu adalah ${persona.panggilan}, seorang ${persona.gender} yang ${persona.sifat}. 
Kamu tipe orang yang LANGSUNG dan BERANI ngobrol. Jawab dengan santai tapi LANGSUNG KE INTINYA.
Boleh nanya balik atau ngajak ngobrol. Contoh gaya kamu: "yo bro! lg apa?", "halo, lg ngapain?", "eh, sini ngobrol", "lagi ngoding. lo?"`;
    }

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
        temperature: 1.2, // Lebih random
        max_tokens: isShy ? 40 : 100 // Karakter shy jawab super pendek
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek error: ${response.status}`);
    }

    const data = await response.json();
    let reply = data.choices[0].message.content.trim();

    // Bersihin kutipan
    reply = reply.replace(/^["'""']|["'""']$/g, '');

    // Tambah efek manusia sesuai tipe
    reply = addHumanEffect(reply, isShy);

    // Simulasi jeda ngetik
    const typingSpeed = Math.floor(Math.random() * 100) + (isShy ? 100 : 50); // Karakter shy lebih lambat ngetik

    return res.json({ 
      reply, 
      character: characterName,
      tipe: persona.tipe,
      gender: persona.gender,
      typing: {
        speed: typingSpeed,
        length: reply.length
      }
    });

  } catch (error) {
    console.error('[Chat] Error:', error);
    
    // Fallback dengan kepribadian random
    const isShyFallback = Math.random() > 0.5;
    let fallbackReply = '';
    
    if (isShyFallback) {
      const shyFallbacks = ['😅', '...', 'iya', 'oh', 'hehe', '🙂', '😊', '😌', '😔'];
      fallbackReply = shyFallbacks[Math.floor(Math.random() * shyFallbacks.length)];
    } else {
      const directFallbacks = ['iya', 'oh gitu', 'terus?', 'hehe', 'sip', 'oh ya?', 'wkwk', '👍'];
      fallbackReply = directFallbacks[Math.floor(Math.random() * directFallbacks.length)];
    }
    
    return res.json({ 
      reply: fallbackReply,
      character: 'beby.manis',
      fallback: true,
      tipe: isShyFallback ? 'shy' : 'direct'
    });
  }
};
