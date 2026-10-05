import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOmdb, createOmdb } from '../src/omdb.js';
import { normalize, streamingInfo } from '../src/tmdb.js';
import omdbHandler from '../api/omdb.js';
import { sessionToken, COOKIE } from '../api/_auth.js';

test('parses Rotten Tomatoes, IMDb and Metacritic', () => {
  const r = parseOmdb({ Response: 'True', imdbRating: '8.3', Ratings: [{ Source: 'Internet Movie Database', Value: '8.3/10' }, { Source: 'Rotten Tomatoes', Value: '93%' }, { Source: 'Metacritic', Value: '80/100' }] });
  assert.deepEqual(r, { rt: 93, imdb: 8.3, metacritic: 80 });
  assert.deepEqual(parseOmdb({ imdbRating: '7.1', Ratings: [] }), { rt: null, imdb: 7.1, metacritic: null });
  assert.equal(parseOmdb({ Response: 'False' }), null);
  assert.equal(parseOmdb({ imdbRating: 'N/A', Ratings: [] }), null);
});

test('direct client builds the OMDb URL with the key', async () => {
  let seen; const c = createOmdb({ key: 'abc', fetchImpl: async u => { seen = String(u); return { ok: true, json: async () => ({ imdbRating: '7', Ratings: [] }) }; } });
  assert.equal((await c.get('tt0113277')).imdb, 7);
  assert.ok(seen.includes('apikey=abc') && seen.includes('i=tt0113277'));
});

test('tmdb normalize picks up imdb id; streamingInfo splits stream vs rent', () => {
  const m = normalize({ id: 1, title: 'X', release_date: '2000-01-01', external_ids: { imdb_id: 'tt1' },
    'watch/providers': { results: { US: { flatrate: [{ provider_name: 'Netflix', logo_path: '/n.jpg' }], rent: [{ provider_name: 'Apple TV' }], buy: [{ provider_name: 'Apple TV' }] } } } });
  assert.equal(m.imdbId, 'tt1');
  const s = streamingInfo(m, 'US');
  assert.deepEqual(s.stream.map(x => x.name), ['Netflix']);
  assert.deepEqual(s.rent.map(x => x.name), ['Apple TV']); // de-duplicated
  assert.deepEqual(streamingInfo(m, 'GB'), { stream: [], rent: [] });
  assert.equal(streamingInfo({ ...m, providers: null }, 'US'), null);
});

test('omdb proxy: owner only, validates the id, injects the key', async () => {
  process.env.SYNC_PASSWORD = 'pw'; process.env.OMDB_API_KEY = 'okey';
  const call = (query, cookie) => new Promise(resolve => omdbHandler({ headers: cookie ? { cookie } : {}, query }, { setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } }));
  const owner = `${COOKIE}=${sessionToken('pw')}`;
  assert.equal((await call({ i: 'tt0113277' })).code, 401);
  assert.equal((await call({ i: '../etc' }, owner)).code, 400);
  let seen; globalThis.fetch = async u => { seen = String(u); return { status: 200, json: async () => ({ ok: 1 }) }; };
  assert.equal((await call({ i: 'tt0113277' }, owner)).code, 200);
  assert.ok(seen.includes('apikey=okey'));
});

test('searchMany parses a trailing year and pages results', async () => {
  const { createClient } = await import('../src/tmdb.js');
  let seen; const api = createClient({ key: 'k', fetchImpl: async u => { seen = new URL(u); return { ok: true, json: async () => ({ results: [{ id: 1, title: 'Heat', release_date: '1995-12-15' }], total_pages: 3 }) }; } });
  const r = await api.searchMany('Heat 1995', 2);
  assert.equal(seen.searchParams.get('query'), 'Heat'); assert.equal(seen.searchParams.get('year'), '1995'); assert.equal(seen.searchParams.get('page'), '2');
  assert.equal(r.totalPages, 3); assert.equal(r.results[0].title, 'Heat');
  await api.searchMany('1917'); assert.equal(seen.searchParams.get('query'), '1917'); // a bare year-like title is not split
});
