// Local-first persistence. Everything lives in localStorage; nothing leaves the browser
// except TMDB lookups the user's own key makes.
import { emptyOrder } from './ranking.js';

const KEY = 'reel-taste:v1';

export const emptyState = () => ({
  movies: {},            // key -> { key, title, year, rating, watchedDate, sources, meta }
  order: emptyOrder(),   // ranked film keys, best first
  favorites: [],         // ordered keys from an imported favourites list
  deleted: {},           // key -> time removed (so a deletion isn't undone by another device's sync)
  hidden: [],            // keys the user dismissed
  watchlist: [],         // saved candidate metas
  updatedAt: 0,          // ms timestamp of the last change; decides sync winners
  settings: { tmdbKey: '', region: 'US', services: [], syncPass: '', omdbKey: '' }, // device-local, never synced (syncPass is legacy: cleared after auto sign-in)
});

// Older versions kept three buckets (state.rank); flatten them into one ordered list.
export function migrate(state) {
  if (!state.order) state.order = state.rank ? [...state.rank.loved, ...state.rank.liked, ...state.rank.meh] : [];
  delete state.rank;
  state.deleted ||= {};
  return state;
}

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? migrate({ ...emptyState(), ...JSON.parse(raw) }) : emptyState();
  } catch { return emptyState(); }
}

export function save(state, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* quota/private mode */ }
}
