// api/whisper-cleanup.js
// Dipanggil otomatis via Vercel Cron
//
// ENV:
//   SUPABASE_URL         = https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY = service_role key
//   CRON_SECRET          = secret token untuk proteksi endpoint

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(method, path, body) {
  const opts = {
    method,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, opts);
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

export default async function handler(req, res) {
  // Proteksi endpoint
  const authHeader = req.headers.authorization;
  const expected = `Bearer ${process.env.CRON_SECRET || 'tyst_cron_local'}`;
  if (authHeader !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();

  // Hapus whisper expired
  const { status: s1 } = await sb('DELETE', `/whispers?destroy_at=lt.${encodeURIComponent(now)}`);

  // Hapus whisper yang sudah destroyed
  const { status: s2 } = await sb('DELETE', `/whispers?status=eq.destroyed`);

  // Hapus rate limit entries expired
  const { status: s3 } = await sb('DELETE', `/whisper_ratelimit?expires_at=lt.${encodeURIComponent(now)}`);

  return res.status(200).json({
    ok: true,
    cleaned: { expired: s1, destroyed: s2, ratelimit: s3 },
    at: now
  });
}
