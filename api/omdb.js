import { isOwner } from './_auth.js';

// Server-side OMDb proxy so OMDB_API_KEY never reaches a browser. Owner only.
export default async function handler(req, res) {
  if (!isOwner(req)) return res.status(401).json({ error: 'Sign in to see ratings.' });
  const key = process.env.OMDB_API_KEY;
  if (!key) return res.status(503).json({ error: 'OMDB_API_KEY is not set on the server.' });
  const { i } = req.query;
  if (typeof i !== 'string' || !/^tt\d{5,10}$/.test(i)) return res.status(400).json({ error: 'Bad IMDb id.' });
  try {
    const upstream = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=${i}`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(upstream.status).json(await upstream.json());
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
