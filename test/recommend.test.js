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
