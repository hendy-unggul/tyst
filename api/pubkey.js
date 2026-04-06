// api/pubkey.js
// Vercel Serverless Function
//
// Endpoint khusus untuk manajemen public key ECDH (P-256).
// Private key TIDAK PERNAH meninggalkan device user.
// Server hanya menyimpan pubkey dalam format JWK (JSON Web Key).
//
// GET  /api/pubkey?username=x  → ambil pubkey milik user x
// PUT  /api/pubkey              → simpan/update pubkey milik user sendiri
//
// ENV:
//   SUPABASE_URL         = https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY = service_role key

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Supabase helper ───────────────────────────────────────
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

// ── Rate limit (global counter, no IP) ───────────────────
const _rl = { get: [], put: [] };
const LIMITS = {
  // GET pubkey dipanggil setiap kali ada whisper masuk — limit lebih longgar
  get: { max: 300, windowMs: 60000 },
  // PUT hanya saat register / keypair rotation — limit ketat
  put: { max: 10,  windowMs: 60000 },
};
function rateLimit(type) {
  const now = Date.now(), cfg = LIMITS[type];
  _rl[type] = _rl[type].filter(t => now - t < cfg.windowMs);
  if (_rl[type].length >= cfg.max) return false;
  _rl[type].push(now);
  return true;
}

// ── Validasi username ────────────────────────────────────
const validUser = s => typeof s === 'string' && /^[a-z0-9_.]{2,24}$/.test(s);

// ── Validasi JWK pubkey P-256 (format minimal) ───────────
// Hanya menerima public key ECDH P-256 dalam format JWK.
// Mencegah user menyimpan data arbitrary di kolom pubkey.
function validPubkeyJWK(jwk) {
  if (!jwk || typeof jwk !== 'object') return false;
  if (jwk.kty !== 'EC')                return false;
  if (jwk.crv !== 'P-256')            return false;
  if (typeof jwk.x !== 'string')      return false;
  if (typeof jwk.y !== 'string')      return false;
  // Pastikan tidak ada private key component (d) yang ikut tersimpan
  if ('d' in jwk)                      return false;
  return true;
}

// ═══════════════════════════════════════════════════════════
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET — ambil pubkey milik username tertentu ──────────
  if (req.method === 'GET') {
    const { username } = req.query;

    if (!validUser(username))
      return res.status(400).json({ error: 'Invalid username' });

    if (!rateLimit('get'))
      return res.status(429).json({ error: 'Too many requests' });

    const { data } = await sb(
      'GET',
      `/profiles?username=eq.${encodeURIComponent(username)}&select=pubkey&limit=1`
    );

    const pubkey = data?.[0]?.pubkey;
    if (!pubkey)
      return res.status(404).json({ error: 'No pubkey registered for this user' });

    // Cache pubkey agresif — pubkey jarang berubah
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ pubkey: JSON.parse(pubkey) });
  }

  // ── PUT — simpan pubkey milik user sendiri ──────────────
  // Memerlukan userId untuk verifikasi kepemilikan
  if (req.method === 'PUT') {
    if (!rateLimit('put'))
      return res.status(429).json({ error: 'Too many requests' });

    const { username, userId, pubkey } = req.body || {};

    if (!validUser(username))
      return res.status(400).json({ error: 'Invalid username' });

    if (!userId || typeof userId !== 'string')
      return res.status(400).json({ error: 'Missing userId' });

    if (!validPubkeyJWK(pubkey))
      return res.status(400).json({ error: 'Invalid pubkey format — must be P-256 ECDH JWK without private component' });

    // Verifikasi bahwa userId memang milik username ini
    const { data: check } = await sb(
      'GET',
      `/profiles?id=eq.${encodeURIComponent(userId)}&username=eq.${encodeURIComponent(username)}&select=id&limit=1`
    );

    if (!check?.length)
      return res.status(403).json({ error: 'Unauthorized' });

    // Simpan pubkey sebagai JSON string
    const { status } = await sb(
      'PATCH',
      `/profiles?id=eq.${encodeURIComponent(userId)}`,
      { pubkey: JSON.stringify(pubkey) }
    );

    if (status >= 300)
      return res.status(500).json({ error: 'Failed to store pubkey' });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
