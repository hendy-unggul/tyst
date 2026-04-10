// api/whisper.js
// Vercel Serverless Function — Security Layer 4 (dengan autentikasi hash PIN)
//
// PERUBAHAN UTAMA:
//   - GET, PATCH, DELETE mewajibkan header Authorization: Bearer <hash>
//   - Hash (jejak_auth_v1) diverifikasi ke kolom auth_hash di tabel profiles
//   - POST tetap anonim (tanpa auth)
//   - Rate limit persistent dengan atomic upsert (via RPC atau dua langkah)
//
// ENV:
//   SUPABASE_URL         = https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY = service_role key

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Helper Supabase (service role) ─────────────────────────────────────
async function sb(method, path, body) {
  const opts = {
    method,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, opts);
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

// ── CORS ────────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Hash IP untuk rate limit (tanpa menyimpan IP asli) ─────────────────
async function hashIP(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const raw = `${ip}:${today}:wh_rl_salt_v1`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ── Rate limit atomic (SELECT + UPDATE/INSERT dengan retry sederhana) ──
// Untuk production disarankan membuat fungsi RPC di Supabase.
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 jam
const RATE_POST_IP = 30;
const RATE_POST_RECIPIENT = 20;
const RATE_GET = 200; // buffer aman untuk polling 1 menit + manual refresh

async function checkRateLimit(key, max) {
  try {
    // Coba ambil data existing
    const { data: existing } = await sb('GET', `/whisper_ratelimit?key=eq.${encodeURIComponent(key)}&select=count,expires_at&limit=1`);
    const entry = existing?.[0];
    const now = new Date();

    if (!entry) {
      // Insert baru
      const expires_at = new Date(now.getTime() + RATE_WINDOW_MS).toISOString();
      await sb('POST', '/whisper_ratelimit', {
        key,
        count: 1,
        window_start: now.toISOString(),
        expires_at,
      });
      return { allowed: true, count: 1 };
    }

    // Cek apakah sudah expired
    if (new Date(entry.expires_at) < now) {
      const expires_at = new Date(now.getTime() + RATE_WINDOW_MS).toISOString();
      await sb('PATCH', `/whisper_ratelimit?key=eq.${encodeURIComponent(key)}`, {
        count: 1,
        window_start: now.toISOString(),
        expires_at,
      });
      return { allowed: true, count: 1 };
    }

    const newCount = (entry.count || 0) + 1;
    if (newCount > max) {
      return { allowed: false, count: entry.count };
    }

    await sb('PATCH', `/whisper_ratelimit?key=eq.${encodeURIComponent(key)}`, { count: newCount });
    return { allowed: true, count: newCount };
  } catch (e) {
    console.error('[ratelimit] error:', e);
    return { allowed: true, count: 0 }; // fail open
  }
}

// ── Validasi username ─────────────────────────────────────────────────
const validUser = s => typeof s === 'string' && /^[a-z0-9_.]{2,24}$/.test(s);

// ── Validasi ciphertext ECDH (iv:ephemeralPubKey:ciphertext) ─────────
function validCiphertext(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 100 || s.length > 16000) return false;
  const parts = s.split(':');
  if (parts.length !== 3) return false;
  const b64re = /^[A-Za-z0-9+/]+=*$/;
  for (const p of parts) if (!p || p.length < 4 || !b64re.test(p)) return false;
  // Validasi segment kedua adalah JWK public key P-256
  try {
    const pub = JSON.parse(atob(parts[1]));
    if (pub.kty !== 'EC' || pub.crv !== 'P-256' || !pub.x || !pub.y || pub.d) return false;
  } catch {
    return false;
  }
  return true;
}

// ── Cek unknown fields ────────────────────────────────────────────────
const hasUnknownFields = (body, allowed) => Object.keys(body || {}).some(k => !allowed.has(k));

// ── Dapatkan IP asli dari header ──────────────────────────────────────
function getIP(req) {
  return req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
}

// ── Response time normalization ───────────────────────────────────────
const MIN_RESPONSE_MS = 200;
async function normalizedResponse(startTime, res, status, body) {
  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_RESPONSE_MS) await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed));
  return res.status(status).json(body);
}

