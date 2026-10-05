// One ranked list, best first. A new film is placed by binary search: "which do you like
// more, X or the film at the middle of the remaining range?" Each answer halves the range,
// so ~log2(N) questions place a film among N, and the list learns your order as you go.
// Scores come from list position.

export const emptyOrder = () => [];
export const isRanked = (order, key) => order.includes(key);

// --- Binary insertion session -------------------------------------------------
// Insert into `length` ranked films. Optional `skipped` indexes are comparisons the user
// couldn't answer (e.g. can't remember it); the probe moves to the nearest other film.
export function startInsertion(length) {
  return { lo: 0, hi: length, skipped: [] };
}

// Index to compare against next, or -1 if every film left in the range was skipped.
export function probeIndex(s) {
  const mid = Math.floor((s.lo + s.hi) / 2);
  for (let d = 0; d < s.hi - s.lo; d++) {
    for (const i of d === 0 ? [mid] : [mid + d, mid - d]) {
      if (i >= s.lo && i < s.hi && !s.skipped.includes(i)) return i;
    }
  }
  return -1;
}
export const isDone = s => s.lo >= s.hi || probeIndex(s) === -1;
export function answer(s, newIsBetter) {
  const mid = probeIndex(s);
  return newIsBetter
    ? { ...s, hi: mid, skipped: s.skipped.filter(i => i < mid) }
    : { ...s, lo: mid + 1, skipped: s.skipped.filter(i => i > mid) };
}
export const skip = s => ({ ...s, skipped: [...s.skipped, probeIndex(s)] });
// Where the new film goes. If comparisons ran out, it lands in the middle of what's left.
export const position = s => (s.lo >= s.hi ? s.lo : Math.floor((s.lo + s.hi) / 2));

// Rough questions remaining (shown as progress).
export const duelsLeft = s => Math.max(0, Math.ceil(Math.log2(s.hi - s.lo + 1)));

// `pos` is an index into the list *without* `key` (that's what the insertion session counts).
export function insertAt(order, key, pos) {
  removeFromOrder(order, key);
  order.splice(pos, 0, key);
}
export function removeFromOrder(order, key) {
  const i = order.indexOf(key);
  if (i >= 0) order.splice(i, 1);
}

// --- Scores -------------------------------------------------------------------
// 10 at the top, falling 0.25 per place (compressed for long lists so the last is ~1).
export function computeScores(order) {
  const step = order.length > 1 ? Math.min(0.25, 9 / (order.length - 1)) : 0;
  return Object.fromEntries(order.map((k, i) => [k, Math.round((10 - i * step) * 10) / 10]));
}

// Quick-start: place rated, unplaced films by star rating (ties keep import order),
// merging with anything already ranked.
export function seedFromRatings(order, movies) {
  const fresh = Object.values(movies)
    .filter(m => m.rating != null && !order.includes(m.key))
    .sort((a, b) => b.rating - a.rating);
  for (const m of fresh) {
    let i = 0;
    while (i < order.length && (movies[order[i]]?.rating ?? 0) >= m.rating) i++;
    order.splice(i, 0, m.key);
  }
  return fresh.length;
}

// Pin an ordered favourites list (e.g. a Letterboxd "Top 10") to the top, in list order.
// Favourites not ranked yet are added. Keys not in `known` are ignored.
export function applyFavoritesOrder(order, orderedKeys, known = null) {
  const pinned = orderedKeys.filter(k => order.includes(k) || !known || known.has(k));
  const rest = order.filter(k => !pinned.includes(k));
  order.splice(0, order.length, ...pinned, ...rest);
}

// --- Refine: re-compare two neighbours ----------------------------------------
export function pickRefinePair(order, rand = Math.random) {
  if (order.length < 2) return null;
  const i = Math.floor(rand() * (order.length - 1));
  return { i, upper: order[i], lower: order[i + 1] };
}
// If the user prefers `lower`, swap the pair.
export function swapPair(order, pair) {
  [order[pair.i], order[pair.i + 1]] = [order[pair.i + 1], order[pair.i]];
}
