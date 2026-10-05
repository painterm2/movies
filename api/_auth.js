import { createHmac, timingSafeEqual } from 'node:crypto';

// Single-owner site. The owner proves themselves once per device with SYNC_PASSWORD; the server
// then sets a long-lived HttpOnly cookie (JavaScript on the page can never read it).
export const COOKIE = 'eastman_session';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// Derived from the passphrase, so changing SYNC_PASSWORD signs every device out.
export const sessionToken = password => createHmac('sha256', password).update('eastman-session-v1').digest('hex');

export function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => {
    const i = c.indexOf('=');
    return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
  }));
}

export const passphraseOk = given => Boolean(process.env.SYNC_PASSWORD) && same(given ?? '', process.env.SYNC_PASSWORD);

// Owner = valid session cookie, or the passphrase as a bearer token (scripts / tests).
export function isOwner(req) {
  const password = process.env.SYNC_PASSWORD;
  if (!password) return false; // never run open if the owner forgot to set it
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer && same(bearer, password)) return true;
  const cookie = cookies(req)[COOKIE];
  return Boolean(cookie) && same(cookie, sessionToken(password));
}
