// api/whisper.js
// Vercel Serverless Function — Security Layer 2
//
// PERUBAHAN dari versi sebelumnya:
//   - from_hash DIHAPUS SEPENUHNYA — tidak ada identifier sender
//   - POST mengembalikan 202 Accepted (async queue semantics)
//   - Random delay 0–45 detik sebelum insert ke DB
//     → created_at tidak mencerminkan waktu kirim nyata
//     → timing correlation attack tidak feasible
//   - Enkripsi sudah terjadi di client via ECDH+AES-GCM
//     server hanya menyimpan opaque ciphertext
//   - IP address tidak pernah dibaca, disimpan, atau dilog
//
// ENV:
//   SUPABASE_URL         = https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY = service_role key

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Supabase helper (service role — bypass RLS) ──────────
async function sb(method, path, body) {
  const opts = {
    method,
    headers: {
      apikey:        SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type':'application/json',
      Prefer:        method === 'POST' ? 'return=representation' : 'return=minimal',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r    = await fetch(`${SUPA_URL}/rest/v1${path}`, opts);
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

// ── CORS ─────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Rate limit — TANPA IP ─────────────────────────────────
const _rl = { post: [], get: [] };
const LIMITS = {
  post: { max: 30,  windowMs: 60000 },
  get:  { max: 120, windowMs: 60000 },
};
function rateLimit(endpoint) {
  const now = Date.now(), cfg = LIMITS[endpoint] || LIMITS.get;
  _rl[endpoint] = (_rl[endpoint] || []).filter(t => now - t < cfg.windowMs);
  if (_rl[endpoint].length >= cfg.max) return false;
  _rl[endpoint].push(now);
  return true;
}

// ── Random delay — timing obfuscation ────────────────────
// Distribusi non-uniform (exponential-ish) agar pola delay
// tidak bisa di-fingerprint dari distribusi statistiknya.
// Min: 2 detik, Max: 45 detik.
// Vercel Pro timeout = 60 detik → aman.
// Vercel Hobby timeout = 10 detik → gunakan queue eksternal.
function randomDelay() {
  // base: 0–30 detik, jitter: 0–15 detik, keduanya independent
  const base   = Math.random() * 30000;
  const jitter = Math.random() * 15000;
  const min    = 2000;
  return new Promise(r => setTimeout(r, min + base + jitter));
}

// ── Purge expired + destroyed (non-blocking) ─────────────
function purge() {
  sb('DELETE', `/whispers?destroy_at=lt.${new Date().toISOString()}`).catch(() => {});
  sb('DELETE', `/whispers?status=eq.destroyed`).catch(() => {});
}

// ── Validasi username ────────────────────────────────────
const validUser = s => typeof s === 'string' && /^[a-z0-9_.]{2,24}$/.test(s);

// ── Validasi ciphertext (opaque blob) ────────────────────
// Format: base64(iv):base64(ephemeralPubKey):base64(ciphertext)
// Tiga segmen dipisah titik dua, tidak ada komponen lain.
function validCiphertext(s) {
  if (typeof s !== 'string') return false;
  if (s.length > 16000)     return false; // max ~12KB plaintext setelah padding
  const parts = s.split(':');
  // Format baru ECDH: iv:ephemeralPub:ct (3 parts)
  // Format lama PBKDF2: iv:ct (2 parts) — tolak untuk force migration
  return parts.length === 3;
}

// ═══════════════════════════════════════════════════════════
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── POST — kirim whisper ────────────────────────────────
  if (req.method === 'POST') {
    if (!rateLimit('post'))
      return res.status(429).json({ error: 'Too many requests' });

    const { to, messageEnc } = req.body || {};

    // from_hash tidak lagi diterima — tolak jika masih dikirim
    // (mencegah klien lama yang belum diupdate bocor identifier)
    if ('fromHash' in (req.body || {}) || 'from_hash' in (req.body || {}))
      return res.status(400).json({ error: 'Sender identity field not accepted' });

    if (!validUser(to))
      return res.status(400).json({ error: 'Invalid recipient' });

    if (!validCiphertext(messageEnc))
      return res.status(400).json({ error: 'Invalid ciphertext format' });

    // Verifikasi penerima ada di sistem
    const { data: recipientCheck } = await sb(
      'GET',
      `/profiles?username=eq.${encodeURIComponent(to)}&select=id&limit=1`
    );
    if (!recipientCheck?.length)
      return res.status(404).json({ error: 'Recipient not found' });

    // ── Langsung kembalikan 202 Accepted ke client ──────
    // Insert ke DB terjadi SETELAH delay — client tidak perlu menunggu.
    // Ini sekaligus mencegah timing side-channel dari response time.
    res.status(202).json({ ok: true, queued: true });

    // ── Insert async setelah random delay ───────────────
    // Kode di bawah ini berjalan setelah response dikirim.
    // Vercel menjalankan background execution sampai selesai.
    const destroy_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    randomDelay().then(async () => {
      try {
        await sb('POST', '/whispers', {
          target_username: to,
          // from_hash: null — kolom ini akan dihapus di migration berikutnya
          message:         messageEnc,
          destroy_at,
          status:          null,
        });
        purge();
      } catch(e) {
        console.error('[whisper] delayed insert error:', e);
      }
    });

    return; // response sudah dikirim di atas
  }

  // ── GET — fetch inbox ───────────────────────────────────
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
      // from_hash tidak lagi di-select — field ini akan deprecated
      `&select=id,message,created_at,destroy_at` +
      `&order=created_at.desc&limit=20`
    );

    purge();
    return res.status(200).json(data || []);
  }

  // ── PATCH — tandai dibaca, percepat destroy ─────────────
  if (req.method === 'PATCH') {
    const { id, username } = req.body || {};

    if (!id || !validUser(username))
      return res.status(400).json({ error: 'Missing params' });

    const { data: existing } = await sb(
      'GET',
      `/whispers?id=eq.${id}&target_username=eq.${encodeURIComponent(username)}&status=is.null&select=id`
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

  // ── DELETE — force destroy ──────────────────────────────
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
