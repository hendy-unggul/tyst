// ============================================
// WHISPERER - ALL IN ONE API ENDPOINT (VERSI BARU)
// ============================================
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// ========== HELPER CORS ==========
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ========== MAIN HANDLER ==========
export default async function handler(req, res) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  switch (action) {
    case 'send':
      return handleSend(req, res);
    case 'inbox':
      return handleInbox(req, res);
    case 'read':
      return handleRead(req, res);
    case 'cleanup':
      return handleCleanup(req, res);
    default:
      return res.status(400).json({ 
        error: 'Action tidak ditemukan. Gunakan: send, inbox, read, cleanup' 
      });
  }
}

// ========== 1. KIRIM WHISPER (POST) ==========
async function handleSend(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method must be POST' });
  }

  const { target_username, message } = req.body;

  if (!target_username || !message) {
    return res.status(400).json({ error: 'target_username dan message wajib diisi' });
  }

  // Validasi format username (kata.kata)
  if (!target_username.includes('.')) {
    return res.status(400).json({ 
      error: 'Format username harus "kata.kata" (contoh: susi.22)' 
    });
  }

  try {
    // Cek apakah target user ada di tabel profiles
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', target_username)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Username tidak ditemukan' });
    }

    // Simpan whisper (GAK ADA kolom sender!)
    const { data, error } = await supabase
      .from('whispers')
      .insert([{
        target_username: target_username,
        message: message,
        status: 'unread'
      }])
      .select();

    if (error) {
      console.error('Send error:', error);
      return res.status(500).json({ error: 'Gagal menyimpan pesan' });
    }

    return res.status(200).json({ 
      ok: true, 
      message_id: data[0].id,
      note: 'Pesan terkirim. Penerima tidak tahu siapa pengirim.'
    });

  } catch (error) {
    console.error('Send error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== 2. CEK INBOX (GET) ==========
async function handleInbox(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method must be GET' });
  }

  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Parameter username wajib diisi' });
  }

  try {
    // Ambil semua pesan yang belum dibaca
    const { data, error } = await supabase
      .from('whispers')
      .select('id, message, created_at')
      .eq('target_username', username)
      .eq('status', 'unread')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Inbox error:', error);
      return res.status(500).json({ error: 'Gagal mengambil inbox' });
    }

    // Format data dengan waktu lokal
    const messages = data.map(msg => ({
      id: msg.id,
      message: msg.message,
      waktu: new Date(msg.created_at).toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta' 
      }),
      dari: '???', // Blind sender!
    }));

    return res.status(200).json({ 
      ok: true,
      username: username,
      total: messages.length,
      messages: messages 
    });

  } catch (error) {
    console.error('Inbox error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== 3. BACA PESAN (POST) ==========
async function handleRead(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method must be POST' });
  }

  const { message_id } = req.body;

  if (!message_id) {
    return res.status(400).json({ error: 'Parameter message_id wajib diisi' });
  }

  try {
    // Ambil pesan (pastikan masih unread)
    const { data: whisper, error: fetchError } = await supabase
      .from('whispers')
      .select('*')
      .eq('id', message_id)
      .eq('status', 'unread')
      .single();

    if (fetchError || !whisper) {
      return res.status(404).json({ error: 'Pesan tidak ditemukan atau sudah dibaca' });
    }

    // Update status jadi read dan set destroy_at (5 detik dari sekarang)
    const now = new Date();
    const destroyAt = new Date(now.getTime() + 5000);

    const { error: updateError } = await supabase
      .from('whispers')
      .update({
        status: 'read',
        read_at: now.toISOString(),
        destroy_at: destroyAt.toISOString()
      })
      .eq('id', message_id);

    if (updateError) {
      console.error('Read error:', updateError);
      return res.status(500).json({ error: 'Gagal membaca pesan' });
    }

    return res.status(200).json({
      ok: true,
      message: whisper.message,
      waktu_terima: new Date(whisper.created_at).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta'
      }),
      countdown: 5,
      meledak_pada: destroyAt.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta'
      }),
      warning: '⚠️ PESAN INI AKAN MELEDAK DALAM 5 DETIK!'
    });

  } catch (error) {
    console.error('Read error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== 4. CLEANUP (POST) - UNTUK CRON ==========
async function handleCleanup(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method must be POST' });
  }

  // Proteksi dengan secret key
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.CRON_SECRET || 'rahasia_local';
  
  if (authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Panggil fungsi cleanup di database
    const { error } = await supabase.rpc('fn_cleanup_whispers');
    
    if (error) {
      console.error('Cleanup error:', error);
      return res.status(500).json({ error: 'Gagal cleanup' });
    }

    return res.status(200).json({ 
      ok: true, 
      message: '🧹 Cleanup berhasil',
      waktu: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
