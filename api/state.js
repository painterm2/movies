import { authorized } from './_auth.js';
import { redis, redisConfigured } from './_redis.js';

const KEY = 'reel-taste:state';
const MAX_BYTES = 900_000; // stay under Upstash's 1 MB request limit

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.SYNC_PASSWORD) return res.status(503).json({ error: 'SYNC_PASSWORD is not set on the server.' });
  if (!authorized(req)) return res.status(401).json({ error: 'Wrong passphrase.' });
  if (!redisConfigured()) return res.status(503).json({ error: 'No database connected (add Upstash Redis in Vercel → Storage).' });

  try {
    if (req.method === 'GET') {
      const raw = await redis('GET', KEY);
      return res.status(200).json({ state: raw ? JSON.parse(raw) : null, tmdbProxy: Boolean(process.env.TMDB_API_KEY) });
    }
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
