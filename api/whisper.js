// api/whisper.js
// Vercel Serverless Function — Security Layer 4
//
// ENV:
//   SUPABASE_URL         = https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY = sb_secret_... (new format) or eyJ... (legacy)

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Helper Supabase — supports both legacy eyJ... and new sb_secret_... ──
async function sb(method, path, body) {
  const isLegacy = SUPA_KEY && SUPA_KEY.startsWith('eyJ');
  const headers = {
    'Content-Type': 'application/json',
    Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
  };
  if (isLegacy) {
    headers['apikey'] = SUPA_KEY;
    headers['Authorization'] = `Bearer ${SUPA_KEY}`;
  } else {
    // New sb_secret_... format
    headers['Authorization'] = `Bearer ${SUPA_KEY}`;
    headers['apikey'] = SUPA_KEY;
    headers['x-supabase-api-key'] = SUPA_KEY;
  }
  const opts = { method, headers };
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

// ── Hash IP ─────────────────────────────────────────────────────────────
async function hashIP(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const raw = `${ip}:${today}:wh_rl_salt_v1`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ── Rate limit ──────────────────────────────────────────────────────────
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_POST_IP = 30;
const RATE_POST_RECIPIENT = 20;
const RATE_GET = 200;

async function checkRateLimit(key, max) {
  try {
    const { data: existing } = await sb('GET', `/whisper_ratelimit?key=eq.${encodeURIComponent(key)}&select=count,expires_at&limit=1`);
    const entry = existing?.[0];
    const now = new Date();
    if (!entry) {
      const expires_at = new Date(now.getTime() + RATE_WINDOW_MS).toISOString();
      await sb('POST', '/whisper_ratelimit', { key, count: 1, window_start: now.toISOString(), expires_at });
      return { allowed: true, count: 1 };
    }
    if (new Date(entry.expires_at) < now) {
      const expires_at = new Date(now.getTime() + RATE_WINDOW_MS).toISOString();
      await sb('PATCH', `/whisper_ratelimit?key=eq.${encodeURIComponent(key)}`, { count: 1, window_start: now.toISOString(), expires_at });
      return { allowed: true, count: 1 };
    }
    const newCount = (entry.count || 0) + 1;
    if (newCount > max) return { allowed: false, count: entry.count };
    await sb('PATCH', `/whisper_ratelimit?key=eq.${encodeURIComponent(key)}`, { count: newCount });
    return { allowed: true, count: newCount };
  } catch (e) {
    console.error('[ratelimit] error:', e);
    return { allowed: true, count: 0 };
  }
}

// ── Validators ──────────────────────────────────────────────────────────
const validUser = s => typeof s === 'string' && /^[a-z0-9_.]{2,24}$/.test(s);

function validCiphertext(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 100 || s.length > 16000) return false;
  const parts = s.split(':');
  if (parts.length !== 3) return false;
  const b64re = /^[A-Za-z0-9+/]+=*$/;
  for (const p of parts) if (!p || p.length < 4 || !b64re.test(p)) return false;
  try {
    const pub = JSON.parse(atob(parts[1]));
    if (pub.kty !== 'EC' || pub.crv !== 'P-256' || !pub.x || !pub.y || pub.d) return false;
  } catch { return false; }
  return true;
}

const hasUnknownFields = (body, allowed) => Object.keys(body || {}).some(k => !allowed.has(k));

function getIP(req) {
  return req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
}

const MIN_RESPONSE_MS = 200;
async function normalizedResponse(startTime, res, status, body) {
  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_RESPONSE_MS) await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed));
  return res.status(status).json(body);
}

