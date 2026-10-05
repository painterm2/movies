// Cross-device sync: pull/push the whole library to /api/state, merging when two devices
// changed things. Settings (incl. the passphrase) never leave the device.

export function syncPayload(state) {
  const { settings, ...rest } = state; // eslint-disable-line no-unused-vars
  const slim = m => (m.meta ? { ...m, meta: { ...m.meta, overview: '', providers: null } } : m);
  return {
    ...rest,
    movies: Object.fromEntries(Object.entries(state.movies).map(([k, m]) => [k, slim(m)])),
    watchlist: state.watchlist.map(m => ({ ...m, overview: '', providers: null })),
  };
}

// Union-merge two states. The more recently updated side wins conflicts; nothing the other
// side added is lost. (Known limit: a film deleted on one device can come back.)
export function mergeStates(a, b) {
  const [newer, older] = (a.updatedAt || 0) >= (b.updatedAt || 0) ? [a, b] : [b, a];
  const movies = { ...older.movies };
  for (const [k, m] of Object.entries(newer.movies)) {
    const o = older.movies[k];
    movies[k] = o ? { ...o, ...m, rating: m.rating ?? o.rating, meta: m.meta ?? o.meta } : m;
  }
  const order = newer.order.filter(k => movies[k]);
  const placed = new Set(order);
  for (const k of older.order) if (!placed.has(k) && movies[k]) order.push(k);
  const watchlist = [...newer.watchlist];
  for (const m of older.watchlist) if (!watchlist.some(w => w.key === m.key)) watchlist.push(m);
  return {
    ...newer, movies, order, watchlist,
    hidden: [...new Set([...newer.hidden, ...older.hidden])],
    favorites: newer.favorites?.length ? newer.favorites : (older.favorites || []),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
  };
}

// Talks to /api/state and /api/login. Auth is a server-set HttpOnly cookie, sent automatically.
export function createSyncClient(fetchImpl = globalThis.fetch) {
  async function call(url, method, body) {
    const res = await fetchImpl(url, { method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Sync failed (${res.status})`), { status: res.status });
    return data;
  }
  return {
    pull: () => call('/api/state', 'GET'),                       // { state, owner, tmdbProxy }
    push: state => call('/api/state', 'PUT', { state: syncPayload(state) }),
    login: passphrase => call('/api/login', 'POST', { passphrase }),
    logout: () => call('/api/login', 'POST', { logout: true }),
  };
}
