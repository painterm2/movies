import { load, save, migrate, emptyState } from './store.js';
import { parseExport, mergeIntoLibrary, movieKey, norm, isListExport, parseList } from './importers.js';
import * as R from './ranking.js';
import { buildProfile, rank as rankCandidates } from './recommend.js';
import { MOODS, GENRE_NAME_TO_ID, GENRE_IDS, moodScore } from './moods.js';
import { BRAND } from './brand.js';
import { createClient, imageUrl, streamingOn, streamingInfo } from './tmdb.js';
import { createOmdb } from './omdb.js';
import { DEMO_CATALOG, demoLibrary } from './demo.js';
import { unzipText, isLetterboxdTasteFile } from './unzip.js';
import { createSyncClient, mergeStates, syncPayload } from './sync.js';

const THEME_KEY = 'reel-taste:theme';
const getTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; } };
function setTheme(t) {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f7f6f3' : '#0b0b10');
}
setTheme(getTheme());

const state = load();
const ui = { omdbProxy: false, dcache: new Map(), detail: null, spot: null, spotStreamOnly: false, browse: { kind: 'popular', genre: '', page: 0, items: [], loading: false, done: false }, proxy: false, server: false, owner: false, hasRemote: false, authError: '', sync: '', tab: 'recommend', mood: null, loading: '', status: '', session: null, streamOnly: false,
  filters: { genre: '', release: 'any', scope: 'new' }, picks: null, ranked: [], loadToken: 0, recCache: new Map(),
  search: { mode: 'log', key: null, q: '', results: [], note: '' }, enrichError: '', triedPoster: new Set(), enriching: false };
document.title = BRAND.name;
document.getElementById('brand').textContent = BRAND.name;
const $app = document.getElementById('app');
// ---- sync + sign-in -----------------------------------------------------------
// Anyone can VIEW the library (the server returns it without sign-in). Only the owner, signed in
// once per device via a year-long cookie, can change it or use the TMDB proxy.
let pushTimer = null, syncing = false;
const viewOnly = () => ui.server && ui.hasRemote && !ui.owner;
function persist(touch = true) {
  if (touch) state.updatedAt = Date.now();
  save(state);
  if (touch && ui.owner) { clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 1500); }
}
async function syncNow() {
  if (syncing) return;
  syncing = true;
  try {
    const client = createSyncClient();
    const { state: remote, owner, tmdbProxy, omdbProxy } = await client.pull();
    ui.server = true; ui.owner = owner; ui.proxy = tmdbProxy; ui.omdbProxy = omdbProxy; ui.hasRemote = Boolean(remote);
    if (remote && !owner) { // viewer: show exactly what the server has
      Object.assign(state, migrate(remote), { settings: state.settings });
      save(state);
    } else if (remote) { // owner: merge with anything edited on this device, then push
      Object.assign(state, mergeStates(state, { ...migrate(remote), settings: state.settings }), { settings: state.settings });
      save(state);
    }
    if (owner) { await client.push(state); ui.sync = `Synced ${new Date().toLocaleTimeString()}`; }
    else ui.sync = remote ? 'Viewing (read-only)' : '';
  } catch (e) {
    if (e.status === 401) { ui.server = true; ui.owner = false; ui.sync = e.message; }
    else if (e.status !== 503) ui.sync = `Sync problem: ${e.message}`; // 503 = server sync not set up; stay local
  }
  syncing = false;
  render();
}
async function signIn(passphrase) {
  try { await createSyncClient().login(passphrase); ui.authError = ''; await syncNow(); return true; }
  catch (e) { ui.authError = e.message; render(); return false; }
}
async function signOut() { try { await createSyncClient().logout(); } catch { /* ignore */ } ui.owner = false; ui.proxy = false; ui.omdbProxy = false; await syncNow(); }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tmdb = () => (ui.proxy ? createClient({ proxy: true })
  : state.settings.tmdbKey ? createClient({ key: state.settings.tmdbKey }) : null);
const omdb = () => (ui.omdbProxy ? createOmdb({ proxy: true }) : state.settings.omdbKey ? createOmdb({ key: state.settings.omdbKey }) : null);
const isDemo = () => !tmdb() && !ui.server;

const ICONS = {
  recommend: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  rank: '<path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  library: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  find: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  watchlist: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
};
const TABS = [['recommend', 'Next Watch'], ['find', 'Find'], ['watchlist', 'Watchlist'], ['rank', 'Rank'], ['library', 'My Top'], ['settings', 'Settings']];
function renderNav() {
  document.getElementById('nav').innerHTML = TABS.map(([id, l]) =>
    `<button class="${ui.tab === id ? 'active' : ''}" data-tab="${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>${l}</button>`).join('');
}
document.getElementById('nav').addEventListener('click', e => {
  const t = e.target.closest('[data-tab]'); if (t) { ui.tab = t.dataset.tab; ui.status = ''; render(); }
});

// ---- derived data -------------------------------------------------------------
const scores = () => R.computeScores(state.order);
const unplaced = () => Object.values(state.movies).filter(m => !R.isRanked(state.order, m.key));
function profile() {
  const sc = scores();
  return buildProfile(Object.values(state.movies).map(m => ({
    meta: m.meta, score: sc[m.key] ?? (m.rating != null ? m.rating * 2 : null),
  })).filter(x => x.score != null));
}
const watchedKeys = () => new Set(Object.keys(state.movies));

