import { isOwner } from './_auth.js';
import { redis, redisConfigured } from './_redis.js';

const KEY = 'reel-taste:state';
const MAX_BYTES = 900_000; // stay under Upstash's 1 MB request limit

// GET is open so the site shows your library on any device with no sign-in (set
// REQUIRE_LOGIN_TO_VIEW=1 to lock that down too). PUT always requires the owner.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.SYNC_PASSWORD) return res.status(503).json({ error: 'SYNC_PASSWORD is not set on the server.' });
  if (!redisConfigured()) return res.status(503).json({ error: 'No database connected (add Upstash Redis in Vercel → Storage).' });
  const owner = isOwner(req);

  try {
    if (req.method === 'GET') {
      if (!owner && process.env.REQUIRE_LOGIN_TO_VIEW) return res.status(401).json({ error: 'Sign in to view.', owner: false });
      const raw = await redis('GET', KEY);
      return res.status(200).json({ state: raw ? JSON.parse(raw) : null, owner, tmdbProxy: owner && Boolean(process.env.TMDB_API_KEY) });
    }
    if (!owner) return res.status(401).json({ error: 'Sign in to make changes.' });
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body.state !== 'object' || body.state === null) return res.status(400).json({ error: 'Missing state.' });
      const raw = JSON.stringify(body.state);
      if (raw.length > MAX_BYTES) return res.status(413).json({ error: 'Library too large to sync.' });
      await redis('SET', KEY, raw);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