// ── Purge expired whispers (non‑blocking) ─────────────────────────────
function purge() {
  sb('DELETE', `/whispers?destroy_at=lt.${new Date().toISOString()}`).catch(() => {});
  sb('DELETE', `/whispers?status=eq.destroyed`).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  const startTime = Date.now();
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Body size cap
  if (JSON.stringify(req.body || {}).length > 20000) {
    return normalizedResponse(startTime, res, 413, { error: 'Payload too large' });
  }

  // ==================== POST (kirim whisper, tanpa auth) ====================
  if (req.method === 'POST') {
    // Tolak field tidak dikenal
    if (hasUnknownFields(req.body, new Set(['to', 'messageEnc']))) {
      return normalizedResponse(startTime, res, 400, { error: 'Unknown fields' });
    }
    if ('fromHash' in req.body || 'from_hash' in req.body) {
      return normalizedResponse(startTime, res, 400, { error: 'Sender identity field not accepted' });
    }
    const { to, messageEnc } = req.body || {};
    if (!validUser(to)) return normalizedResponse(startTime, res, 400, { error: 'Invalid recipient' });
    if (!validCiphertext(messageEnc)) return normalizedResponse(startTime, res, 400, { error: 'Invalid ciphertext' });

    // Rate limit per IP
    const ip = getIP(req);
    const ipKey = 'ip:' + await hashIP(ip);
    const ipCheck = await checkRateLimit(ipKey, RATE_POST_IP);
    if (!ipCheck.allowed) return normalizedResponse(startTime, res, 429, { error: 'Rate limit exceeded (IP)' });

    // Rate limit per recipient (mencegah harassment)
    const rcptKey = 'rcpt:' + to;
    const rcptCheck = await checkRateLimit(rcptKey, RATE_POST_RECIPIENT);
    if (!rcptCheck.allowed) return normalizedResponse(startTime, res, 429, { error: 'Too many messages to this recipient' });

    // Cek apakah penerima ada (tanpa memberi tahu client)
    const { data: recipientCheck } = await sb('GET', `/profiles?username=eq.${encodeURIComponent(to)}&select=id&limit=1`);
    if (!recipientCheck?.length) {
      // User tidak ada → tetap return 202 (tidak bocorkan informasi)
      return normalizedResponse(startTime, res, 202, { ok: true, queued: true });
    }

    // Langsung return 202, insert dilakukan setelah random delay
    res.status(202).json({ ok: true, queued: true });

    const destroy_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const delay = 2000 + Math.random() * 30000 + Math.random() * 15000; // 2–47 detik
    setTimeout(async () => {
      try {
        await sb('POST', '/whispers', {
          target_username: to,
          message: messageEnc,
          destroy_at,
          status: null,
        });
        purge();
      } catch (e) {
        console.error('[whisper] delayed insert error:', e);
      }
    }, delay);
    return;
  }

  // ==================== MIDDLEWARE AUTENTIKASI (untuk GET, PATCH, DELETE) ====================
  // Semua method selain POST WAJIB memiliki token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return normalizedResponse(startTime, res, 401, { error: 'Missing or invalid authentication token' });
  }
  const token = authHeader.split(' ')[1]; // token = hash (jejak_auth_v1)

  // Dapatkan username dari query (GET) atau body (PATCH/DELETE)
  let targetUsername = null;
  if (req.method === 'GET') {
    targetUsername = req.query.username;
  } else {
    targetUsername = req.body?.username;
  }
  if (!targetUsername || !validUser(targetUsername)) {
    return normalizedResponse(startTime, res, 400, { error: 'Invalid username' });
  }

  // Verifikasi token terhadap auth_hash di database
  const { data: profileData } = await sb('GET', `/profiles?username=eq.${encodeURIComponent(targetUsername)}&select=auth_hash&limit=1`);
  const storedHash = profileData?.[0]?.auth_hash;
  if (!storedHash || storedHash !== token) {
    // Token tidak cocok → forbidden
    return normalizedResponse(startTime, res, 403, { error: 'Forbidden: invalid token for this user' });
  }

  // ==================== GET — ambil inbox ====================
  if (req.method === 'GET') {
    const ip = getIP(req);
    const ipKey = 'get:' + await hashIP(ip);
    const ipCheck = await checkRateLimit(ipKey, RATE_GET);
    if (!ipCheck.allowed) {
      return normalizedResponse(startTime, res, 429, { error: 'Rate limit exceeded' });
    }

    const now = new Date().toISOString();
    const { data } = await sb(
      'GET',
      `/whispers?target_username=eq.${encodeURIComponent(targetUsername)}` +
      `&destroy_at=gt.${encodeURIComponent(now)}` +
      `&status=is.null` +
      `&select=id,message,created_at,destroy_at` +
      `&order=created_at.desc&limit=20`
    );
    purge();
    return normalizedResponse(startTime, res, 200, data || []);
  }

  // ==================== PATCH — tandai dibaca (percepat destroy) ====================
  if (req.method === 'PATCH') {
    if (hasUnknownFields(req.body, new Set(['id', 'username']))) {
      return normalizedResponse(startTime, res, 400, { error: 'Unknown fields' });
    }
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') {
      return normalizedResponse(startTime, res, 400, { error: 'Missing id' });
    }

    // Pastikan pesan milik user ini dan belum dihancurkan
    const { data: existing } = await sb(
      'GET',
      `/whispers?id=eq.${encodeURIComponent(id)}` +
      `&target_username=eq.${encodeURIComponent(targetUsername)}` +
      `&status=is.null&select=id`
    );
    if (!existing?.length) {
      return normalizedResponse(startTime, res, 404, { error: 'Not found or already destroyed' });
    }

    const now = new Date().toISOString();
    const destroy_at = new Date(Date.now() + 6000).toISOString(); // +6 detik
    await sb('PATCH', `/whispers?id=eq.${encodeURIComponent(id)}`, { read_at: now, destroy_at });

    // Setelah 6.5 detik, tandai sebagai destroyed
    setTimeout(() => {
      sb('PATCH', `/whispers?id=eq.${encodeURIComponent(id)}`, { status: 'destroyed' }).catch(() => {});
      purge();
    }, 6500);

    return normalizedResponse(startTime, res, 200, { ok: true });
  }

  // ==================== DELETE — force destroy ====================
  if (req.method === 'DELETE') {
    if (hasUnknownFields(req.body, new Set(['id', 'username']))) {
      return normalizedResponse(startTime, res, 400, { error: 'Unknown fields' });
    }
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') {
      return normalizedResponse(startTime, res, 400, { error: 'Missing id' });
    }

    await sb(
      'PATCH',
      `/whispers?id=eq.${encodeURIComponent(id)}&target_username=eq.${encodeURIComponent(targetUsername)}`,
      { status: 'destroyed', destroy_at: new Date().toISOString() }
    );
    purge();
    return normalizedResponse(startTime, res, 200, { ok: true });
  }

  return normalizedResponse(startTime, res, 405, { error: 'Method not allowed' });
}
