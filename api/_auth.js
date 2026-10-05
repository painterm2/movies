import { timingSafeEqual } from 'node:crypto';

// Single-user site: one shared passphrase (SYNC_PASSWORD env var) sent as a bearer token.
export function authorized(req) {
  const expected = process.env.SYNC_PASSWORD;
  if (!expected) return false; // never run open if the owner forgot to set it
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
