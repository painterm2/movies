import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, syncPayload } from '../src/sync.js';
import { emptyState, migrate } from '../src/store.js';
import handler from '../api/state.js';
import tmdbHandler from '../api/tmdb.js';

const mk = (updatedAt, movies, order = []) => ({ ...emptyState(), updatedAt, movies, order });
const film = (key, rating = null) => ({ key, title: key, year: 2000, rating, meta: null });

test('merge keeps additions from both devices and the newer ranking order', () => {
  const phone = mk(200, { a: film('a', 5), b: film('b', 4) }, ['b', 'a']);
  const laptop = mk(100, { a: film('a', 5), c: film('c', 3) }, ['a', 'c']);
  const m = mergeStates(laptop, phone);
  assert.deepEqual(Object.keys(m.movies).sort(), ['a', 'b', 'c']);
  assert.deepEqual(m.order, ['b', 'a', 'c']);
  assert.equal(m.updatedAt, 200);
});

test('old bucketed saves migrate to one ordered list', () => {
  const old = { movies: {}, rank: { loved: ['a'], liked: ['b'], meh: ['c'] } };
  assert.deepEqual(migrate(old).order, ['a', 'b', 'c']);
  assert.equal('rank' in old, false);
});

test('merge fills a rating the newer side lacks', () => {
  const m = mergeStates(mk(2, { a: film('a') }), mk(1, { a: film('a', 4) }));
  assert.equal(m.movies.a.rating, 4);
});

test('sync payload never includes settings (passphrase / keys)', () => {
  const s = emptyState(); s.settings.syncPass = 'secret'; s.settings.tmdbKey = 'k';
  assert.ok(!JSON.stringify(syncPayload(s)).includes('secret'));
  assert.ok(!('settings' in syncPayload(s)));
});

// --- API handlers with a fake redis + req/res ---
import login from '../api/login.js';
import { sessionToken, COOKIE } from '../api/_auth.js';

function call(h, { method = 'GET', bearer, cookie, body, query = {} } = {}) {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
      json(b) { resolve({ code: this.code, body: b, headers: this.headers }); } };
    h({ method, body, query, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(cookie ? { cookie } : {}) } }, res);
  });
}
function fakeRedis() {
  const store = {};
  process.env.SYNC_PASSWORD = 'pw'; process.env.KV_REST_API_URL = 'http://r'; process.env.KV_REST_API_TOKEN = 't'; process.env.NODE_ENV = 'test';
  delete process.env.REQUIRE_LOGIN_TO_VIEW;
  globalThis.fetch = async (_u, init) => {
    const [cmd, k, v] = JSON.parse(init.body);
    if (cmd === 'SET') store[k] = v;
    return { ok: true, json: async () => ({ result: cmd === 'GET' ? store[k] ?? null : 'OK' }) };
  };
}
const ownerCookie = () => `${COOKIE}=${sessionToken('pw')}`;

test('login: wrong passphrase rejected; right one sets a year-long HttpOnly cookie', async () => {
  fakeRedis();
  assert.equal((await call(login, { method: 'POST', body: { passphrase: 'nope' } })).code, 401);
  const ok = await call(login, { method: 'POST', body: { passphrase: 'pw' } });
  assert.equal(ok.code, 200);
  const c = ok.headers['Set-Cookie'];
  assert.ok(c.includes(sessionToken('pw')) && /HttpOnly/.test(c) && /Secure/.test(c) && /Max-Age=31536000/.test(c));
  assert.ok(!c.includes('pw;')); // the passphrase itself is never put in the cookie
  assert.match((await call(login, { method: 'POST', body: { logout: true } })).headers['Set-Cookie'], /Max-Age=0/);
});

test('state API: anyone can view, only the owner can write', async () => {
  fakeRedis();
  assert.equal((await call(handler, { method: 'PUT', body: { state: { a: 1 } } })).code, 401);          // stranger can't write
  assert.equal((await call(handler, { method: 'PUT', cookie: `${COOKIE}=forged`, body: { state: { a: 1 } } })).code, 401);
  assert.equal((await call(handler, { method: 'PUT', cookie: ownerCookie(), body: { state: { hello: 1 } } })).code, 200);
  const viewer = await call(handler);                                                                    // stranger can read
  assert.deepEqual(viewer.body.state, { hello: 1 });
  assert.equal(viewer.body.owner, false);
  assert.equal(viewer.body.tmdbProxy, false);                                                            // and gets no TMDB access
  assert.equal((await call(handler, { cookie: ownerCookie() })).body.owner, true);
});

test('REQUIRE_LOGIN_TO_VIEW locks reading too; unset password refuses to run', async () => {
  fakeRedis(); process.env.REQUIRE_LOGIN_TO_VIEW = '1';
  assert.equal((await call(handler)).code, 401);
  assert.equal((await call(handler, { cookie: ownerCookie() })).code, 200);
  delete process.env.REQUIRE_LOGIN_TO_VIEW; delete process.env.SYNC_PASSWORD;
  assert.equal((await call(handler)).code, 503);
});

test('tmdb proxy: owner only, known paths only, key injected server-side', async () => {
  process.env.SYNC_PASSWORD = 'pw'; process.env.TMDB_API_KEY = 'serverkey';
  let seen;
  globalThis.fetch = async u => { seen = String(u); return { status: 200, json: async () => ({ ok: 1 }) }; };
  assert.equal((await call(tmdbHandler, { query: { path: '/movie/1' } })).code, 401);                    // signed-out visitor
  assert.equal((await call(tmdbHandler, { cookie: ownerCookie(), query: { path: '/account/1' } })).code, 400);
  const r = await call(tmdbHandler, { cookie: ownerCookie(), query: { path: '/search/movie', query: 'heat' } });
  assert.equal(r.code, 200);
  assert.ok(seen.includes('api_key=serverkey') && seen.includes('query=heat'));
});
