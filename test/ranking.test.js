import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/ranking.js';

// Simulates a user whose true order is `truth` (best first); returns questions asked.
function place(order, key, truth) {
  const others = order.filter(k => k !== key);
  let s = R.startInsertion(others.length), asked = 0;
  while (!R.isDone(s)) {
    const probe = others[R.probeIndex(s)];
    s = R.answer(s, truth.indexOf(key) < truth.indexOf(probe));
    asked++;
  }
  R.insertAt(order, key, R.position(s));
  return asked;
}

test('a new film lands in the right place using only ~log2(N) questions', () => {
  const truth = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const order = truth.filter(k => k !== 'k');
  const asked = place(order, 'k', truth);
  assert.deepEqual(order, truth);
  assert.ok(asked <= 5, `asked ${asked}`); // 25 films -> at most 5
});

test('every possible slot is reachable (top, middle, bottom, empty list)', () => {
  const base = ['a', 'b', 'c', 'd', 'e', 'f'];
  for (let slot = 0; slot <= base.length; slot++) {
    const truth = [...base.slice(0, slot), 'new', ...base.slice(slot)];
    const order = [...base];
    place(order, 'new', truth);
    assert.deepEqual(order, truth);
  }
  const empty = [];
  assert.equal(place(empty, 'x', ['x']), 0);
  assert.deepEqual(empty, ['x']);
});

test('"can\'t compare" moves to a neighbour and still finishes', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  let s = R.startInsertion(5);
  assert.equal(R.probeIndex(s), 2);
  s = R.skip(s);
  assert.notEqual(R.probeIndex(s), 2);
  assert.ok(R.probeIndex(s) >= 0);
  // Skip everything -> done, lands somewhere valid.
  while (!R.isDone(s)) s = R.skip(s);
  const pos = R.position(s);
  assert.ok(pos >= 0 && pos <= 5);
});

test('scores fall with position, top is 10, bottom ~1 for long lists', () => {
  const short = R.computeScores(['a', 'b', 'c']);
  assert.deepEqual([short.a, short.b, short.c], [10, 9.8, 9.5]);
  const long = R.computeScores(Array.from({ length: 100 }, (_, i) => `k${i}`));
  assert.equal(long.k0, 10);
  assert.equal(long.k99, 1);
});

test('seed from ratings orders by stars and merges with existing order', () => {
  const movies = { a: { key: 'a', rating: 5 }, b: { key: 'b', rating: 4 }, c: { key: 'c', rating: 3 }, d: { key: 'd', rating: null } };
  const order = [];
  assert.equal(R.seedFromRatings(order, movies), 3);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('favorites pin to the top in list order and add unranked ones', () => {
  const order = ['a', 'b', 'c', 'd'];
  R.applyFavoritesOrder(order, ['c', 'ghost', 'a', 'new'], new Set(['a', 'b', 'c', 'd', 'new']));
  assert.deepEqual(order, ['c', 'a', 'new', 'b', 'd']);
});

test('refine swap', () => {
  const order = ['a', 'b', 'c'];
  R.swapPair(order, R.pickRefinePair(order, () => 0));
  assert.deepEqual(order, ['b', 'a', 'c']);
});
