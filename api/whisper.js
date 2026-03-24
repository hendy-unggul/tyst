// api/whisper.js
// Vercel Serverless Function — Security Layer 1
//
// PERUBAHAN LAPISAN 1:
//   - IP address TIDAK PERNAH dibaca, disimpan, atau dilog
//   - Rate limit berbasis token bucket per-endpoint (no IP tracking)
//   - device_fp tidak diproses di endpoint ini
//
// ENV di Vercel:
//   SUPABASE_URL         = https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY = service_role key (bukan anon)

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Supabase helper (service role — bypass RLS) ──────────────
async function sb(method, path, body) {
  const opts = {
    method,
    headers: {
      apikey:         SUPA_KEY,
      Authorization:  `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         method === 'POST' ? 'return=representation' : 'return=minimal',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r    = await fetch(`${SUPA_URL}/rest/v1${path}`, opts);
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

// ── CORS ──────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Rate limit berbasis waktu — TANPA IP ──────────────────────
// Menggunakan sliding window per endpoint per Vercel instance.
// Tidak ada identifier personal yang disimpan — hanya counter global.
// Cukup untuk mencegah abuse massal tanpa tracking siapapun.
const _rl = { post: [], get: [] };
const LIMITS = { post: { max: 30, windowMs: 60000 }, get: { max: 120, windowMs: 60000 } };

function rateLimit(endpoint) {
  const now    = Date.now();
  const cfg    = LIMITS[endpoint] || LIMITS.get;
  const window = cfg.windowMs;
  // Hapus entry lama di luar window
  _rl[endpoint] = (_rl[endpoint] || []).filter(t => now - t < window);
  if (_rl[endpoint].length >= cfg.max) return false;
  _rl[endpoint].push(now);
  return true;
}

// ── Purge expired + destroyed (non-blocking) ──────────────────
function purge() {
  sb('DELETE', `/whispers?destroy_at=lt.${new Date().toISOString()}`).catch(() => {});
  sb('DELETE', `/whispers?status=eq.destroyed`).catch(() => {});
}

// ── Validasi username ─────────────────────────────────────────
// Format nama.nama diizinkan sesuai skema profiles
const validUser = s => typeof s === 'string' && /^[a-z0-9_.]{2,24}$/.test(s);

// ═══════════════════════════════════════════════════════════
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── POST — kirim whisper ────────────────────────────────────
  if (req.method === 'POST') {
    if (!rateLimit('post'))
      return res.status(429).json({ error: 'Too many requests' });

    const { to, fromHash, messageEnc } = req.body || {};

    if (!validUser(to))
      return res.status(400).json({ error: 'Invalid recipient' });

    if (!messageEnc || typeof messageEnc !== 'string' || messageEnc.length > 8000)
      return res.status(400).json({ error: 'Invalid message' });

    const hashSafe = (typeof fromHash === 'string' && /^[a-f0-9]{64}$/.test(fromHash))
      ? fromHash
      : null;

    const destroy_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { status, data } = await sb('POST', '/whispers', {
      target_username: to,
      from_hash:       hashSafe,
      message:         messageEnc,
      destroy_at,
      status:          null,
    });

    if (status !== 201) {
      console.error('[whisper] insert error:', data);
      return res.status(500).json({ error: 'Failed to send' });
    }

    purge();
    return res.status(200).json({ ok: true, id: data?.[0]?.id });
  }

  // ── GET — fetch inbox ───────────────────────────────────────
  if (req.method === 'GET') {
    const { username } = req.query;

    if (!validUser(username))
      return res.status(400).json({ error: 'Invalid username' });

    if (!rateLimit('get'))
      return res.status(429).json({ error: 'Too many requests' });

    const now = new Date().toISOString();

    const { data } = await sb(
      'GET',
      `/whispers?target_username=eq.${encodeURIComponent(username)}` +
      `&destroy_at=gt.${encodeURIComponent(now)}` +
      `&status=is.null` +
      `&select=id,from_hash,message,created_at,destroy_at` +
      `&order=created_at.desc&limit=20`
    );

    purge();
    return res.status(200).json(data || []);
  }

  // ── PATCH — tandai dibaca, percepat destroy ─────────────────
  if (req.method === 'PATCH') {
    const { id, username } = req.body || {};

    if (!id || !validUser(username))
      return res.status(400).json({ error: 'Missing params' });

    const { data: existing } = await sb(
      'GET',
      `/whispers?id=eq.${id}&target_username=eq.${encodeURIComponent(username)}` +
      `&status=is.null&select=id`
    );

    if (!existing?.length)
      return res.status(404).json({ error: 'Not found or already destroyed' });

    const now        = new Date().toISOString();
    const destroy_at = new Date(Date.now() + 6000).toISOString();

    await sb('PATCH', `/whispers?id=eq.${id}`, { read_at: now, destroy_at });

    setTimeout(() => {
      sb('PATCH', `/whispers?id=eq.${id}`, { status: 'destroyed' }).catch(() => {});
      purge();
    }, 6500);

    return res.status(200).json({ ok: true });
  }

  // ── DELETE — force destroy ──────────────────────────────────
  if (req.method === 'DELETE') {
    const { id, username } = req.body || {};

    if (!id || !validUser(username))
      return res.status(400).json({ error: 'Missing params' });

    await sb(
      'PATCH',
      `/whispers?id=eq.${id}&target_username=eq.${encodeURIComponent(username)}`,
      { status: 'destroyed', destroy_at: new Date().toISOString() }
    );

    purge();
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
