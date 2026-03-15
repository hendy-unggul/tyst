// api/whisper.js
import { createClient } from '@supabase/supabase-js'

// Inisialisasi Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

export default async function handler(req, res) {
  // CORS biar bisa dipanggil dari frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ========== KIRIM WHISPER (POST) ==========
  if (req.method === 'POST') {
    const { from, to, message } = req.body;

    if (!from || !to || !message) {
      return res.status(400).json({ error: 'from, to, message required' });
    }

    // Simpan ke Supabase
    const { error } = await supabase
      .from('whispers')
      .insert([{ 
        sender: from, 
        receiver: to, 
        message,
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('[Whisper] Insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  // ========== TERIMA WHISPER (GET) ==========
  if (req.method === 'GET') {
    const { user } = req.query;

    if (!user) {
      return res.status(400).json({ error: 'user required' });
    }

    // Ambil whisper untuk user ini
    const { data, error } = await supabase
      .from('whispers')
      .select('*')
      .eq('receiver', user)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Whisper] Select error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Hapus yang udah diambil (sekali baca langsung musnah)
    if (data && data.length > 0) {
      const ids = data.map(d => d.id);
      await supabase
        .from('whispers')
        .delete()
        .in('id', ids);
    }

    return res.status(200).json(data || []);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
