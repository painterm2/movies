import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, rank } from '../src/recommend.js';
import { MOODS } from '../src/moods.js';
import { DEMO_CATALOG, demoLibrary } from '../src/demo.js';
import { computeScores, seedFromRatings } from '../src/ranking.js';

function setup() {
  const movies = demoLibrary();
  const r = []; seedFromRatings(r, movies);
  const scores = computeScores(r);
  const profile = buildProfile(Object.values(movies).map(m => ({ meta: m.meta, score: scores[m.key] })));
  return { movies, profile };
}

test('profile favors loved genres and disfavors disliked ones', () => {
  const { profile } = setup();
  assert.ok(profile.genres['Science Fiction'] > 0);
  assert.ok(profile.genres['Horror'] < profile.genres['Science Fiction']);
});

test('recommendations exclude watched films and are sorted', () => {
  const { movies, profile } = setup();
  const out = rank(DEMO_CATALOG.map(meta => ({ meta })), profile, { exclude: new Set(Object.keys(movies)) });
  assert.ok(out.length > 0);
  assert.ok(out.every(c => !movies[c.meta.key]));
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].score >= out[i].score);
});

test('mood filters clashing genres and honors runtime', () => {
  const { movies, profile } = setup();
  const exclude = new Set(Object.keys(movies));
  const laugh = rank(DEMO_CATALOG.map(meta => ({ meta })), profile, { exclude, mood: MOODS.find(m => m.id === 'laugh') });
  assert.ok(laugh.length && laugh.every(c => c.meta.genres.includes('Comedy') || !c.meta.genres.some(g => ['Horror', 'War', 'Drama'].includes(g))));
  const short = rank(DEMO_CATALOG.map(meta => ({ meta })), profile, { exclude, mood: MOODS.find(m => m.id === 'short') });
  assert.ok(short.every(c => c.meta.runtime <= 100));
});

import { pickBestMatch } from '../src/tmdb.js';
test('tmdb match prefers exact title + nearest year; falls back to exact title; never a wrong title', () => {
  const rs = [{ title: 'Heat (remake)', release_date: '2020-01-01' }, { title: 'Heat', release_date: '1995-12-15' }, { title: 'Heat', release_date: '1986-01-01' }];
  assert.equal(pickBestMatch(rs, 'Heat', 1996).release_date, '1995-12-15');
  assert.equal(pickBestMatch(rs, 'Heat', 2005).release_date, '1995-12-15'); // exact title, far year: still better than no poster
  assert.equal(pickBestMatch([{ title: 'Something Else', release_date: '1990-01-01' }], 'Heat', 1995), null);
  assert.equal(pickBestMatch(rs, 'Heat', null).release_date, '1995-12-15');
});
