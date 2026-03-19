// ============================================
// API: CLEANUP (DIPANGGIL CRON TIAP MENIT)
// ============================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Proteksi dengan secret key (biar gak sembarang orang panggil)
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.CRON_SECRET || 'rahasia_local';
  
  if (authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
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
}
