import { COOKIE, COOKIE_MAX_AGE, passphraseOk, sessionToken } from './_auth.js';

const attrs = 'Path=/; HttpOnly; Secure; SameSite=Lax';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  if (!process.env.SYNC_PASSWORD) return res.status(503).json({ error: 'SYNC_PASSWORD is not set on the server.' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  if (body.logout) {
    res.setHeader('Set-Cookie', `${COOKIE}=; ${attrs}; Max-Age=0`);
    return res.status(200).json({ ok: true });
  }
  if (!passphraseOk(body.passphrase)) {
    await new Promise(r => setTimeout(r, process.env.NODE_ENV === 'test' ? 0 : 600)); // slow down guessing
    return res.status(401).json({ error: 'Wrong passphrase.' });
  }
  res.setHeader('Set-Cookie', `${COOKIE}=${sessionToken(process.env.SYNC_PASSWORD)}; ${attrs}; Max-Age=${COOKIE_MAX_AGE}`);
  return res.status(200).json({ ok: true });
}
