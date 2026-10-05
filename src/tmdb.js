// TMDB client (https://www.themoviedb.org/documentation/api). Works with either a v3 API key
// or a v4 read-access token. Metadata is normalized to the shape the recommender expects.
import { GENRE_IDS } from './moods.js';
import { movieKey, norm } from './importers.js';

const BASE = 'https://api.themoviedb.org/3';
export const imageUrl = (path, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

export function normalize(raw) {
  const year = raw.release_date ? parseInt(raw.release_date.slice(0, 4), 10) : null;
  const genres = raw.genres ? raw.genres.map(g => g.name) : (raw.genre_ids || []).map(id => GENRE_IDS[id]).filter(Boolean);
  const crew = raw.credits?.crew || [];
  return {
    key: movieKey(raw.title, year),
    tmdbId: raw.id,
    title: raw.title,
    year,
    genres,
    directors: crew.filter(c => c.job === 'Director').map(c => c.name),
    runtime: raw.runtime || null,
    vote: raw.vote_count >= 100 ? raw.vote_average : null,
    poster: raw.poster_path || null,
    overview: raw.overview || '',
    imdbId: raw.imdb_id || raw.external_ids?.imdb_id || null,
    providers: raw['watch/providers']?.results || null,
  };
}

// Direct mode: { key } calls TMDB from the browser. Proxy mode: { proxy: true } calls our
// /api/tmdb, which holds the key server-side (set TMDB_API_KEY in Vercel).
export function pickBestMatch(results, title, year) {
  const yearOf = x => parseInt((x.release_date || '').slice(0, 4), 10) || null;
  const scored = results.map((x, i) => {
    const exact = norm(x.title || '') === norm(title) || norm(x.original_title || '') === norm(title);
    const dy = year && yearOf(x) ? Math.abs(yearOf(x) - year) : 0;
    return { x, exact, dy, score: (exact ? 100 : 0) - dy * 10 - i * 0.5 - (year && !yearOf(x) ? 5 : 0) };
  }).sort((a, b) => b.score - a.score);
  // Prefer a year within one of Letterboxd's; failing that, an exact-title match from any year
  // (better a poster for the right title than none at all).
  return (scored.find(c => c.dy <= 1) || scored.find(c => c.exact))?.x || null;
}

export function createClient({ key, proxy = false, fetchImpl = globalThis.fetch }) {
  const bearer = key && key.length > 40;
  async function get(path, params = {}) {
    let url, init = {};
    if (proxy) { // the server holds the TMDB key; the owner's session cookie authorizes the call
      url = new URL('/api/tmdb', globalThis.location?.origin || 'http://localhost');
      url.searchParams.set('path', path);
      init = { credentials: 'same-origin' };
    } else {
      url = new URL(BASE + path);
      if (!bearer) url.searchParams.set('api_key', key);
      else init = { headers: { Authorization: `Bearer ${key}` } };
    }
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchImpl(url, init);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error || body.status_message || (res.status === 401 ? 'TMDB rejected the API key.' : `TMDB error ${res.status}`);
      throw Object.assign(new Error(msg), { status: res.status });
    }
    return res.json();
  }
  return {
    // Letterboxd and TMDB sometimes disagree on the year by one, so don't trust a strict
    // year filter: search by title, then prefer exact title + nearest year.
    async search(title, year) {
      let r = await get('/search/movie', { query: title });
      let hit = pickBestMatch(r.results || [], title, year);
      if (!hit && /[:.\u2013-]/.test(title)) { // retry without a subtitle, e.g. "Star Wars: A New Hope"
        r = await get('/search/movie', { query: title.split(/[:\u2013-]/)[0].trim() });
        hit = pickBestMatch(r.results || [], title.split(/[:\u2013-]/)[0].trim(), year);
      }
      return hit;
    },
    // Free-text search for the Log screen: several candidates, already normalized.
    searchMany: async query => (await get('/search/movie', { query })).results.slice(0, 8).map(normalize),
    details: id => get(`/movie/${id}`, { append_to_response: 'credits,watch/providers,external_ids' }).then(normalize),
    recommendations: id => get(`/movie/${id}/recommendations`).then(r => r.results.map(normalize)),
    // genreMode 'or' = any of the genres, 'and' = all of them.
    discover: ({ genreIds = [], genreMode = 'or', minVotes = 500, page = 1, sortBy = 'vote_average.desc', dateGte, dateLte } = {}) =>
      get('/discover/movie', {
        ...(genreIds.length ? { with_genres: genreIds.join(genreMode === 'and' ? ',' : '|') } : {}),
        sort_by: sortBy, 'vote_count.gte': minVotes, page,
        ...(dateGte ? { 'primary_release_date.gte': dateGte } : {}),
        ...(dateLte ? { 'primary_release_date.lte': dateLte } : {}),
      }).then(r => r.results.map(normalize)),
  };
}

// Is the film streamable ("flatrate") on any of the user's services in their region?
export function streamingOn(meta, region, services) {
  const flat = meta.providers?.[region]?.flatrate || [];
  const names = flat.map(p => p.provider_name);
  return services.length ? names.filter(n => services.includes(n)) : names;
}

// Where to watch in `region`: subscription ("stream"), then rent/buy. null = not loaded yet.
export function streamingInfo(meta, region) {
  if (!meta.providers) return null;
  const r = meta.providers[region] || {};
  const pick = list => (list || []).map(p => ({ name: p.provider_name, logo: p.logo_path }));
  return { stream: pick(r.flatrate), rent: pick([...(r.rent || []), ...(r.buy || [])]).filter((p, i, a) => a.findIndex(x => x.name === p.name) === i) };
}
