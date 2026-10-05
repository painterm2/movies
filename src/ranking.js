// One ranked list, best first. A new film is placed by binary search: "which do you like
// more, X or the film at the middle of the remaining range?" Each answer halves the range,
// so ~log2(N) questions place a film among N, and the list learns your order as you go.
// Scores come from list position.

export const emptyOrder = () => [];
export const isRanked = (order, key) => order.includes(key);

// --- Binary insertion session -------------------------------------------------
// Insert into `length` ranked films. Optional `skipped` indexes are comparisons the user
// couldn't answer (e.g. can't remember it); the probe moves to the nearest other film.
// `lo`/`hi` optionally narrow the search to part of the list (see starWindow).
export function startInsertion(length, lo = 0, hi = length) {
  return { lo, hi, skipped: [] };
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

// --- Full re-rank -------------------------------------------------------------
// Rebuild the whole list from scratch: films are inserted one at a time into a new list.
// With `useStars`, films are inserted best-rated first and each only needs comparing
// against films with the SAME star rating (a 5★ is assumed above a 4★), which saves
// a lot of questions. Unrated films are compared against everything.
export function planRerank(movies, { useStars = true, rand = Math.random } = {}) {
  const shuffled = Object.values(movies).map(m => ({ m, r: rand() })).sort((a, b) => a.r - b.r).map(x => x.m);
  if (!useStars) return shuffled.map(m => m.key);
  return shuffled.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)).map(m => m.key);
}

// Search window [lo, hi) within the in-progress list for a film with star rating `r`.
export function starWindow(list, movies, r) {
  let lo = -1, hi = -1;
  list.forEach((k, i) => { if (movies[k]?.rating === r) { if (lo < 0) lo = i; hi = i + 1; } });
  if (lo >= 0) return [lo, hi];
  const n = list.filter(k => (movies[k]?.rating ?? -1) > r).length; // no peers yet: slot in after higher-rated
  return [n, n];
}

// Worst-case number of questions for a plan (shown before starting).
export function estimateQuestions(movies, queue, useStars) {
  const seen = {}; let total = 0;
  queue.forEach((key, placed) => {
    const r = movies[key].rating;
    const w = useStars && r != null ? (seen[r] || 0) : placed;
    total += Math.ceil(Math.log2(w + 1));
    if (r != null) seen[r] = (seen[r] || 0) + 1;
  });
  return total;
}
