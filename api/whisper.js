// api/whisper.js
// Vercel Serverless Function
// Skema aktual: id, target_username, from_hash, message,
//               created_at, read_at, destroy_at, status
//
// ENV di Vercel:
//   SUPABASE_URL          = https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  = service_role key (bukan anon)

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Supabase helper (service role — bypass RLS) ──────────────
async function sb(method, path, body) {
  const opts = {
    method,
    headers: {
      apikey:          SUPA_KEY,
      Authorization:   `Bearer ${SUPA_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          method === 'POST' ? 'return=representation' : 'return=minimal',
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

// ── Rate limit (in-memory, per Vercel instance) ───────────────
const _rl = new Map();
function rateLimit(ip, max = 20, windowMs = 60000) {
  const now   = Date.now();
  const entry = _rl.get(ip) || { n: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.n = 0; entry.reset = now + windowMs; }
  entry.n++;
  _rl.set(ip, entry);
  return entry.n <= max;
}

// ── Purge expired + destroyed (non-blocking) ─────────────────
function purge() {
  sb('DELETE', `/whispers?destroy_at=lt.${new Date().toISOString()}`).catch(() => {});
  sb('DELETE', `/whispers?status=eq.destroyed`).catch(() => {});
}

// ── Validasi username ─────────────────────────────────────────
// Izinkan titik (.) karena username di profiles pakai format: nama.nama
const validUser = s => typeof s === 'string' && /^[a-z0-9_.]{2,24}$/.test(s);

// ═══════════════════════════════════════════════════════════
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  // ── POST — kirim whisper ────────────────────────────────────
  // Body: { to, fromHash, messageEnc }
  //   to          = username penerima
  //   fromHash    = sha256(sender_username) — dihitung di browser
  //   messageEnc  = "iv_b64:ciphertext_b64" — dienkripsi di browser
  if (req.method === 'POST') {
    if (!rateLimit(ip, 15, 60000))
      return res.status(429).json({ error: 'Too many requests' });

    const { to, fromHash, messageEnc } = req.body || {};

    if (!validUser(to))
      return res.status(400).json({ error: 'Invalid recipient' });

    if (!messageEnc || typeof messageEnc !== 'string' || messageEnc.length > 8000)
      return res.status(400).json({ error: 'Invalid message' });

    // fromHash opsional tapi harus string hex 64 char jika ada
    const hashSafe = (typeof fromHash === 'string' && /^[a-f0-9]{64}$/.test(fromHash))
      ? fromHash
      : null;

    const now        = new Date();
    const destroy_at = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { status, data } = await sb('POST', '/whispers', {
      target_username: to,
      from_hash:       hashSafe,
      message:         messageEnc,   // ciphertext, bukan plaintext
      destroy_at,
      status:          null,         // null = unread
    });

    if (status !== 201) {
      console.error('[whisper] insert error:', data);
      return res.status(500).json({ error: 'Failed to send' });
    }

    purge(); // non-blocking cleanup
    return res.status(200).json({ ok: true, id: data?.[0]?.id });
  }

  // ── GET — fetch inbox ───────────────────────────────────────
  // Query: ?username=xxx
  // Kembalikan pesan yang belum destroyed + belum expired
  if (req.method === 'GET') {
    const { username } = req.query;

    if (!validUser(username))
      return res.status(400).json({ error: 'Invalid username' });

    if (!rateLimit(ip, 60, 60000))
      return res.status(429).json({ error: 'Too many requests' });

    const now = new Date().toISOString();

    // Ambil pesan: target = username, belum expired, status IS NULL
    // NULL = unread/baru. not.eq.destroyed tidak menangkap NULL di PostgREST
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
  // Body: { id, username }
  // Efek: set read_at = now, destroy_at = now + 10 detik, status tetap null
  // Penghapusan fisik terjadi via purge 10 detik kemudian
  if (req.method === 'PATCH') {
    const { id, username } = req.body || {};

    if (!id || !validUser(username))
      return res.status(400).json({ error: 'Missing params' });

    // Verifikasi kepemilikan
    const { data: existing } = await sb(
      'GET',
      `/whispers?id=eq.${id}&target_username=eq.${encodeURIComponent(username)}` +
      `&status=is.null&select=id`
    );

    if (!existing?.length)
      return res.status(404).json({ error: 'Not found or already destroyed' });

    const now        = new Date().toISOString();
    // Percepat destroy: 6 detik dari sekarang (sedikit lebih dari countdown 5 detik UI)
    const destroy_at = new Date(Date.now() + 6000).toISOString();

    await sb('PATCH', `/whispers?id=eq.${id}`, {
      read_at:    now,
      destroy_at,           // dipercepat
      // status tetap null — diset 'destroyed' saat force-delete
    });

    // Jadwalkan force delete setelah 6 detik
    setTimeout(() => {
      sb('PATCH', `/whispers?id=eq.${id}`, { status: 'destroyed' }).catch(() => {});
      purge();
    }, 6500);

    return res.status(200).json({ ok: true });
  }

  // ── DELETE — force destroy langsung ────────────────────────
  // Body: { id, username }
  // Dipakai jika user tekan back sebelum timer habis
  if (req.method === 'DELETE') {
    const { id, username } = req.body || {};

    if (!id || !validUser(username))
      return res.status(400).json({ error: 'Missing params' });

    // Set status = 'destroyed' (bukan hapus fisik langsung — biar purge yang beresin)
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
