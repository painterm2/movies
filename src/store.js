// Local-first persistence. Everything lives in localStorage; nothing leaves the browser
// except TMDB lookups the user's own key makes.
import { emptyRank } from './ranking.js';

const KEY = 'reel-taste:v1';

export const emptyState = () => ({
  movies: {},            // key -> { key, title, year, rating, watchedDate, sources, meta }
  rank: emptyRank(),
  favorites: [],         // ordered keys from an imported favourites list
  hidden: [],            // keys the user dismissed
  watchlist: [],         // saved candidate metas
  updatedAt: 0,          // ms timestamp of the last change; decides sync winners
  settings: { tmdbKey: '', region: 'US', services: [], syncPass: '' }, // device-local, never synced
});

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
  } catch { return emptyState(); }
}

export function save(state, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* quota/private mode */ }
}
