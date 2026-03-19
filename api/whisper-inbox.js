// ============================================
// API: CEK INBOX (PESAN MASUK)
// ============================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { username } = req.query;
  
  if (!username) {
    return res.status(400).json({ error: 'Parameter username wajib diisi' });
  }
  
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
  
  // Format data biar lebih enak dibaca
  const messages = data.map(msg => ({
    id: msg.id,
    message: msg.message,
    waktu: new Date(msg.created_at).toLocaleString('id-ID'),
    dari: '???', // TETAP BLIND!
  }));
  
  return res.status(200).json({ 
    ok: true,
    username: username,
    total: messages.length,
    messages: messages 
  });
}
