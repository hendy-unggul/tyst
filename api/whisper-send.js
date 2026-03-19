// ============================================
// API: KIRIM WHISPER (BLIND SENDER)
// ============================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // CORS biar bisa dipanggil dari frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { target_username, message } = req.body;
  
  // Validasi input
  if (!target_username || !message) {
    return res.status(400).json({ error: 'target_username dan message wajib diisi' });
  }
  
  // Cek apakah target user ada (opsional, biar lebih aman)
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', target_username)
    .single();
  
  if (userError || !user) {
    return res.status(404).json({ error: 'Username tidak ditemukan' });
  }
  
  // Simpan whisper
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
  
  // BERHASIL! (penerima gak akan tau siapa pengirim)
  return res.status(200).json({ 
    ok: true, 
    message_id: data[0].id,
    note: 'Pesan terkirim. Penerima tidak tahu siapa pengirim.'
  });
}
