// api/pubkey.js
// ENV:
//   SUPABASE_URL         = https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY = sb_secret_... or eyJ... (legacy)

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

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

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

const _rl = { get: [], put: [] };
const LIMITS = {
  get: { max: 300, windowMs: 60000 },
  put: { max: 10,  windowMs: 60000 },
};
function rateLimit(type) {
  const now = Date.now(), cfg = LIMITS[type];
  _rl[type] = _rl[type].filter(t => now - t < cfg.windowMs);
  if (_rl[type].length >= cfg.max) return false;
  _rl[type].push(now);
  return true;
}

const validUser = s => typeof s === 'string' && /^[a-z0-9_.]{2,24}$/.test(s);

function validPubkeyJWK(jwk) {
  if (!jwk || typeof jwk !== 'object') return false;
  if (jwk.kty !== 'EC')               return false;
  if (jwk.crv !== 'P-256')            return false;
  if (typeof jwk.x !== 'string')      return false;
  if (typeof jwk.y !== 'string')      return false;
  if ('d' in jwk)                     return false;
  return true;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET
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

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ pubkey: JSON.parse(pubkey) });
  }

  // PUT — verify via auth_hash (no userId needed)
  if (req.method === 'PUT') {
    if (!rateLimit('put'))
      return res.status(429).json({ error: 'Too many requests' });

    const { username, pubkey } = req.body || {};
    if (!validUser(username))
      return res.status(400).json({ error: 'Invalid username' });
    if (!validPubkeyJWK(pubkey))
      return res.status(400).json({ error: 'Invalid pubkey format' });

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ error: 'Missing auth token' });
    const token = authHeader.split(' ')[1];

    const { data: profile } = await sb(
      'GET',
      `/profiles?username=eq.${encodeURIComponent(username)}&select=id,auth_hash&limit=1`
    );
    if (!profile?.length)
      return res.status(404).json({ error: 'User not found' });

    if (profile[0].auth_hash && profile[0].auth_hash !== token)
      return res.status(403).json({ error: 'Unauthorized' });

    const { status } = await sb(
      'PATCH',
      `/profiles?id=eq.${encodeURIComponent(profile[0].id)}`,
      { pubkey: JSON.stringify(pubkey) }
    );
    if (status >= 300)
      return res.status(500).json({ error: 'Failed to store pubkey' });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
