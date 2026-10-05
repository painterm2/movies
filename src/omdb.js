// Rotten Tomatoes / IMDb / Metacritic scores via OMDb (omdbapi.com, free key).
// TMDB has no Rotten Tomatoes data, so this looks up by IMDb id. RT is the critics' Tomatometer.
export function parseOmdb(json) {
  if (!json || json.Response === 'False') return null;
  const by = Object.fromEntries((json.Ratings || []).map(r => [r.Source, r.Value]));
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const rt = num(by['Rotten Tomatoes']);
  const imdb = num(json.imdbRating);
  const metacritic = num(by['Metacritic'] ?? json.Metascore);
  return rt == null && imdb == null && metacritic == null ? null : { rt, imdb, metacritic };
}

// Direct mode ({ key }) or via our server ({ proxy: true }, which holds OMDB_API_KEY).
export function createOmdb({ key, proxy = false, fetchImpl = globalThis.fetch }) {
  return {
    async get(imdbId) {
      const url = proxy ? new URL('/api/omdb', globalThis.location?.origin || 'http://localhost') : new URL('https://www.omdbapi.com/');
      url.searchParams.set(proxy ? 'i' : 'i', imdbId);
      if (!proxy) url.searchParams.set('apikey', key);
      const res = await fetchImpl(url, proxy ? { credentials: 'same-origin' } : {});
      if (!res.ok) throw new Error(`Ratings lookup failed (${res.status})`);
      return parseOmdb(await res.json());
    },
  };
}
