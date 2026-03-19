// ============================================
// API: BACA PESAN (MULAI COUNTDOWN 5 DETIK)
// ============================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { message_id } = req.body;
  
  if (!message_id) {
    return res.status(400).json({ error: 'Parameter message_id wajib diisi' });
  }
  
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
  const destroyAt = new Date(now.getTime() + 5000); // +5 detik
  
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
  
  // Kirim balik pesan + info countdown
  return res.status(200).json({
    ok: true,
    message: whisper.message,
    waktu_terima: new Date(whisper.created_at).toLocaleString('id-ID'),
    countdown: 5,
    meledak_pada: destroyAt.toLocaleString('id-ID'),
    warning: '⚠️ PESAN INI AKAN MELEDAK DALAM 5 DETIK!'
  });
}