function purge() {
  sb('DELETE', `/whispers?destroy_at=lt.${new Date().toISOString()}`).catch(() => {});
  sb('DELETE', `/whispers?status=eq.destroyed`).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  const startTime = Date.now();
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (JSON.stringify(req.body || {}).length > 20000)
    return normalizedResponse(startTime, res, 413, { error: 'Payload too large' });

  // ── POST (anonim, tanpa auth) ────────────────────────────────────────
  if (req.method === 'POST') {
    if (hasUnknownFields(req.body, new Set(['to', 'messageEnc'])))
      return normalizedResponse(startTime, res, 400, { error: 'Unknown fields' });
    if ('fromHash' in req.body || 'from_hash' in req.body)
      return normalizedResponse(startTime, res, 400, { error: 'Sender identity field not accepted' });

    const { to, messageEnc } = req.body || {};
    if (!validUser(to)) return normalizedResponse(startTime, res, 400, { error: 'Invalid recipient' });
    if (!validCiphertext(messageEnc)) return normalizedResponse(startTime, res, 400, { error: 'Invalid ciphertext' });

    const ip = getIP(req);
    const ipKey = 'ip:' + await hashIP(ip);
    const ipCheck = await checkRateLimit(ipKey, RATE_POST_IP);
    if (!ipCheck.allowed) return normalizedResponse(startTime, res, 429, { error: 'Rate limit exceeded (IP)' });

    const rcptKey = 'rcpt:' + to;
    const rcptCheck = await checkRateLimit(rcptKey, RATE_POST_RECIPIENT);
    if (!rcptCheck.allowed) return normalizedResponse(startTime, res, 429, { error: 'Too many messages to this recipient' });

    const { data: recipientCheck } = await sb('GET', `/profiles?username=eq.${encodeURIComponent(to)}&select=id&limit=1`);
    if (!recipientCheck?.length)
      return normalizedResponse(startTime, res, 202, { ok: true, queued: true });

    res.status(202).json({ ok: true, queued: true });

    const destroy_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const delay = 2000 + Math.random() * 30000 + Math.random() * 15000;
    setTimeout(async () => {
      try {
        await sb('POST', '/whispers', { target_username: to, message: messageEnc, destroy_at, status: null });
        purge();
      } catch (e) { console.error('[whisper] delayed insert error:', e); }
    }, delay);
    return;
  }

  // ── AUTH MIDDLEWARE (GET, PATCH, DELETE) ─────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return normalizedResponse(startTime, res, 401, { error: 'Missing or invalid authentication token' });

  const token = authHeader.split(' ')[1];
  let targetUsername = req.method === 'GET' ? req.query.username : req.body?.username;
  if (!targetUsername || !validUser(targetUsername))
    return normalizedResponse(startTime, res, 400, { error: 'Invalid username' });

  const { data: profileData } = await sb('GET', `/profiles?username=eq.${encodeURIComponent(targetUsername)}&select=auth_hash&limit=1`);
  const storedHash = profileData?.[0]?.auth_hash;
  if (!storedHash || storedHash !== token)
    return normalizedResponse(startTime, res, 403, { error: 'Forbidden: invalid token for this user' });

  // ── GET ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const ip = getIP(req);
    const ipKey = 'get:' + await hashIP(ip);
    const ipCheck = await checkRateLimit(ipKey, RATE_GET);
    if (!ipCheck.allowed) return normalizedResponse(startTime, res, 429, { error: 'Rate limit exceeded' });

    const now = new Date().toISOString();
    const { data } = await sb(
      'GET',
      `/whispers?target_username=eq.${encodeURIComponent(targetUsername)}` +
      `&destroy_at=gt.${encodeURIComponent(now)}&status=is.null` +
      `&select=id,message,created_at,destroy_at&order=created_at.desc&limit=20`
    );
    purge();
    return normalizedResponse(startTime, res, 200, data || []);
  }

  // ── PATCH ────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    if (hasUnknownFields(req.body, new Set(['id', 'username'])))
      return normalizedResponse(startTime, res, 400, { error: 'Unknown fields' });
    const { id } = req.body || {};
    if (!id || typeof id !== 'string')
      return normalizedResponse(startTime, res, 400, { error: 'Missing id' });

    const { data: existing } = await sb(
      'GET',
      `/whispers?id=eq.${encodeURIComponent(id)}&target_username=eq.${encodeURIComponent(targetUsername)}&status=is.null&select=id`
    );
    if (!existing?.length) return normalizedResponse(startTime, res, 404, { error: 'Not found or already destroyed' });

    const now = new Date().toISOString();
    const destroy_at = new Date(Date.now() + 6000).toISOString();
    await sb('PATCH', `/whispers?id=eq.${encodeURIComponent(id)}`, { read_at: now, destroy_at });
    setTimeout(() => {
      sb('PATCH', `/whispers?id=eq.${encodeURIComponent(id)}`, { status: 'destroyed' }).catch(() => {});
      purge();
    }, 6500);
    return normalizedResponse(startTime, res, 200, { ok: true });
  }

  // ── DELETE ───────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (hasUnknownFields(req.body, new Set(['id', 'username'])))
      return normalizedResponse(startTime, res, 400, { error: 'Unknown fields' });
    const { id } = req.body || {};
    if (!id || typeof id !== 'string')
      return normalizedResponse(startTime, res, 400, { error: 'Missing id' });

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
