import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startDebug = { envVars: { supabaseUrl: !!process.env.SUPABASE_URL, supabaseKey: !!process.env.SUPABASE_KEY } };

  try {
    // ===== CEK ENV VARIABLE =====
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.status(500).json({ error: 'Missing Supabase credentials', debug: startDebug });
    }

    // Inisialisasi Supabase
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    
    const { action } = req.query;
    const debug = { ...startDebug, action };

    // ========== INBOX (GET) ==========
    if (req.method === 'GET' && action === 'inbox') {
      const { username } = req.query;
      if (!username) {
        return res.status(400).json({ error: 'username required', debug });
      }

      // Cek koneksi dengan query sederhana
      const { data: testData, error: testError } = await supabase.from('profiles').select('count').limit(0);
      if (testError) {
        return res.status(500).json({ error: 'Supabase connection/profile table error', details: testError, debug });
      }

      const { data, error } = await supabase
        .from('whispers')
        .select('id, message, created_at')
        .eq('target_username', username)
        .eq('status', 'unread')
        .order('created_at', { ascending: true });

      if (error) {
        return res.status(500).json({ error: 'Database query failed', details: error, debug });
      }

      return res.status(200).json({ ok: true, username, total: data.length, messages: data, debug });
    }

    // ========== SEND (POST) ==========
    if (req.method === 'POST' && action === 'send') {
      const { target_username, message } = req.body;
      if (!target_username || !message) {
        return res.status(400).json({ error: 'target_username and message required', debug });
      }

      // Cek user exist
      const { data: user, error: userError } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', target_username)
        .single();

      if (userError || !user) {
        return res.status(404).json({ error: 'User not found', details: userError, debug });
      }

      const { data, error } = await supabase
        .from('whispers')
        .insert([{ target_username, message, status: 'unread' }])
        .select();

      if (error) {
        return res.status(500).json({ error: 'Insert failed', details: error, debug });
      }

      return res.status(200).json({ ok: true, message_id: data[0].id, debug });
    }

    return res.status(400).json({ error: 'Invalid action or method', debug });

  } catch (error) {
    // Tangkap error yang tidak terduga
    console.error('🔥 Fatal error in API:', error);
    return res.status(500).json({ 
      error: 'Fatal server error', 
      message: error.message,
      stack: error.stack,
      debug: { ...startDebug, fatal: true }
    });
  }
}
