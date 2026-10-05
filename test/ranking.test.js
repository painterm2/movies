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

test('full re-rank without stars reproduces the user\'s true order', () => {
  const movies = Object.fromEntries('abcdefghij'.split('').map(k => [k, { key: k, rating: 5 }]));
  const truth = 'jhfdbacegi'.split('');
  const queue = R.planRerank(movies, { useStars: false });
  const list = []; let asked = 0;
  for (const key of queue) {
    let s = R.startInsertion(list.length);
    while (!R.isDone(s)) { s = R.answer(s, truth.indexOf(key) < truth.indexOf(list[R.probeIndex(s)])); asked++; }
    R.insertAt(list, key, R.position(s));
  }
  assert.deepEqual(list, truth);
  assert.ok(asked <= R.estimateQuestions(movies, queue, false));
});

test('star head-start keeps star groups together and asks fewer questions', () => {
  const rated = { a: 5, b: 5, c: 5, d: 4, e: 4, f: 3, g: null };
  const movies = Object.fromEntries(Object.entries(rated).map(([k, rating]) => [k, { key: k, rating }]));
  const truth = ['c', 'a', 'b', 'e', 'd', 'f', 'g']; // user's order within each star group
  const queue = R.planRerank(movies, { useStars: true });
  assert.deepEqual(queue.map(k => rated[k] ?? -1), [5, 5, 5, 4, 4, 3, -1]);
  const list = []; let asked = 0;
  for (const key of queue) {
    const [lo, hi] = rated[key] != null ? R.starWindow(list, movies, rated[key]) : [0, list.length];
    let s = R.startInsertion(list.length, lo, hi);
    while (!R.isDone(s)) { s = R.answer(s, truth.indexOf(key) < truth.indexOf(list[R.probeIndex(s)])); asked++; }
    R.insertAt(list, key, R.position(s));
  }
  assert.deepEqual(list, truth);
  assert.ok(asked <= R.estimateQuestions(movies, queue, true));
  assert.ok(R.estimateQuestions(movies, queue, true) < R.estimateQuestions(movies, queue, false));
});
