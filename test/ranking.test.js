import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/ranking.js';

function place(rank, bucket, key, prefer) { // prefer(probeKey) => true if new film is better
  let s = R.startInsertion(rank[bucket].length), duels = 0;
  while (!R.isDone(s)) { s = R.answer(s, prefer(rank[bucket][R.probeIndex(s)])); duels++; }
  R.insertAt(rank, bucket, key, R.position(s));
  return duels;
}

test('binary insertion yields correct position with log2 duels', () => {
  const rank = R.emptyRank();
  rank.loved = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const duels = place(rank, 'loved', 'new', k => !['a', 'b', 'c'].includes(k)); // better than d-g, worse than a-c
  assert.deepEqual(rank.loved, ['a', 'b', 'c', 'new', 'd', 'e', 'f', 'g']);
  assert.ok(duels <= R.maxDuels(7));
});

test('inserting best / worst / into empty list', () => {
  const rank = R.emptyRank();
  place(rank, 'liked', 'x', () => true);
  place(rank, 'liked', 'top', () => true);
  place(rank, 'liked', 'bottom', () => false);
  assert.deepEqual(rank.liked, ['top', 'x', 'bottom']);
});

test('scores are monotonic and stay inside bucket ranges', () => {
  const rank = { loved: ['a', 'b', 'c'], liked: ['d'], meh: ['e', 'f'] };
  const s = R.computeScores(rank);
  assert.equal(s.a, 10); assert.equal(s.c, 7);
  assert.ok(s.a > s.b && s.b > s.c && s.c > s.d && s.d > s.e && s.e > s.f);
  assert.ok(s.d >= 4 && s.d <= 6.9);
});

test('seed from ratings orders by stars and buckets sensibly', () => {
  const movies = {
    a: { key: 'a', rating: 5 }, b: { key: 'b', rating: 4 }, c: { key: 'c', rating: 3 },
    d: { key: 'd', rating: 1.5 }, e: { key: 'e', rating: null },
  };
  const rank = R.emptyRank();
  assert.equal(R.seedFromRatings(rank, movies), 4);
  assert.deepEqual(rank, { loved: ['a', 'b'], liked: ['c'], meh: ['d'] });
});

test('refine swap', () => {
  const rank = { loved: ['a', 'b', 'c'], liked: [], meh: [] };
  const pair = R.pickRefinePair(rank, () => 0);
  R.swapPair(rank, pair);
  assert.deepEqual(rank.loved, ['b', 'a', 'c']);
});

test('favorites order pins listed films to the top of their bucket', () => {
  const rank = { loved: ['a', 'b', 'c', 'd'], liked: ['e'], meh: [] };
  R.applyFavoritesOrder(rank, ['c', 'missing', 'a', 'e']);
  assert.deepEqual(rank, { loved: ['c', 'a', 'b', 'd'], liked: ['e'], meh: [] });
});
