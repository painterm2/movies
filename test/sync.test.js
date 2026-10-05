import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, syncPayload } from '../src/sync.js';
import { emptyState } from '../src/store.js';
import handler from '../api/state.js';
import tmdbHandler from '../api/tmdb.js';

const mk = (updatedAt, movies, rank) => ({ ...emptyState(), updatedAt, movies, rank: { loved: [], liked: [], meh: [], ...rank } });
const film = (key, rating = null) => ({ key, title: key, year: 2000, rating, meta: null });

test('merge keeps additions from both devices and the newer ranking order', () => {
  const phone = mk(200, { a: film('a', 5), b: film('b', 4) }, { loved: ['b', 'a'] });
  const laptop = mk(100, { a: film('a', 5), c: film('c', 3) }, { loved: ['a'], liked: ['c'] });
  const m = mergeStates(laptop, phone);
  assert.deepEqual(Object.keys(m.movies).sort(), ['a', 'b', 'c']);
  assert.deepEqual(m.rank.loved, ['b', 'a']);
  assert.deepEqual(m.rank.liked, ['c']);
  assert.equal(m.updatedAt, 200);
});

test('merge fills a rating the newer side lacks', () => {
  const m = mergeStates(mk(2, { a: film('a') }, {}), mk(1, { a: film('a', 4) }, {}));
  assert.equal(m.movies.a.rating, 4);
});

test('sync payload never includes settings (passphrase / keys)', () => {
  const s = emptyState(); s.settings.syncPass = 'secret'; s.settings.tmdbKey = 'k';
  assert.ok(!JSON.stringify(syncPayload(s)).includes('secret'));
  assert.ok(!('settings' in syncPayload(s)));
});

// --- API handlers with a fake redis + req/res ---
function call(h, { method = 'GET', auth = 'pw', body, query = {} } = {}) {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } };
    h({ method, body, query, headers: auth ? { authorization: `Bearer ${auth}` } : {} }, res);
  });
}

test('state API: auth required, round-trips through redis', async () => {
  const store = {};
  process.env.SYNC_PASSWORD = 'pw'; process.env.KV_REST_API_URL = 'http://r'; process.env.KV_REST_API_TOKEN = 't';
  globalThis.fetch = async (_u, init) => {
    const [cmd, k, v] = JSON.parse(init.body);
    if (cmd === 'SET') store[k] = v;
    return { ok: true, json: async () => ({ result: cmd === 'GET' ? store[k] ?? null : 'OK' }) };
  };
  assert.equal((await call(handler, { auth: 'nope' })).code, 401);
  assert.equal((await call(handler, { auth: '' })).code, 401);
  assert.equal((await call(handler)).body.state, null);
  assert.equal((await call(handler, { method: 'PUT', body: { state: { hello: 1 } } })).code, 200);
  assert.deepEqual((await call(handler)).body.state, { hello: 1 });
  delete process.env.SYNC_PASSWORD;
  assert.equal((await call(handler)).code, 503); // refuses to run unprotected
});

test('tmdb proxy only allows known paths and injects the key server-side', async () => {
  process.env.SYNC_PASSWORD = 'pw'; process.env.TMDB_API_KEY = 'serverkey';
  let seen;
  globalThis.fetch = async u => { seen = String(u); return { status: 200, json: async () => ({ ok: 1 }) }; };
  assert.equal((await call(tmdbHandler, { query: { path: '/account/1' } })).code, 400);
  assert.equal((await call(tmdbHandler, { auth: 'bad', query: { path: '/movie/1' } })).code, 401);
  const r = await call(tmdbHandler, { query: { path: '/search/movie', query: 'heat' } });
  assert.equal(r.code, 200);
  assert.ok(seen.includes('api_key=serverkey') && seen.includes('query=heat'));
});
