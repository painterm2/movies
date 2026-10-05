import { authorized } from './_auth.js';

// Server-side TMDB proxy so the TMDB key lives in a Vercel env var, not in any browser.
const ALLOWED = /^\/(search\/movie|discover\/movie|movie\/\d+(\/recommendations)?)$/;

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'Wrong passphrase.' });
  const key = process.env.TMDB_API_KEY;
  if (!key) return res.status(503).json({ error: 'TMDB_API_KEY is not set on the server.' });
  const { path, ...rest } = req.query;
  if (typeof path !== 'string' || !ALLOWED.test(path)) return res.status(400).json({ error: 'Path not allowed.' });

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(rest)) if (typeof v === 'string') url.searchParams.set(k, v);
  const bearer = key.length > 40;
  if (!bearer) url.searchParams.set('api_key', key);
  try {
    const upstream = await fetch(url, bearer ? { headers: { Authorization: `Bearer ${key}` } } : {});
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(upstream.status).json(await upstream.json());
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
