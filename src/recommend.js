// Taste profile + candidate scoring. Pure functions; no network.
import { moodScore } from './moods.js';

const decadeOf = y => (y ? Math.floor(y / 10) * 10 : null);

// scored: [{ meta, score }] where score is 0-10 from ranking (or rating*2 as a fallback).
export function buildProfile(scored) {
  const rated = scored.filter(s => s.meta);
  if (!rated.length) return { mean: 5, genres: {}, directors: {}, decades: {}, count: 0 };
  const mean = rated.reduce((a, s) => a + s.score, 0) / rated.length;
  const acc = { genres: {}, directors: {}, decades: {} };
  const add = (bag, k, w) => {
    if (k == null) return;
    (bag[k] ||= { sum: 0, n: 0 });
    bag[k].sum += w; bag[k].n += 1;
  };
  for (const { meta, score } of rated) {
    const w = (score - mean) / 5; // roughly -1..1, centered on this user's own average
    (meta.genres || []).forEach(g => add(acc.genres, g, w));
    (meta.directors || []).forEach(d => add(acc.directors, d, w));
    add(acc.decades, decadeOf(meta.year), w);
  }
  // Shrink toward zero so a single film doesn't dominate.
  const finish = (bag, k = 2) => Object.fromEntries(Object.entries(bag).map(([key, v]) => [key, v.sum / (v.n + k)]));
  return { mean, genres: finish(acc.genres), directors: finish(acc.directors, 1), decades: finish(acc.decades, 3), count: rated.length };
}

// `sources`: titles of loved films whose TMDB recommendations included this candidate.
export function scoreCandidate(meta, profile, { mood = null, moodWeight = 0.5, sources = [] } = {}) {
  const reasons = [];
  const genreVals = (meta.genres || []).map(g => [g, profile.genres[g] ?? 0]);
  const genreAvg = genreVals.length ? genreVals.reduce((a, [, v]) => a + v, 0) / genreVals.length : 0;
  const dirHit = (meta.directors || []).map(d => [d, profile.directors[d] ?? 0]).sort((a, b) => b[1] - a[1])[0];
  const decadeVal = profile.decades[decadeOf(meta.year)] ?? 0;
  const quality = meta.vote ? (meta.vote - 6.5) / 3 : 0;

  let score = genreAvg * 1.5 + (dirHit ? dirHit[1] * 1.5 : 0) + decadeVal * 0.4 + quality * 0.5 + Math.min(sources.length, 4) * 0.35;

  const bestGenre = genreVals.sort((a, b) => b[1] - a[1])[0];
  if (sources.length) reasons.push(`Because you loved ${sources.slice(0, 2).join(' & ')}`);
  if (dirHit && dirHit[1] > 0.1) reasons.push(`You rate ${dirHit[0]}'s films highly`);
  if (bestGenre && bestGenre[1] > 0.15) reasons.push(`Matches your taste for ${bestGenre[0]}`);
  if (meta.vote >= 7.8) reasons.push('Critically acclaimed');

  const m = moodScore(mood, meta);
  if (mood) {
    score += m * moodWeight;
    if (m > 0) reasons.push(`Fits a "${mood.label}" mood`);
  }
  return { score, reasons };
}

// candidates: [{ meta, sources? }]. With a mood selected, a film must positively match it
// (so "Need a laugh" never surfaces a thriller).
export function rank(candidates, profile, { mood = null, exclude = new Set(), limit = 20 } = {}) {
  return candidates
    .filter(c => !exclude.has(c.meta.key))
    .map(c => ({ ...c, ...scoreCandidate(c.meta, profile, { mood, sources: c.sources || [] }) }))
    .filter(c => !mood || moodScore(mood, c.meta) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
