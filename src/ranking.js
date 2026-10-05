// Beli-style ranking. A film first lands in a bucket (loved / liked / meh), then is placed
// inside that bucket by binary-search "which do you prefer?" duels. Scores are derived from
// position, so the list is always a strict ordering.
export const BUCKETS = {
  loved: { label: 'Loved it', range: [10, 7] },
  liked: { label: 'It was fine / liked it', range: [6.9, 4] },
  meh: { label: "Didn't like it", range: [3.9, 1] },
};
export const BUCKET_ORDER = ['loved', 'liked', 'meh'];

export const emptyRank = () => ({ loved: [], liked: [], meh: [] });

export function bucketFromRating(r) {
  if (r >= 4) return 'loved';
  if (r >= 3) return 'liked';
  return 'meh';
}

export function bucketOf(rank, key) {
  return BUCKET_ORDER.find(b => rank[b].includes(key)) || null;
}

export function removeFromRank(rank, key) {
  for (const b of BUCKET_ORDER) rank[b] = rank[b].filter(k => k !== key);
}

// --- Binary insertion session -------------------------------------------------
// Insert into a list ordered best-first. Each step compares the new film to list[mid].
export function startInsertion(length) {
  return { lo: 0, hi: length };
}
export const isDone = s => s.lo >= s.hi;
export const probeIndex = s => Math.floor((s.lo + s.hi) / 2);
export function answer(s, newIsBetter) {
  const mid = probeIndex(s);
  return newIsBetter ? { lo: s.lo, hi: mid } : { lo: mid + 1, hi: s.hi };
}
export const position = s => s.lo;

export function insertAt(rank, bucket, key, pos) {
  removeFromRank(rank, key);
  rank[bucket].splice(pos, 0, key);
}

// Worst-case duel count to place into a list of n.
export const maxDuels = n => Math.ceil(Math.log2(n + 1));

// --- Scores -------------------------------------------------------------------
export function computeScores(rank) {
  const scores = {};
  for (const b of BUCKET_ORDER) {
    const [hi, lo] = BUCKETS[b].range;
    const list = rank[b];
    list.forEach((key, i) => {
      const t = list.length === 1 ? 0.5 : i / (list.length - 1);
      scores[key] = Math.round((hi - (hi - lo) * t) * 10) / 10;
    });
  }
  return scores;
}

export function flatRanking(rank) {
  return BUCKET_ORDER.flatMap(b => rank[b]);
}

// Quick-start: place every rated, unplaced film by its star rating (ties keep import order).
export function seedFromRatings(rank, movies) {
  const placed = new Set(flatRanking(rank));
  const fresh = Object.values(movies).filter(m => m.rating != null && !placed.has(m.key));
  for (const b of BUCKET_ORDER) {
    const group = fresh.filter(m => bucketFromRating(m.rating) === b)
      .sort((a, c) => c.rating - a.rating);
    // Merge into existing list keeping rating order against already-placed films.
    for (const m of group) {
      const list = rank[b];
      let i = 0;
      while (i < list.length && (movies[list[i]]?.rating ?? 0) >= m.rating) i++;
      list.splice(i, 0, m.key);
    }
  }
  return fresh.length;
}

// Pick two adjacent films in one bucket to re-compare (refine mode). Returns null if none.
export function pickRefinePair(rank, rand = Math.random) {
  const options = BUCKET_ORDER.filter(b => rank[b].length >= 2);
  if (!options.length) return null;
  const b = options[Math.floor(rand() * options.length)];
  const i = Math.floor(rand() * (rank[b].length - 1));
  return { bucket: b, i, upper: rank[b][i], lower: rank[b][i + 1] };
}
// If the user prefers `lower`, swap the pair.
export function swapPair(rank, pair) {
  const list = rank[pair.bucket];
  [list[pair.i], list[pair.i + 1]] = [list[pair.i + 1], list[pair.i]];
}
