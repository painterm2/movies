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

export function createSyncClient(pass, fetchImpl = globalThis.fetch) {
  const headers = { Authorization: `Bearer ${pass}`, 'Content-Type': 'application/json' };
  async function call(method, body) {
    const res = await fetchImpl('/api/state', { method, headers, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Sync failed (${res.status})`);
    return data;
  }
  return {
    pull: () => call('GET'),
    push: state => call('PUT', { state: syncPayload(state) }),
  };
}