// ---- TMDB enrichment ----------------------------------------------------------
// Re-render without clobbering what the user is typing (background jobs call this).
function safeRender() {
  const el = document.activeElement;
  if (el && $app.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
  render();
}

// Look up TMDB details (poster, synopsis, genres…) for films that lack them. Keeps going
// past individual failures; only a bad key / missing server key stops the run.
async function enrichLibrary({ retryMissing = false } = {}) {
  const api = tmdb(); if (!api || ui.enriching) return;
  ui.enriching = true; ui.enrichError = '';
  if (retryMissing) ui.triedPoster.clear();
  const todo = Object.values(state.movies).filter(m => !m.meta || (!m.meta.poster && !ui.triedPoster.has(m.key)));
  let done = 0, fatal = false;
  const worker = async () => {
    while (todo.length && !fatal) {
      const m = todo.shift();
      try {
        const hit = await api.search(m.title, m.year);
        if (hit) {
          const meta = { ...(await api.details(hit.id)), key: m.key };
          if (!meta.poster && hit.poster_path) meta.poster = hit.poster_path;
          m.meta = meta;
        }
        ui.triedPoster.add(m.key);
      } catch (e) {
        if (e.status === 401 || e.status === 503) { ui.enrichError = e.message; fatal = true; }
        else ui.triedPoster.add(m.key);
      }
      ui.loading = `Fetching posters… ${++done}`;
      if (ui.tab === 'settings') safeRender();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]); // 4 at a time
  ui.enriching = false; ui.loading = ''; persist(); safeRender();
}

// ---- Next Watch ---------------------------------------------------------------
const GENRES = Object.values(GENRE_IDS).filter(g => g !== 'TV Movie').sort();
const PICK_COUNT = 4;

function filtersPass(meta) {
  const f = ui.filters, y = new Date().getFullYear();
  if (f.genre && !(meta.genres || []).includes(f.genre)) return false;
  if (f.release === 'new' && !(meta.year >= y - 1)) return false;
  if (f.release === 'classic' && !(meta.year && meta.year <= 1999)) return false;
  return true;
}

async function loadPicks() {
  const token = ++ui.loadToken;
  ui.loading = 'Finding your next watch…'; ui.picks = null; ui.status = ''; render();
  let ranked = [];
  try { ranked = await buildRanked(); } catch (e) { ui.status = e.message; }
  if (token !== ui.loadToken) return; // a newer filter change took over
  ui.ranked = ranked; ui.picks = ranked.slice(0, PICK_COUNT);
  ui.loading = ''; render();
  fillDetails(token);
}

async function buildRanked() {
  const f = ui.filters, mood = ui.mood;
  if (f.scope === 'new' && viewOnly()) throw new Error('Sign in to get new recommendations, or switch to Rewatch to browse your top films.');
  const exclude = new Set([...watchedKeys(), ...state.hidden]);
  let out;
  if (f.scope === 'rewatch') { // films I've already seen, best-ranked first
    const sc = scores();
    out = state.order.map((k, i) => ({ k, i })).filter(({ k }) => state.movies[k]?.meta)
      .map(({ k, i }) => ({ meta: state.movies[k].meta, score: (sc[k] - 5) / 2, reasons: [`You ranked it #${i + 1}`] }))
      .filter(c => filtersPass(c.meta) && (!mood || moodScore(mood, c.meta) > 0));
  } else {
    const candidates = f.scope === 'watchlist' ? state.watchlist.map(meta => ({ meta, sources: [] }))
      : isDemo() ? DEMO_CATALOG.map(meta => ({ meta, sources: [] })) : await fetchCandidates();
    out = rankCandidates(candidates.filter(c => filtersPass(c.meta)), profile(),
      { mood, exclude: f.scope === 'watchlist' ? new Set(watchedKeys()) : exclude, limit: 200 });
  }
  if (ui.streamOnly && !isDemo()) out = out.filter(c => streamingOn(c.meta, state.settings.region, state.settings.services).length);
  return out;
}

async function fetchCandidates() {
  const api = tmdb(), f = ui.filters, y = new Date().getFullYear(), sc = scores();
  const loved = Object.values(state.movies).filter(m => m.meta?.tmdbId && (sc[m.key] ?? 0) >= 7)
    .sort((a, b) => sc[b.key] - sc[a.key]).slice(0, 12);
  const pool = new Map();
  let firstError = null;
  const add = (meta, source) => {
    const c = pool.get(meta.key) || { meta, sources: [] };
    if (source) c.sources.push(source);
    pool.set(meta.key, c);
  };
  const guard = p => p.catch(e => { firstError ||= e; });
  const jobs = loved.map(m => guard((async () => {
    if (!ui.recCache.has(m.meta.tmdbId)) ui.recCache.set(m.meta.tmdbId, await api.recommendations(m.meta.tmdbId));
    ui.recCache.get(m.meta.tmdbId).forEach(r => add(r, m.title));
  })()));
  const genreIds = f.genre ? [GENRE_NAME_TO_ID[f.genre]] : (ui.mood?.want || []).map(g => GENRE_NAME_TO_ID[g]).filter(Boolean);
  const shape = f.release === 'new' ? { dateGte: `${y - 1}-01-01`, sortBy: 'popularity.desc', minVotes: 100 }
    : f.release === 'classic' ? { dateLte: '1999-12-31', minVotes: 1500 } : { minVotes: 800 };
  for (const page of [1, 2]) jobs.push(guard(api.discover({ genreIds, genreMode: f.genre ? 'and' : 'or', page, ...shape }).then(rs => rs.forEach(r => add(r, null)))));
  await Promise.all(jobs);
  if (!pool.size && firstError) throw firstError;
  // Fill in runtime / director / streaming for the most promising ones.
  const exclude = new Set([...watchedKeys(), ...state.hidden]);
  const prelim = rankCandidates([...pool.values()].filter(c => filtersPass(c.meta)), profile(), { mood: ui.mood, exclude, limit: 30 });
  await Promise.all(prelim.map(async c => {
    try { c.meta = { ...c.meta, ...(await api.details(c.meta.tmdbId)) }; } catch { /* keep partial */ }
  }));
  return prelim.map(({ meta, sources }) => ({ meta, sources }));
}

// Pull full details, scores and "where to watch" for the shown picks.
async function fillDetails(token) {
  if (!tmdb() && !omdb()) return;
  await fillAll((ui.picks || []).map(c => c.meta));
  if (token === ui.loadToken) safeRender();
}

// Weighted random sample from the top of the ranking, so "Shuffle" varies but stays on-taste.
function shuffle() {
  const pool = ui.ranked.slice(0, 16);
  if (!pool.length) return;
  const top = Math.max(...pool.map(c => c.score));
  const bag = pool.map(c => ({ c, w: Math.exp(1.2 * (c.score - top)) }));
  const picks = [];
  while (picks.length < Math.min(PICK_COUNT, pool.length)) {
    let r = Math.random() * bag.reduce((a, x) => a + x.w, 0), i = 0;
    while (i < bag.length - 1 && (r -= bag[i].w) > 0) i++;
    picks.push(bag.splice(i, 1)[0].c);
  }
  ui.picks = picks; render();
}

// Remove a pick and pull the next-best into its place.
function dropPick(i) {
  const [gone] = ui.picks.splice(i, 1);
  ui.ranked = ui.ranked.filter(c => c !== gone);
  const next = ui.ranked.find(c => !ui.picks.includes(c));
  if (next) ui.picks.push(next);
}

// Fallback tint by genre so a missing poster still "feels" like the film.
const GENRE_HUE = { Horror: 355, 'Science Fiction': 188, Animation: 38, Fantasy: 272, Romance: 336, Comedy: 46, Crime: 24,
  War: 92, Thriller: 214, Mystery: 246, Action: 12, Adventure: 160, Music: 292, Family: 140, History: 30, Western: 28, Documentary: 120, Drama: 205 };
function tint(meta, title) {
  const g = (meta?.genres || []).find(x => GENRE_HUE[x]);
  let h = g ? GENRE_HUE[g] : [...title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);
  return `linear-gradient(160deg,hsl(${h} 52% 34%),hsl(${(h + 28) % 360} 55% 12%))`;
}

// Real poster at several resolutions (browser picks the sharp one for the screen);
// until it loads, or if there's none, a genre-tinted title card shows instead.
function poster(meta, title, sizes = '(max-width:720px) 46vw, 200px') {
  const path = meta?.poster;
  const img = path ? `<img src="${esc(imageUrl(path, 'w500'))}" srcset="${['w342 342', 'w500 500', 'w780 780'].map(x => { const [sz, w] = x.split(' '); return `${esc(imageUrl(path, sz))} ${w}w`; }).join(', ')}" sizes="${sizes}" alt="${esc(title)} poster" loading="lazy" decoding="async" onerror="this.remove()">` : '';
  return `<div class="poster" style="background:${tint(meta, title)}"><span class="ptitle">${esc(title)}</span>${img}</div>`;
}

function pickHtml(c, i) {
  const m = view(c.meta);
  const scope = ui.filters.scope;
  return `<article class="pick${i === 0 ? ' first' : ''}">
    <div class="pick-poster" data-act="detail" data-src="picks" data-i="${i}">${poster(m, m.title, '(max-width:720px) 32vw, 190px')}</div>
    <div class="pick-body">
      <h3>${esc(m.title)}</h3>
      <div class="meta">${esc(m.year)}${m.runtime ? ` · ${m.runtime} min` : ''} · ${esc((m.genres || []).slice(0, 3).join(', '))}</div>
      ${scoresHtml(m)}
      ${(c.reasons || []).slice(0, 2).map(r => `<div class="why">${esc(r)}</div>`).join('')}
      ${m.overview ? `<p class="synopsis">${esc(m.overview)}</p>` : ''}
      ${whereHtml(m)}
      <div class="actions">
        <button class="chip-btn" data-act="detail" data-src="picks" data-i="${i}">Details</button>
        ${scope === 'rewatch' ? '' : `<button class="chip-btn" data-act="seen" data-i="${i}">I've seen it</button>
        ${scope === 'watchlist' ? `<button class="chip-btn" data-act="unlist" data-i="${i}">Remove</button>`
          : `<button class="chip-btn" data-act="watchlist" data-i="${i}">+ Watchlist</button>`}
        <button class="chip-btn quiet" data-act="hide" data-i="${i}" aria-label="Not interested" title="Not interested">✕</button>`}
      </div>
    </div></article>`;
}

const seg = (name, opts) => `<div class="seg" role="group">${opts.map(([v, l]) =>
  `<button class="${ui.filters[name] === v ? 'on' : ''}" data-seg="${name}" data-v="${v}">${l}</button>`).join('')}</div>`;

function renderRecommend() {
  const moods = MOODS.map(m => `<button class="mood ${ui.mood?.id === m.id ? 'active' : ''}" data-mood="${m.id}">${m.emoji} ${esc(m.label)}</button>`).join('');
  const n = Object.keys(state.movies).length;
  let body = '';
  if (!n) body = `<div class="empty"><div class="big">🎞️</div><p>Nothing here yet. <a href="#" data-tab-link="log">Log a film you've watched</a> or <a href="#" data-tab-link="import">import your Letterboxd export</a>.</p></div>`;
  else if (ui.loading) body = `<div class="picks">${'<div class="pick skeleton"><div class="pick-poster"><div class="poster"></div></div></div>'.repeat(3)}</div>`;
  else if (ui.picks) body = ui.picks.length ? `<div class="picks">${ui.picks.map(pickHtml).join('')}</div>`
    : ui.status ? '' : `<div class="empty"><div class="big">🤷</div><p>Nothing matches those filters. Loosen one and try again.</p></div>`;
  return `<section class="hero"><h2>Next watch</h2>
      <p>Picked for your taste. Tweak the filters and it refreshes on its own.</p></section>
    ${isDemo() ? '<div class="banner">Demo mode: using a small built-in catalog. Connect TMDB (Settings) for real picks and posters.</div>' : ''}
    <div class="moods">${moods}</div>
    <div class="filters">
      <label class="select"><span class="muted">Genre</span><select data-filter="genre"><option value="">Any genre</option>${GENRES.map(g => `<option ${ui.filters.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <div><span class="muted">Release</span>${seg('release', [['any', 'Any'], ['new', 'New'], ['classic', 'Classics']])}</div>
      <div><span class="muted">Show me</span>${seg('scope', [['new', 'New to me'], ['watchlist', `Watchlist${state.watchlist.length ? ` (${state.watchlist.length})` : ''}`], ['rewatch', 'Rewatch']])}</div>
      <button class="primary shuffle" data-act="shuffle" ${ui.ranked.length > 1 ? '' : 'disabled'}>🔀 Shuffle</button>
    </div>
    ${isDemo() ? '' : `<label class="toggle"><input type="checkbox" data-act="stream-only" ${ui.streamOnly ? 'checked' : ''}> Only on my streaming services</label>`}
    ${ui.status ? `<p class="banner">${esc(ui.status)}</p>` : ''}${body}`;
}

// ---- shared helpers for browsing films ---------------------------------------
const today = () => new Date().toISOString().slice(0, 10);
const findKey = meta => Object.keys(state.movies).find(k => k === movieKey(meta.title, meta.year) || (meta.tmdbId && state.movies[k].meta?.tmdbId === meta.tmdbId));
const onWatchlist = meta => state.watchlist.some(m => m.key === meta.key || (meta.tmdbId && m.tmdbId === meta.tmdbId));

// Merge anything we've fetched this session (providers, synopsis, scores) onto a meta.
function view(meta) {
  const c = ui.dcache.get(meta.tmdbId);
  return c ? { ...meta, ...(c.details || {}), ...(c.scores || {}), key: meta.key } : meta;
}

// Full details + Rotten Tomatoes etc. for one film. Cached for the session.
async function fullMeta(meta, { scores = true } = {}) {
  if (!meta.tmdbId) return meta;
  const c = ui.dcache.get(meta.tmdbId) || {};
  const api = tmdb();
  if (api && c.details === undefined) { try { c.details = await api.details(meta.tmdbId); } catch { c.details = null; } }
  const imdbId = c.details?.imdbId || meta.imdbId;
  const o = omdb();
  if (scores && o && imdbId && c.scores === undefined) { try { c.scores = await o.get(imdbId); } catch { c.scores = null; } }
  ui.dcache.set(meta.tmdbId, c);
  return view(meta);
}
// Fill details for a batch (4 at a time), re-rendering as they land.
async function fillAll(metas, opts) {
  const todo = metas.filter(m => m.tmdbId && ui.dcache.get(m.tmdbId)?.details === undefined);
  const worker = async () => { while (todo.length) { await fullMeta(todo.shift(), opts); safeRender(); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

function scoresHtml(m) {
  const bits = [];
  if (m.rt != null) bits.push(`<span class="score-chip rt" title="Rotten Tomatoes (critics)">${m.rt >= 60 ? '🍅' : '🤢'} ${m.rt}%</span>`);
  if (m.imdb != null) bits.push(`<span class="score-chip" title="IMDb">IMDb ${m.imdb}</span>`);
  if (m.metacritic != null) bits.push(`<span class="score-chip" title="Metacritic">MC ${m.metacritic}</span>`);
  return bits.length ? `<div class="scores">${bits.join('')}</div>` : '';
}

// "Where to watch" using TMDB/JustWatch data for the chosen region.
function whereHtml(m) {
  const info = streamingInfo(m, state.settings.region);
  if (!info) return '';
  const chip = p => `<span class="svc">${p.logo ? `<img src="${esc(imageUrl(p.logo, 'w92'))}" alt="" loading="lazy">` : ''}${esc(p.name)}</span>`;
  if (info.stream.length) return `<div class="where"><span class="muted">Stream on</span> ${info.stream.slice(0, 5).map(chip).join('')}</div>`;
  if (info.rent.length) return `<div class="where"><span class="muted">Not on a subscription. Rent or buy:</span> ${info.rent.slice(0, 4).map(chip).join('')}</div>`;
  return `<div class="where muted">Not available to stream in ${esc(state.settings.region)} right now.</div>`;
}

function statusLabel(meta) {
  const k = findKey(meta);
  if (k) { const i = state.order.indexOf(k); return `<span class="tag good">Watched${i >= 0 ? ` · #${i + 1}` : ''}</span>`; }
  return onWatchlist(meta) ? '<span class="tag">On watchlist</span>' : '';
}

function toggleWatchlist(meta) {
  const i = state.watchlist.findIndex(m => m.key === meta.key || (meta.tmdbId && m.tmdbId === meta.tmdbId));
  if (i >= 0) state.watchlist.splice(i, 1);
  else state.watchlist.push({ ...meta, providers: null, overview: meta.overview || '' });
  persist();
}

// Add a film I just watched, then go straight to ranking it.
function logFilm(meta, date = today()) {
  const existingKey = findKey(meta), key = existingKey || movieKey(meta.title, meta.year);
  const existing = state.movies[key];
  const clean = { ...meta, key };
  state.movies[key] = existing ? { ...existing, meta: { ...existing.meta, ...clean }, watchedDate: date }
    : { key, title: meta.title, year: meta.year, rating: null, watchedDate: date, sources: ['logged'], meta: clean };
  state.watchlist = state.watchlist.filter(m => m.key !== meta.key && !(meta.tmdbId && m.tmdbId === meta.tmdbId));
  persist();
  const api = tmdb(); // fill runtime / director in the background
  if (api && meta.tmdbId) api.details(meta.tmdbId).then(d => { state.movies[key].meta = { ...state.movies[key].meta, ...d, key }; persist(); }).catch(() => {});
  ui.picks = null; ui.detail = null; ui.spot = null; ui.search = { mode: 'log', key: null, q: '', results: [], note: '' };
  if (existing && R.isRanked(state.order, key)) { ui.status = `${meta.title} is already on your list (#${state.order.indexOf(key) + 1}).`; ui.tab = 'library'; return render(); }
  startRanking(key);
}

// The metas behind each clickable list, so buttons only need (source, index).
function srcMeta(src, i) {
  switch (src) {
    case 'picks': return ui.picks[i].meta;
    case 'results': return findList()[i];
    case 'watchlist': return state.watchlist[i];
    case 'top': return state.movies[state.order[i]]?.meta || { title: state.movies[state.order[i]].title, year: state.movies[state.order[i]].year, key: state.order[i], genres: [] };
    case 'spot': return ui.spot;
    default: return ui.detail?.meta;
  }
}

// ---- Details sheet (synopsis, scores, where to watch) ----------------------------
const $modal = document.getElementById('modal');
function renderModal() {
  const d = ui.detail;
  $modal.hidden = !d;
  document.body.classList.toggle('noscroll', Boolean(d));
  if (!d) { $modal.innerHTML = ''; return; }
  const m = view(d.meta), k = findKey(m);
  $modal.innerHTML = `<div class="backdrop" data-act="close-detail"><div class="sheet" role="dialog" aria-label="${esc(m.title)}">
    <button class="close" data-act="close-detail" aria-label="Close">✕</button>
    <div class="sheet-grid"><div class="sheet-poster">${poster(m, m.title, '(max-width:720px) 40vw, 240px')}</div>
    <div><h2>${esc(m.title)}</h2>
      <div class="meta">${esc(m.year ?? '')}${m.runtime ? ` · ${m.runtime} min` : ''}${(m.genres || []).length ? ` · ${esc(m.genres.join(', '))}` : ''}</div>
      ${(m.directors || []).length ? `<div class="meta">Directed by ${esc(m.directors.join(', '))}</div>` : ''}
      <div class="row tight">${statusLabel(m)}</div>
      ${scoresHtml(m)}${d.loading && !m.rt ? '<div class="muted">Loading scores…</div>' : ''}
      <p class="synopsis full">${esc(m.overview || 'No synopsis available.')}</p>
      ${whereHtml(m)}
      <div class="actions">
        ${k ? '' : '<button class="primary" data-act="detail-watched">I\'ve watched this</button>'}
        <button class="secondary" data-act="detail-list">${onWatchlist(m) ? '✓ On watchlist (remove)' : '+ Add to watchlist'}</button>
      </div></div></div></div></div>`;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.detail) { ui.detail = null; renderModal(); } });

async function openDetail(meta) {
  ui.detail = { meta, loading: true }; renderModal();
  const full = await fullMeta(meta);
  if (ui.detail?.meta === meta || ui.detail?.meta.tmdbId === meta.tmdbId) { ui.detail = { meta: full, loading: false }; renderModal(); }
  // Keep scores on films I own so lists can show them without refetching.
  const w = state.watchlist.findIndex(x => x.key === meta.key); if (w >= 0 && full.rt != null) { state.watchlist[w] = { ...state.watchlist[w], rt: full.rt, imdb: full.imdb, metacritic: full.metacritic }; persist(false); }
}

// ---- Find: search and browse all films ----------------------------------------------
const BROWSE = [['popular', 'Popular'], ['top', 'Top rated'], ['new', 'New']];
const findList = () => (ui.search.mode === 'log' && ui.search.q.trim().length >= 2 ? ui.search.results : ui.browse.items);

function rowHtml(m0, i, src) {
  const m = view(m0);
  return `<div class="result" data-act="detail" data-src="${src}" data-i="${i}">
    <div class="thumb">${poster(m, m.title, '56px')}</div>
    <div class="info"><div class="t">${esc(m.title)} <span class="muted">${esc(m.year ?? '')}</span> ${statusLabel(m)}</div>
      <div class="muted clamp">${esc(m.overview || (m.genres || []).join(', '))}</div>${scoresHtml(m)}</div>
    <div class="row-actions">${findKey(m) ? '' : `<button class="chip-btn" data-act="row-watched" data-src="${src}" data-i="${i}">Watched</button>`}
      <button class="chip-btn" data-act="row-list" data-src="${src}" data-i="${i}">${onWatchlist(m) ? '✓ List' : '+ List'}</button></div>
  </div>`;
}

function findListHtml() {
  const searching = ui.search.mode === 'log' && ui.search.q.trim().length >= 2;
  const items = findList();
  const rows = items.map((m, i) => rowHtml(m, i, 'results')).join('');
  const manual = searching ? `<div class="result"><div class="info"><div class="t">Can't find it?</div><div class="muted">Add "${esc(ui.search.q.trim())}" without a lookup</div></div>
      <button class="chip-btn" data-act="log-manual">Add</button></div>` : '';
  const more = !searching && ui.browse.items.length ? `<div class="row" style="justify-content:center"><button class="secondary" data-act="browse-more" ${ui.browse.loading || ui.browse.done ? 'disabled' : ''}>${ui.browse.loading ? 'Loading…' : 'Load more'}</button></div>` : '';
  const empty = !items.length && (searching ? ui.search.note : (ui.browse.loading ? 'Loading…' : '')) ;
  return `${empty ? `<p class="muted">${esc(empty)}</p>` : ''}${rows}${manual}${more}`;
}

function renderFind() {
  const q = ui.search.mode === 'log' ? ui.search.q : '';
  return `<section class="hero"><h2>Find films</h2><p>Search every film, or browse. See the synopsis, Rotten Tomatoes score and where it's streaming, then add it as watched or to your watchlist.</p></section>
    ${ui.status ? `<p class="banner">${esc(ui.status)}</p>` : ''}
    <input id="log-q" type="search" class="wide" placeholder="Search for a film…" autocomplete="off" value="${esc(q)}">
    <div class="filters" style="margin-top:12px">
      <div><span class="muted">Browse</span><div class="seg">${BROWSE.map(([v, l]) => `<button class="${ui.browse.kind === v ? 'on' : ''}" data-act="browse-kind" data-v="${v}">${l}</button>`).join('')}</div></div>
      <label class="select"><span class="muted">Genre</span><select data-filter="browse-genre"><option value="">Any genre</option>${GENRES.map(g => `<option ${ui.browse.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="muted">Watched on <input type="date" id="log-date" value="${today()}" max="${today()}"></label>
    </div>
    <div id="log-results">${findListHtml()}</div>`;
}

async function loadBrowse(reset = false) {
  const b = ui.browse;
  if (reset) Object.assign(b, { page: 0, items: [], done: false });
  if (b.loading || b.done) return;
  b.loading = true; updateFindList();
  const y = new Date().getFullYear();
  try {
    const api = tmdb();
    if (!api) { b.items = DEMO_CATALOG.filter(m => !b.genre || m.genres.includes(b.genre)); b.done = true; }
    else {
      const shape = { popular: { sortBy: 'popularity.desc', minVotes: 200 }, top: { sortBy: 'vote_average.desc', minVotes: 3000 }, new: { sortBy: 'popularity.desc', minVotes: 50, dateGte: `${y - 1}-01-01` } }[b.kind];
      const rs = await api.discover({ ...shape, genreIds: b.genre ? [GENRE_NAME_TO_ID[b.genre]] : [], genreMode: 'and', page: ++b.page });
      b.items.push(...rs.filter(r => !b.items.some(x => x.tmdbId === r.tmdbId)));
      if (!rs.length || b.page >= 25) b.done = true;
    }
  } catch (e) { ui.search.note = e.message; b.done = true; }
  b.loading = false; updateFindList();
}
function updateFindList() { const el = document.getElementById('log-results'); if (el) el.innerHTML = findListHtml(); }

let searchTimer = null;
function runSearch(q, mode) {
  ui.search = { ...ui.search, mode, q, results: [], note: '' };
  clearTimeout(searchTimer);
  const target = () => document.getElementById(mode === 'fix' ? 'fix-results' : 'log-results');
  if (q.trim().length < 2) { if (mode === 'fix' && target()) target().innerHTML = ''; else updateFindList(); return; }
  searchTimer = setTimeout(async () => {
    const mine = ui.search.q;
    try {
      const api = tmdb();
      const results = api ? await api.searchMany(q) : DEMO_CATALOG.filter(m => norm(m.title).includes(norm(q))).slice(0, 8);
      if (mine !== ui.search.q) return; // typed something newer meanwhile
      ui.search.results = results;
      ui.search.note = results.length ? '' : 'No matches.';
    } catch (e) { ui.search.note = e.message; }
    if (mode === 'fix') { if (target()) target().innerHTML = searchResultsHtml(); } else updateFindList();
  }, 300);
}

// Used only by the "fix a missing poster" panel (Settings → Import).
function searchResultsHtml() {
  const { results, note } = ui.search;
  return `${note ? `<p class="muted">${esc(note)}</p>` : ''}${results.map((m, i) => `<div class="result">
      <div class="thumb">${poster(m, m.title, '56px')}</div>
      <div class="info"><div class="t">${esc(m.title)} <span class="muted">${esc(m.year ?? '')}</span></div>
        <div class="muted clamp">${esc(m.overview || (m.genres || []).join(', '))}</div></div>
      <button class="chip-btn" data-act="fix-pick" data-i="${i}">Use this</button></div>`).join('')}`;
}

// ---- Watchlist + "pick one for me" ---------------------------------------------------
function renderWatchlist() {
  const list = state.watchlist;
  const spot = ui.spot && view(ui.spot);
  const spotHtml = spot ? `<div class="spotlight"><div class="eyebrow">Tonight, watch</div>
      <div class="pick first"><div class="pick-poster">${poster(spot, spot.title, '(max-width:720px) 34vw, 220px')}</div>
        <div class="pick-body"><h3>${esc(spot.title)}</h3>
          <div class="meta">${esc(spot.year ?? '')}${spot.runtime ? ` · ${spot.runtime} min` : ''} · ${esc((spot.genres || []).slice(0, 3).join(', '))}</div>
          ${scoresHtml(spot)}<p class="synopsis">${esc(spot.overview || '')}</p>${whereHtml(spot) || '<div class="muted">Checking where it\'s streaming…</div>'}
          <div class="actions"><button class="primary" data-act="spot-watched">I watched it</button>
            <button class="secondary" data-act="spot-again">🎲 Pick another</button>
            <button class="ghost" data-act="spot-close">Not tonight</button></div></div></div></div>` : '';
  const rows = list.map((m0, i) => {
    const m = view(m0);
    return `<div class="result" data-act="detail" data-src="watchlist" data-i="${i}">
      <div class="thumb">${poster(m, m.title, '56px')}</div>
      <div class="info"><div class="t">${esc(m.title)} <span class="muted">${esc(m.year ?? '')}</span></div>${scoresHtml(m)}${whereHtml(m)}</div>
      <div class="row-actions"><button class="chip-btn" data-act="row-watched" data-src="watchlist" data-i="${i}">Watched</button>
        <button class="chip-btn quiet" data-act="wl-remove" data-i="${i}" aria-label="Remove">✕</button></div></div>`;
  }).join('');
  return `<section class="hero"><h2>Watchlist</h2><p>Can't choose? Let me pick.</p></section>
    <div class="row"><button class="primary big" data-act="spot-pick" ${list.length ? '' : 'disabled'}>🎲 Pick one for me</button>
      <label class="toggle"><input type="checkbox" data-act="spot-stream" ${ui.spotStreamOnly ? 'checked' : ''}> Only what I can stream</label></div>
    ${ui.status ? `<p class="banner">${esc(ui.status)}</p>` : ''}${spotHtml}
    ${list.length ? `<div class="wl">${rows}</div>` : '<div class="empty"><div class="big">🔖</div><p>Nothing saved yet. Add films from <a href="#" data-tab-link="find">Find</a> or Next Watch.</p></div>'}`;
}

async function pickFromWatchlist() {
  let pool = state.watchlist;
  if (ui.spotStreamOnly) {
    ui.status = 'Checking what\'s streaming…'; render();
    await fillAll(pool, { scores: false });
    pool = pool.filter(m => streamingInfo(view(m), state.settings.region)?.stream.length);
    ui.status = pool.length ? '' : 'Nothing on your watchlist is streaming right now. Untick the filter to pick from everything.';
  }
  const others = pool.filter(m => m.key !== ui.spot?.key);
  const choice = (others.length ? others : pool)[Math.floor(Math.random() * (others.length || pool.length))];
  ui.spot = choice || null; render();
  if (choice) { ui.spot = await fullMeta(choice); ui.spot = choice; safeRender(); }
}

// ---- Rank (Beli-style) --------------------------------------------------------
// The list a session is inserting into: the in-progress list during a re-rank,
// otherwise your ranking minus the film being placed.
const sessionList = s => (s.mode === 'rerank' ? state.rerank.order : state.order.filter(k => k !== s.key));

function startRerank(useStars) {
  const queue = R.planRerank(state.movies, { useStars });
  state.rerank = { queue, order: [], total: queue.length, useStars };
  ui.rerankSetup = false; persist(); nextRerank();
}
function nextRerank(resumeIns = null) {
  const rr = state.rerank;
  if (!rr) return;
  ui.tab = 'rank';
  if (!rr.queue.length) {
    state.order = rr.order; delete state.rerank; ui.session = null; ui.tab = 'library';
    ui.status = `Re-ranked all ${state.order.length} films. This is your new list.`;
    persist(); return render();
  }
  const key = rr.queue[0], m = state.movies[key];
  const [lo, hi] = rr.useStars && m.rating != null ? R.starWindow(rr.order, state.movies, m.rating) : [0, rr.order.length];
  const ins = resumeIns || R.startInsertion(rr.order.length, lo, hi);
  ui.session = { key, ins, mode: 'rerank', history: [] };
  return R.isDone(ins) ? finishPlacement() : render();
}

function startRanking(key) { ui.tab = 'rank';
  const ins = R.startInsertion(state.order.filter(k => k !== key).length);
  ui.session = { key, step: R.isDone(ins) ? 'done' : 'duel', ins, history: [] };
  if (ui.session.step === 'done') return finishPlacement();
  render();
}
function nextToRank() { const u = unplaced(); return u.length ? u[0].key : null; }

function duelCard(m, attrs) {
  return `<button class="duel-card" ${attrs}>${poster(m.meta, m.title, '(max-width:720px) 44vw, 310px')}
    <span class="t">${esc(m.title)}</span><span class="y">${esc(m.year ?? '')}</span></button>`;
}
function renderRank() {
  const s = ui.session;
  const left = unplaced().length;
  const rr = state.rerank;
  if (!s) {
    const placed = state.order.length;
    if (ui.rerankSetup) {
      const queue = R.planRerank(state.movies, { useStars: true });
      const withStars = R.estimateQuestions(state.movies, queue, true), without = R.estimateQuestions(state.movies, queue, false);
      return `<section class="hero"><h2>Re-rank everything</h2>
        <p>Start a fresh list and place all ${queue.length} films one at a time. Your current list stays untouched until you finish, and you can pause and pick up later on any device.</p></section>
        <div class="panel"><b>How should we start?</b>
          <label class="choice"><input type="radio" name="rr-mode" value="stars" checked>
            <span><b>Use my star ratings as a head start</b><br><span class="muted">A 5★ stays above a 4★; I only ask you to order films with the same rating. About ${withStars} questions.</span></span></label>
          <label class="choice"><input type="radio" name="rr-mode" value="fresh">
            <span><b>Ignore my stars (fully fresh)</b><br><span class="muted">Every film is compared across your whole list. About ${without} questions.</span></span></label>
        </div>
        <div class="row"><button class="primary" data-act="rerank-go">Start re-ranking</button><button class="ghost" data-act="rerank-cancel">Back</button></div>`;
    }
    return `<section class="hero"><h2>Build your ranking</h2>
      <p>I'll ask which you liked more than films already on your list, narrowing down until the new film finds its spot. No need to compare against everything.</p></section>
      <div class="stats"><div class="stat"><b>${placed}</b><span class="muted">ranked</span></div><div class="stat"><b>${left}</b><span class="muted">to rank</span></div></div>
      ${rr ? `<div class="panel"><b>Re-rank in progress</b><p class="muted">${rr.total - rr.queue.length} of ${rr.total} films placed. Your current list is unchanged until you finish.</p>
        <div class="row"><button class="primary" data-act="rerank-resume">Resume</button><button class="ghost" data-act="rerank-discard">Discard</button></div></div>` : ''}
      <div class="row">
        <button class="primary" data-act="rank-next" ${left ? '' : 'disabled'}>Rank next film</button>
        <button class="secondary" data-act="rerank-setup" ${Object.keys(state.movies).length >= 2 && !rr ? '' : 'disabled'}>Re-rank everything</button>
        <button class="secondary" data-act="refine" ${placed >= 2 ? '' : 'disabled'}>Refine a close call</button>
        <button class="ghost" data-act="seed" ${Object.values(state.movies).some(m => m.rating != null && !R.isRanked(state.order, m.key)) ? '' : 'disabled'}>Quick-place by my star ratings</button>
      </div>`;
  }
  if (s.step === 'duel' || s.mode === 'rerank') {
    const m = state.movies[s.key];
    const probe = state.movies[sessionList(s)[R.probeIndex(s.ins)]];
    const done = rr && s.mode === 'rerank' ? rr.total - rr.queue.length : 0;
    return `${s.mode === 'rerank' ? `<div class="progress" aria-label="Re-rank progress"><i style="width:${Math.round(done / rr.total * 100)}%"></i></div>
      <p class="muted center">Re-ranking · film ${done + 1} of ${rr.total}</p>` : ''}
      <div class="center"><h2>Which did you like more?</h2>
      <p class="muted">Placing <b>${esc(m.title)}</b>${m.rating != null ? ` (you rated it ${m.rating}★)` : ''} · about ${R.duelsLeft(s.ins)} more</p></div>
      <div class="duel-wrap">${duelCard(m, 'data-act="duel" data-new="1"')}<div class="vs">VS</div>${duelCard(probe, 'data-act="duel" data-new="0"')}</div>
      <div class="row" style="justify-content:center">
        <button class="ghost" data-act="undo" ${s.history.length || (rr?.last && s.mode === 'rerank') ? '' : 'disabled'}>↶ Undo</button>
        <button class="ghost" data-act="skip-duel">Can't compare these</button>
        <button class="ghost" data-act="rank-stop">${s.mode === 'rerank' ? 'Pause' : 'Cancel'}</button></div>`;
  }
  const a = state.movies[s.pair.upper], b = state.movies[s.pair.lower];
  return `<div class="center"><h2>Close call. Which do you prefer?</h2></div>
    <div class="duel-wrap">${duelCard(a, 'data-act="refine-pick" data-lower="0"')}<div class="vs">VS</div>${duelCard(b, 'data-act="refine-pick" data-lower="1"')}</div>
    <div class="row" style="justify-content:center"><button class="ghost" data-act="rank-stop">Done</button></div>`;
}

// ---- My Top list --------------------------------------------------------------
function renderLibrary() {
  const sc = scores();
  const flat = state.order;
  if (!flat.length) return `<section class="hero"><h2>My Top</h2></section><div class="empty"><div class="big">🏆</div><p>Nothing ranked yet. Head to <a href="#" data-tab-link="rank">Rank</a>.</p></div>`;
  return `<section class="hero"><h2>My Top ${flat.length}</h2><p>Your films, best to worst.</p></section>
    ${ui.status ? `<p class="banner">${esc(ui.status)}</p>` : ''}
    <ol class="list">${flat.map((k, i) => {
      const m = state.movies[k]; if (!m) return '';
      return `<li class="item"><span class="n">${i + 1}</span>${poster(m.meta, m.title, '56px')}
        <div><div class="t">${esc(m.title)}</div><div class="muted">${esc(m.year ?? '')}${m.meta?.genres?.length ? ' · ' + esc(m.meta.genres.slice(0, 2).join(', ')) : ''}</div></div>
        <span class="score">${sc[k].toFixed(1)}</span></li>`;
    }).join('')}</ol>`;
}

// ---- Import -------------------------------------------------------------------
function posterHealthHtml() {
  const all = Object.values(state.movies);
  if (!all.length || isDemo()) return '';
  const missing = all.filter(m => !m.meta?.poster);
  return `<div class="panel"><b>Posters</b>
    <p class="muted">${all.length - missing.length} of ${all.length} films have a poster.${ui.enriching ? ` ${esc(ui.loading)}` : ''}</p>
    ${ui.enrichError ? `<p class="banner">${esc(ui.enrichError)} Check your TMDB key (Settings, or <code>TMDB_API_KEY</code> in Vercel).</p>` : ''}
    <div class="row"><button class="secondary" data-act="fix-posters" ${ui.enriching ? 'disabled' : ''}>${missing.length ? 'Retry missing posters' : 'Refresh all details'}</button></div>
    ${missing.slice(0, 12).map(m => `<div class="result"><div class="info"><div class="t">${esc(m.title)} <span class="muted">${esc(m.year ?? '')}</span></div></div>
      <button class="chip-btn" data-act="fix-open" data-key="${esc(m.key)}">Find</button></div>`).join('')}
    ${ui.search.mode === 'fix' && ui.search.key ? `<div class="fixbox"><p class="muted">Pick the right film for <b>${esc(state.movies[ui.search.key]?.title)}</b>:</p>
      <input id="fix-q" type="search" class="wide" value="${esc(ui.search.q)}" autocomplete="off"><div id="fix-results">${searchResultsHtml()}</div></div>` : ''}
  </div>`;
}

function renderImport() {
  const n = Object.keys(state.movies).length;
  return `<section class="hero"><h2>Bring in your history</h2><p>Your data stays in your account. Nothing is shared.</p></section>
    <div class="panel"><b>Letterboxd</b>
      <p class="muted">Letterboxd has no public API, so use your own data export: Settings → Data → Export Your Data. <b>Just upload the .zip as is</b> (reviews, comments and likes are ignored), or upload <code>ratings.csv</code>, <code>watched.csv</code> and/or <code>diary.csv</code> from the zip. Optionally add <code>lists/top-10.csv</code> (or any ranked list) to pin your favourites at the top.</p>
      <label class="drop"><input type="file" id="file-lb" accept=".csv,.zip" multiple>Tap to choose your Letterboxd .zip</label></div>
    <div class="panel"><b>Netflix (or any streaming CSV)</b>
      <p class="muted">Netflix: Account → Profile → Viewing activity → Download all. Series episodes are skipped automatically. Any CSV with a <code>Title</code> or <code>Name</code> column works (optional <code>Year</code>, <code>Rating</code>). Most other services don't offer a history export; add titles by hand below.</p>
      <label class="drop"><input type="file" id="file-other" accept=".csv" multiple>Tap to choose a CSV</label></div>
    <div class="panel"><b>Add a film manually</b>
      <div class="row"><input id="m-title" placeholder="Title"><input id="m-year" placeholder="Year" size="5">
      <button class="secondary" data-act="add-manual">Add</button></div></div>
    ${posterHealthHtml()}
    <div class="panel"><b>Library:</b> ${n} films
      <div class="row">
        <button class="secondary" data-act="demo">Load demo library</button>
        ${isDemo() ? '' : '<button class="secondary" data-act="enrich">Fetch posters &amp; details</button>'}
        <button class="ghost" data-act="wipe">Erase all data</button></div></div>
    ${ui.loading ? `<p class="muted">${esc(ui.loading)}</p>` : ''}${ui.status ? `<p class="banner">${esc(ui.status)}</p>` : ''}`;
}

async function handleFiles(input) {
  const msgs = [];
  // Expand any .zip (Letterboxd export) into its useful CSVs first.
  const files = [];
  for (const f of input.files) {
    if (/\.zip$/i.test(f.name)) {
      try { files.push(...await unzipText(await f.arrayBuffer(), isLetterboxdTasteFile)); }
      catch (e) { msgs.push(`${f.name}: ${e.message}`); }
    } else files.push({ name: f.name, text: await f.text() });
  }
  for (const f of files) {
    const text = f.text;
    if (isListExport(text)) { // ordered favourites list, e.g. Letterboxd Top 10
      const listed = parseList(text);
      mergeIntoLibrary(state, listed.map(x => ({ ...x, rating: null, watchedDate: null, source: 'letterboxd-list' })));
      const keys = listed.map(x => movieKey(x.title, x.year));
      if (!state.favorites.length) state.favorites = keys; // first list wins (usually your Top 10)
      msgs.push(`${f.name}: favourites list of ${keys.length}`);
      continue;
    }
    const { source, items } = parseExport(text);
    const r = mergeIntoLibrary(state, items);
    msgs.push(`${f.name}: ${items.length} rows (${source}), ${r.added} new`);
  }
  ui.picks = null;
  R.seedFromRatings(state.order, state.movies);
  R.applyFavoritesOrder(state.order, state.favorites || [], new Set(Object.keys(state.movies)));
  persist();
  ui.status = msgs.join(' · ') + (isDemo() ? '' : ' — looking up details…');
  render();
  if (!isDemo()) enrichLibrary();
}

// ---- Settings -----------------------------------------------------------------
function renderSettings() {
  const s = state.settings;
  return `<section class="hero"><h2>Settings</h2></section>
    <div class="panel"><b>Appearance</b>
      <div class="row">${[['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match device']].map(([v, l]) =>
        `<button class="${getTheme() === v ? 'primary' : 'secondary'}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="muted">Saved on this device. Dark is the default.</p></div>
    <div class="panel"><b>Your data</b>
      <p class="muted">Download a backup of your library and rankings, or restore one (it merges, nothing is lost). Handy for moving to a new web address.</p>
      <div class="row"><button class="secondary" data-act="export">Download backup</button>
        <label class="btn secondary" style="cursor:pointer">Restore from backup<input type="file" id="file-restore" accept=".json,application/json" hidden></label></div></div>
    <div class="panel"><b>Sign in</b>
      ${ui.owner ? `<p class="muted">✓ Signed in on this device. Your changes save to your library and sync everywhere. You'll stay signed in for a year. ${esc(ui.sync)}</p>
        <div class="row"><button class="secondary" data-act="logout">Sign out of this device</button></div>`
      : ui.server ? `<p class="muted">Anyone opening this site sees your library. To change it from this device, sign in once with your passphrase. It won't ask again.</p>
        <div class="row"><input id="s-pass" type="password" size="30" placeholder="Passphrase" autocomplete="current-password"><button class="primary" data-act="login">Sign in</button></div>
        ${ui.authError ? `<p class="banner">${esc(ui.authError)}</p>` : ''}`
      : `<p class="muted">Cross-device sync isn't set up on the server yet (see the README). Until then, data stays in this browser.</p>`}</div>
    <div class="panel"><b>Rotten Tomatoes scores</b>
      ${ui.omdbProxy ? '<p class="muted">✓ The server has your OMDb key. Scores show on film details.</p>'
        : `<p class="muted">Scores come from OMDb (free key at omdbapi.com). Add it as <code>OMDB_API_KEY</code> in Vercel, or paste it here for this device only.</p>
        <input id="s-omdb" type="password" size="30" value="${esc(state.settings.omdbKey)}" placeholder="OMDb API key">`}</div>
    <div class="panel"><b>TMDB API key</b>
      ${ui.proxy ? '<p class="muted">✓ The server already has your TMDB key, so you can leave this blank.</p>' : ''}
      <p class="muted">Free at themoviedb.org → Settings → API. Used for posters, genres, recommendations and "where to stream". Stored only in this browser.</p>
      <input id="s-key" type="password" size="40" value="${esc(s.tmdbKey)}" placeholder="API key or read access token"></div>
    <div class="panel"><b>Streaming</b>
      <p class="muted">Region (2-letter code) and services as TMDB names, comma-separated, e.g. <i>Netflix, Max, Hulu</i>. Leave services empty to show any.</p>
      <div class="row"><input id="s-region" size="3" value="${esc(s.region)}"><input id="s-services" size="40" value="${esc(s.services.join(', '))}"></div></div>
    <div class="row"><button class="primary" data-act="save-settings">Save</button></div>
    ${viewOnly() ? '' : `<h2 class="sub big">Import &amp; library</h2>${renderImport()}`}`;
}

// ---- Events -------------------------------------------------------------------
async function onClick(e) {
  const link = e.target.closest('[data-tab-link]');
  if (link) { e.preventDefault(); ui.tab = link.dataset.tabLink; ui.status = ''; return render(); }
  const mood = e.target.closest('[data-mood]');
  if (mood) { const m = MOODS.find(x => x.id === mood.dataset.mood); ui.mood = ui.mood?.id === m.id ? null : m; return loadPicks(); }
  const segBtn = e.target.closest('[data-seg]');
  if (segBtn) { ui.filters[segBtn.dataset.seg] = segBtn.dataset.v; return loadPicks(); }
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const { act } = btn.dataset, s = ui.session;
  if (act === 'close-detail' && e.target !== btn && !e.target.closest('.close')) return; // clicks inside the sheet stay open
  if (viewOnly() && !['shuffle', 'theme', 'export', 'login', 'logout', 'goto-signin', 'stream-only', 'detail', 'close-detail', 'spot-pick', 'spot-again', 'spot-close', 'spot-stream'].includes(act)) { ui.detail = null; renderModal(); ui.tab = 'settings'; return render(); }
  const i = +btn.dataset.i;
  switch (act) {
    case 'shuffle': return shuffle();
    case 'stream-only': ui.streamOnly = btn.checked; return loadPicks();
    case 'hide': state.hidden.push(ui.picks[i].meta.key); dropPick(i); persist(); return render();
    case 'watchlist': toggleWatchlist(view(ui.picks[i].meta)); dropPick(i); return render();
    case 'unlist': state.watchlist = state.watchlist.filter(m => m.key !== ui.picks[i].meta.key); dropPick(i); persist(); return render();
    case 'seen': {
      const meta = ui.picks[i].meta;
      state.watchlist = state.watchlist.filter(m => m.key !== meta.key);
      logFilm(view(meta)); // "what did you think?" starts the ranking
      return;
    }
    case 'log-pick': return logFilm(ui.search.results[i], document.getElementById('log-date')?.value || today());
    case 'log-manual': {
      const q = ui.search.q.trim(); if (!q) return;
      const m = /^(.*?)\s*\((\d{4})\)$/.exec(q); // "Heat (1995)"
      return logFilm({ title: m ? m[1] : q, year: m ? +m[2] : null, genres: [], directors: [], poster: null, overview: '' }, document.getElementById('log-date')?.value || today());
    }
    case 'fix-posters': return enrichLibrary({ retryMissing: true });
    case 'fix-open': ui.search = { mode: 'fix', key: btn.dataset.key, q: state.movies[btn.dataset.key].title, results: [], note: '' }; render(); return runSearch(ui.search.q, 'fix');
    case 'fix-pick': {
      const key = ui.search.key, meta = ui.search.results[i];
      state.movies[key].meta = { ...meta, key }; ui.search = { mode: 'log', key: null, q: '', results: [], note: '' };
      persist(); render();
      const api = tmdb(); if (api && meta.tmdbId) api.details(meta.tmdbId).then(d => { state.movies[key].meta = { ...state.movies[key].meta, ...d, key }; persist(); safeRender(); }).catch(() => {});
      return;
    }
    case 'rank-next': { const k = nextToRank(); return k && startRanking(k); }
    case 'rank-stop': ui.session = null; persist(); return render();
    case 'seed': R.seedFromRatings(state.order, state.movies); persist(); return render();
    case 'rerank-setup': ui.rerankSetup = true; return render();
    case 'rerank-cancel': ui.rerankSetup = false; return render();
    case 'rerank-go': return startRerank(document.querySelector('input[name=rr-mode]:checked')?.value !== 'fresh');
    case 'rerank-resume': return nextRerank();
    case 'rerank-discard': if (confirm('Discard the re-rank in progress? Your current list is kept.')) { delete state.rerank; persist(); } return render();
    case 'undo': {
      if (s.history.length) { s.ins = s.history.pop(); return render(); }
      const rr = state.rerank;
      if (s.mode === 'rerank' && rr?.last) { // step back to the previous film's last question
        R.removeFromOrder(rr.order, rr.last.key); rr.queue.unshift(rr.last.key);
        const ins = rr.last.ins; rr.last = null; persist(); return nextRerank(ins);
      }
      return;
    }
    case 'theme': setTheme(btn.dataset.v); return render();
    case 'skip-duel': s.history.push(s.ins); s.ins = R.skip(s.ins); return R.isDone(s.ins) ? finishPlacement() : render();
    case 'duel': {
      s.history.push(s.ins);
      s.ins = R.answer(s.ins, btn.dataset.new === '1');
      return R.isDone(s.ins) ? finishPlacement() : render();
    }
    case 'refine': { const pair = R.pickRefinePair(state.order); if (pair) { ui.session = { step: 'refine', pair }; render(); } return; }
    case 'refine-pick': {
      if (btn.dataset.lower === '1') R.swapPair(state.order, s.pair);
      persist(); const pair = R.pickRefinePair(state.order); ui.session = pair ? { step: 'refine', pair } : null; return render();
    }
    case 'add-manual': {
      const title = document.getElementById('m-title').value.trim();
      const year = parseInt(document.getElementById('m-year').value, 10) || null;
      if (!title) return;
      mergeIntoLibrary(state, [{ title, year, rating: null, watchedDate: null, source: 'manual' }]);
      persist(); if (!isDemo()) enrichLibrary(); ui.status = `Added ${title}.`; return render();
    }
    case 'detail': return openDetail(srcMeta(btn.dataset.src, +btn.dataset.i));
    case 'close-detail': ui.detail = null; return renderModal();
    case 'detail-watched': return logFilm(view(ui.detail.meta));
    case 'detail-list': toggleWatchlist(view(ui.detail.meta)); renderModal(); return safeRender();
    case 'row-watched': return logFilm(view(srcMeta(btn.dataset.src, i)));
    case 'row-list': toggleWatchlist(view(srcMeta(btn.dataset.src, i))); return ui.tab === 'find' ? updateFindList() : render();
    case 'wl-remove': state.watchlist.splice(i, 1); persist(); return render();
    case 'browse-kind': ui.browse.kind = btn.dataset.v; render(); return loadBrowse(true);
    case 'browse-more': return loadBrowse();
    case 'spot-pick': case 'spot-again': return pickFromWatchlist();
    case 'spot-close': ui.spot = null; return render();
    case 'spot-watched': return logFilm(view(ui.spot));
    case 'spot-stream': ui.spotStreamOnly = btn.checked; return;
    case 'login': return signIn(document.getElementById('s-pass').value);
    case 'logout': return signOut();
    case 'goto-signin': ui.tab = 'settings'; return render();
    case 'export': {
      const url = URL.createObjectURL(new Blob([JSON.stringify(syncPayload(state), null, 1)], { type: 'application/json' }));
      Object.assign(document.createElement('a'), { href: url, download: `${BRAND.name.toLowerCase()}-backup-${today()}.json` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    case 'demo': ui.picks = null; Object.assign(state.movies, demoLibrary()); R.seedFromRatings(state.order, state.movies); persist(); ui.status = 'Demo library loaded.'; return render();
    case 'enrich': return enrichLibrary();
    case 'wipe': if (confirm('Erase your library, rankings and settings from this browser?')) { localStorage.clear(); location.reload(); } return;
    case 'save-settings':
      state.settings.tmdbKey = document.getElementById('s-key').value.trim();
      state.settings.omdbKey = document.getElementById('s-omdb')?.value.trim() ?? state.settings.omdbKey;
      state.settings.region = document.getElementById('s-region').value.trim().toUpperCase() || 'US';
      state.settings.services = document.getElementById('s-services').value.split(',').map(x => x.trim()).filter(Boolean);
      persist(false); ui.status = 'Saved.'; ui.tab = 'recommend';
      render(); if (!isDemo()) enrichLibrary(); return;
  }
}
$app.addEventListener('click', onClick);
$modal.addEventListener('click', onClick);
$app.addEventListener('input', e => {
  if (e.target.id === 'log-q') runSearch(e.target.value, 'log');
  if (e.target.id === 'fix-q') runSearch(e.target.value, 'fix');
});
$app.addEventListener('change', e => {
  if (viewOnly() && /^file-/.test(e.target.id)) return;
  if (e.target.dataset.filter === 'genre') { ui.filters.genre = e.target.value; loadPicks(); }
  if (e.target.dataset.filter === 'browse-genre') { ui.browse.genre = e.target.value; render(); loadBrowse(true); }
  if (e.target.id === 'file-restore') restoreBackup(e.target);
  if (e.target.id === 'file-lb' || e.target.id === 'file-other') handleFiles(e.target);
});

async function restoreBackup(input) {
  try {
    const backup = JSON.parse(await input.files[0].text());
    if (!backup || typeof backup.movies !== 'object') throw new Error('That file is not a backup.');
    const merged = mergeStates(state, migrate({ ...emptyState(), ...backup }));
    Object.assign(state, merged, { settings: state.settings });
    ui.picks = null; persist();
    ui.status = `Restored ${Object.keys(state.movies).length} films.`; ui.tab = 'library';
  } catch (e) { ui.status = `Couldn't restore: ${e.message}`; }
  render();
}

function finishPlacement() {
  const s = ui.session;
  const pos = R.position(s.ins);
  if (s.mode === 'rerank') {
    R.insertAt(state.rerank.order, s.key, pos);
    state.rerank.queue.shift();
    state.rerank.last = { key: s.key, ins: s.history[s.history.length - 1] || null }; // lets Undo step back across films
    persist();
    return nextRerank();
  }
  R.insertAt(state.order, s.key, pos);
  persist(); ui.picks = null;
  const m = state.movies[s.key];
  ui.status = `${m.title} is now #${pos + 1} of ${state.order.length}.`;
  const k = nextToRank();
  ui.session = null;
  if (k && confirm(`${ui.status} Rank the next film?`)) return startRanking(k);
  ui.tab = 'library';
  render();
}

const locked = title => `<section class="hero"><h2>${title}</h2><p>This is a read-only view of the library.</p></section>
  <div class="panel"><p>Sign in on this device to make changes.</p><div class="row"><button class="primary" data-act="goto-signin">Sign in</button></div></div>`;

function render() {
  if (ui.tab === 'import' || ui.tab === 'log') ui.tab = ui.tab === 'log' ? 'find' : 'settings';
  renderNav();
  if (ui.tab === 'find' && !viewOnly() && !ui.browse.items.length && !ui.browse.loading && !ui.browse.done) setTimeout(() => loadBrowse(), 0);
  if (ui.tab === 'watchlist') { const sig = state.watchlist.map(m => m.key).join(); if (ui.wlSig !== sig) { ui.wlSig = sig; setTimeout(() => fillAll(state.watchlist), 0); } }
  if (ui.tab === 'recommend' && ui.picks === null && !ui.loading && Object.keys(state.movies).length) setTimeout(loadPicks, 0); // auto-recommend
  const view = { recommend: renderRecommend, find: renderFind, watchlist: renderWatchlist, rank: renderRank, library: renderLibrary, settings: renderSettings };
  renderModal();
  const lock = viewOnly() && ['find', 'rank'].includes(ui.tab);
  $app.innerHTML = (viewOnly() && ui.tab !== 'settings' ? `<div class="banner">👀 Read-only. <a href="#" data-tab-link="settings">Sign in</a> on this device to edit.</div>` : '')
    + (lock ? locked({ find: 'Find films', rank: 'Rank' }[ui.tab]) : view[ui.tab]());
}
render();
(async () => {
  const legacy = state.settings.syncPass;
  if (legacy) { state.settings.syncPass = ''; save(state); await signIn(legacy).catch(() => {}); } // already typed on this device: sign in for them once
  await syncNow();
  if (!isDemo()) enrichLibrary();
})(); // pull latest, then fill in posters
