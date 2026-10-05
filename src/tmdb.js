// TMDB client (https://www.themoviedb.org/documentation/api). Works with either a v3 API key
// or a v4 read-access token. Metadata is normalized to the shape the recommender expects.
import { GENRE_IDS } from './moods.js';
import { movieKey } from './importers.js';

const BASE = 'https://api.themoviedb.org/3';
export const imageUrl = path => (path ? `https://image.tmdb.org/t/p/w342${path}` : null);

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
    providers: raw['watch/providers']?.results || null,
  };
}

// Direct mode: { key } calls TMDB from the browser. Proxy mode: { proxyPass } calls our
// /api/tmdb, which holds the key server-side (set TMDB_API_KEY in Vercel).
export function createClient({ key, proxyPass, fetchImpl = globalThis.fetch }) {
  const bearer = key && key.length > 40;
  async function get(path, params = {}) {
    let url, init = {};
    if (proxyPass) {
      url = new URL('/api/tmdb', globalThis.location?.origin || 'http://localhost');
      url.searchParams.set('path', path);
      init = { headers: { Authorization: `Bearer ${proxyPass}` } };
    } else {
      url = new URL(BASE + path);
      if (!bearer) url.searchParams.set('api_key', key);
      else init = { headers: { Authorization: `Bearer ${key}` } };
    }
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchImpl(url, init);
    if (res.status === 401) throw new Error('TMDB rejected the API key.');
    if (!res.ok) throw new Error(`TMDB error ${res.status}`);
    return res.json();
  }
  return {
    async search(title, year) {
      const r = await get('/search/movie', { query: title, ...(year ? { year } : {}) });
      return r.results?.[0] || null;
    },
    details: id => get(`/movie/${id}`, { append_to_response: 'credits,watch/providers' }).then(normalize),
    recommendations: id => get(`/movie/${id}/recommendations`).then(r => r.results.map(normalize)),
    discover: ({ genreIds = [], minVotes = 500, page = 1 } = {}) =>
      get('/discover/movie', {
        with_genres: genreIds.join('|'), sort_by: 'vote_average.desc',
        'vote_count.gte': minVotes, page,
      }).then(r => r.results.map(normalize)),
  };
}

// Is the film streamable ("flatrate") on any of the user's services in their region?
export function streamingOn(meta, region, services) {
  const flat = meta.providers?.[region]?.flatrate || [];
  const names = flat.map(p => p.provider_name);
  return services.length ? names.filter(n => services.includes(n)) : names;
}
