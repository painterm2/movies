import { load, save, migrate } from './store.js';
import { parseExport, mergeIntoLibrary, movieKey, isListExport, parseList } from './importers.js';
import * as R from './ranking.js';
import { buildProfile, rank as rankCandidates } from './recommend.js';
import { MOODS, GENRE_NAME_TO_ID } from './moods.js';
import { createClient, imageUrl, streamingOn } from './tmdb.js';
import { DEMO_CATALOG, demoLibrary } from './demo.js';
import { unzipText, isLetterboxdTasteFile } from './unzip.js';
import { createSyncClient, mergeStates } from './sync.js';

const state = load();
const ui = { proxy: false, sync: '', tab: 'recommend', mood: null, recs: null, loading: '', status: '', session: null, streamOnly: false };
const $app = document.getElementById('app');
// ---- sync ---------------------------------------------------------------------
let pushTimer = null, syncing = false;
const syncOn = () => Boolean(state.settings.syncPass);
function persist(touch = true) {
  if (touch) state.updatedAt = Date.now();
  save(state);
  if (touch && syncOn()) { clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 1500); }
}
async function syncNow() {
  if (!syncOn() || syncing) return;
  syncing = true;
  try {
    const client = createSyncClient(state.settings.syncPass);
    const { state: remote, tmdbProxy } = await client.pull();
    ui.proxy = tmdbProxy;
    let next = state;
    if (remote) {
      const merged = mergeStates(state, { ...migrate(remote), settings: state.settings });
      Object.assign(state, merged, { settings: state.settings });
      next = state;
    }
    save(state);
    await client.push(next);
    ui.sync = `Synced ${new Date().toLocaleTimeString()}`;
  } catch (e) { ui.sync = `Sync problem: ${e.message}`; }
  syncing = false;
  render();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tmdb = () => (ui.proxy && syncOn() ? createClient({ proxyPass: state.settings.syncPass })
  : state.settings.tmdbKey ? createClient({ key: state.settings.tmdbKey }) : null);
const isDemo = () => !tmdb();

const TABS = [['recommend', 'Recommend'], ['rank', 'Rank'], ['library', 'My Top'], ['import', 'Import'], ['settings', 'Settings']];
function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = TABS.map(([id, l]) => `<button class="${ui.tab === id ? 'active' : ''}" data-tab="${id}">${l}</button>`).join('');
}
document.getElementById('nav').addEventListener('click', e => {
  const t = e.target.closest('[data-tab]'); if (t) { ui.tab = t.dataset.tab; render(); }
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
async function enrichLibrary() {
  const api = tmdb(); if (!api) return;
  const todo = Object.values(state.movies).filter(m => !m.meta);
  let done = 0;
  for (const m of todo) {
    ui.loading = `Looking up films… ${done}/${todo.length}`; render();
    try {
      const hit = await api.search(m.title, m.year);
      if (hit) m.meta = { ...(await api.details(hit.id)), key: m.key };
    } catch (e) { ui.status = e.message; break; }
    done++;
    if (done % 10 === 0) persist();
  }
  ui.loading = ''; persist(); render();
}

// ---- Recommendations ----------------------------------------------------------
async function getRecommendations() {
  ui.loading = 'Finding your next watch…'; ui.recs = null; render();
  const prof = profile();
  const exclude = new Set([...watchedKeys(), ...state.hidden]);
  let candidates;
  try {
    candidates = isDemo() ? DEMO_CATALOG.map(meta => ({ meta, sources: [] })) : await fetchCandidates();
  } catch (e) { ui.status = e.message; candidates = []; }
  let out = rankCandidates(candidates, prof, { mood: ui.mood, exclude, limit: 60 });
  if (ui.streamOnly && !isDemo()) {
    out = out.filter(c => streamingOn(c.meta, state.settings.region, state.settings.services).length);
  }
  ui.recs = out.slice(0, 18);
  ui.loading = ''; render();
}

async function fetchCandidates() {
  const api = tmdb();
  const sc = scores();
  const loved = Object.values(state.movies).filter(m => m.meta?.tmdbId && (sc[m.key] ?? 0) >= 7)
    .sort((a, b) => sc[b.key] - sc[a.key]).slice(0, 12);
  const pool = new Map();
  const add = (meta, source) => {
    const c = pool.get(meta.key) || { meta, sources: [] };
    if (source) c.sources.push(source);
    pool.set(meta.key, c);
  };
  await Promise.all(loved.map(async m => (await api.recommendations(m.meta.tmdbId)).forEach(r => add(r, m.title))));
  if (ui.mood?.want.length) {
    const ids = ui.mood.want.map(g => GENRE_NAME_TO_ID[g]).filter(Boolean);
    (await api.discover({ genreIds: ids })).forEach(r => add(r, null));
  }
  // Fill in runtime / director / streaming for the most promising ones.
  const prelim = rankCandidates([...pool.values()], profile(), { exclude: new Set([...watchedKeys(), ...state.hidden]), limit: 30 });
  await Promise.all(prelim.map(async c => {
    try { c.meta = { ...c.meta, ...(await api.details(c.meta.tmdbId)) }; } catch { /* keep partial */ }
  }));
  return prelim.map(({ meta, sources }) => ({ meta, sources }));
}

function cardHtml(c, i) {
  const m = c.meta;
  const on = streamingOn(m, state.settings.region, state.settings.services);
  return `<div class="card">
    ${m.poster ? `<img src="${esc(imageUrl(m.poster))}" alt="" loading="lazy">` : ''}
    <div>
      <h3>${esc(m.title)} <span class="muted">(${esc(m.year)})</span></h3>
      <div class="muted">${esc((m.genres || []).join(', '))}${m.runtime ? ` · ${m.runtime} min` : ''}</div>
      ${(c.reasons || []).slice(0, 2).map(r => `<div class="why">${esc(r)}</div>`).join('')}
      ${on.length ? `<div class="muted">▶ ${esc(on.join(', '))}</div>` : ''}
      <div class="row" style="margin:8px 0 0">
        <button data-act="seen" data-i="${i}">Seen it</button>
        <button data-act="watchlist" data-i="${i}">+ Watchlist</button>
        <button class="ghost" data-act="hide" data-i="${i}">Not interested</button>
      </div>
    </div></div>`;
}

function renderRecommend() {
  const moods = MOODS.map(m => `<button class="${ui.mood?.id === m.id ? 'active' : ''}" data-mood="${m.id}">${m.emoji} ${esc(m.label)}</button>`).join('');
  const n = Object.keys(state.movies).length;
  let body = '';
  if (!n) body = `<div class="panel">Start by <a href="#" data-tab-link="import">importing your Letterboxd export</a> or loading the demo library.</div>`;
  else if (ui.loading) body = `<p class="muted">${esc(ui.loading)}</p>`;
  else if (ui.recs) body = ui.recs.length ? `<div class="grid">${ui.recs.map(cardHtml).join('')}</div>` : '<p class="muted">Nothing matched. Try another mood.</p>';
  return `<h2>What should I watch?</h2>
    ${isDemo() ? '<div class="banner">Demo mode: picks come from a small built-in catalog. Add a free TMDB key in Settings for real recommendations.</div>' : ''}
    <div class="row">${moods}</div>
    <div class="row">
      <button class="primary" data-act="recommend">${ui.mood ? `Recommend for "${esc(ui.mood.label)}"` : 'Recommend for my taste'}</button>
      ${ui.mood ? '<button class="ghost" data-act="clear-mood">Clear mood</button>' : ''}
      ${isDemo() ? '' : `<label class="muted"><input type="checkbox" data-act="stream-only" ${ui.streamOnly ? 'checked' : ''}> Only on my services</label>`}
    </div>
    ${ui.status ? `<p class="banner">${esc(ui.status)}</p>` : ''}${body}`;
}

// ---- Rank (Beli-style) --------------------------------------------------------
function startRanking(key) { ui.tab = 'rank';
  const ins = R.startInsertion(state.order.filter(k => k !== key).length);
  ui.session = { key, step: R.isDone(ins) ? 'done' : 'duel', ins };
  if (ui.session.step === 'done') return finishPlacement();
  render();
}
function nextToRank() { const u = unplaced(); return u.length ? u[0].key : null; }

function renderRank() {
  const s = ui.session;
  const left = unplaced().length;
  if (!s) {
    const placed = state.order.length;
    return `<h2>Rank your movies</h2>
      <p class="muted">${placed} ranked · ${left} still unranked. Add a film and I'll ask which you liked more than films already on your list, narrowing down until it lands in the right spot. It never needs to compare against everything.</p>
      <div class="row">
        <button class="primary" data-act="rank-next" ${left ? '' : 'disabled'}>Rank next film</button>
        <button data-act="seed" ${Object.values(state.movies).some(m => m.rating != null && !R.isRanked(state.order, m.key)) ? '' : 'disabled'}>Quick-place by my star ratings</button>
        <button data-act="refine" ${placed >= 2 ? '' : 'disabled'}>Refine a close call</button>
      </div>`;
  }
  if (s.step === 'duel') {
    const m = state.movies[s.key];
    const others = state.order.filter(k => k !== s.key);
    const probe = state.movies[others[R.probeIndex(s.ins)]];
    return `<h2>Which did you like more?</h2>
      <p class="muted">Placing <b>${esc(m.title)}</b>${m.rating != null ? ` (you gave it ${m.rating}★)` : ''} · about ${R.duelsLeft(s.ins)} more</p>
      <div class="duel">
        <button data-act="duel" data-new="1">${esc(m.title)}<br><span class="muted">${esc(m.year ?? '')}</span></button>
        <button data-act="duel" data-new="0">${esc(probe.title)}<br><span class="muted">${esc(probe.year ?? '')}</span></button>
      </div>
      <div class="row"><button class="ghost" data-act="skip-duel">Can't compare these</button>
        <button class="ghost" data-act="rank-stop">Cancel</button></div>`;
  }
  const a = state.movies[s.pair.upper], b = state.movies[s.pair.lower];
  return `<h2>Close call — which do you prefer?</h2>
    <div class="duel">
      <button data-act="refine-pick" data-lower="0">${esc(a.title)}</button>
      <button data-act="refine-pick" data-lower="1">${esc(b.title)}</button>
    </div><div class="row"><button class="ghost" data-act="rank-stop">Done</button></div>`;
}

// ---- My Top list --------------------------------------------------------------
function renderLibrary() {
  const sc = scores();
  const flat = state.order;
  if (!flat.length) return `<h2>My Top</h2><p class="muted">Nothing ranked yet. Head to the Rank tab.</p>`;
  return `<h2>My Top ${flat.length}</h2>${ui.status ? `<p class="banner">${esc(ui.status)}</p>` : ''}<ol class="rank">${flat.map(k => {
    const m = state.movies[k]; if (!m) return '';
    return `<li><span class="score">${sc[k].toFixed(1)}</span> ${esc(m.title)} <span class="muted">(${esc(m.year ?? '')})</span></li>`;
  }).join('')}</ol>`;
}

// ---- Import -------------------------------------------------------------------
function renderImport() {
  const n = Object.keys(state.movies).length;
  return `<h2>Import what you've watched</h2>
    <div class="panel"><b>Letterboxd</b>
      <p class="muted">Letterboxd has no public API, so use your own data export: Settings → Data → Export Your Data. <b>Just upload the .zip as is</b> (reviews, comments and likes are ignored), or upload <code>ratings.csv</code>, <code>watched.csv</code> and/or <code>diary.csv</code> from the zip. Optionally add <code>lists/top-10.csv</code> (or any ranked list) to pin your favourites at the top.</p>
      <input type="file" id="file-lb" accept=".csv,.zip" multiple></div>
    <div class="panel"><b>Netflix (or any streaming CSV)</b>
      <p class="muted">Netflix: Account → Profile → Viewing activity → Download all. Series episodes are skipped automatically. Any CSV with a <code>Title</code> or <code>Name</code> column works (optional <code>Year</code>, <code>Rating</code>). Most other services don't offer a history export; add titles by hand below.</p>
      <input type="file" id="file-other" accept=".csv" multiple></div>
    <div class="panel"><b>Add a film manually</b>
      <div class="row"><input id="m-title" placeholder="Title"><input id="m-year" placeholder="Year" size="5">
      <button data-act="add-manual">Add</button></div></div>
    <div class="panel"><b>Library:</b> ${n} films
      <div class="row">
        <button data-act="demo">Load demo library</button>
        ${isDemo() ? '' : '<button data-act="enrich">Look up details on TMDB</button>'}
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
  return `<h2>Settings</h2>
    <div class="panel"><b>Sync across devices</b>
      <p class="muted">Enter the passphrase you set as <code>SYNC_PASSWORD</code> in Vercel. Use the same one on every device and your library, rankings and watchlist stay in sync. It's saved only on this device.</p>
      <input id="s-pass" type="password" size="30" value="${esc(s.syncPass)}" placeholder="Sync passphrase">
      ${ui.sync ? `<p class="muted">${esc(ui.sync)}</p>` : ''}</div>
    <div class="panel"><b>TMDB API key</b>
      ${ui.proxy ? '<p class="muted">✓ The server already has your TMDB key, so you can leave this blank.</p>' : ''}
      <p class="muted">Free at themoviedb.org → Settings → API. Used for posters, genres, recommendations and "where to stream". Stored only in this browser.</p>
      <input id="s-key" type="password" size="40" value="${esc(s.tmdbKey)}" placeholder="API key or read access token"></div>
    <div class="panel"><b>Streaming</b>
      <p class="muted">Region (2-letter code) and services as TMDB names, comma-separated, e.g. <i>Netflix, Max, Hulu</i>. Leave services empty to show any.</p>
      <div class="row"><input id="s-region" size="3" value="${esc(s.region)}"><input id="s-services" size="40" value="${esc(s.services.join(', '))}"></div></div>
    <button class="primary" data-act="save-settings">Save</button>`;
}

// ---- Events -------------------------------------------------------------------
$app.addEventListener('click', async e => {
  const link = e.target.closest('[data-tab-link]');
  if (link) { e.preventDefault(); ui.tab = link.dataset.tabLink; return render(); }
  const mood = e.target.closest('[data-mood]');
  if (mood) { ui.mood = MOODS.find(m => m.id === mood.dataset.mood); return render(); }
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const { act } = btn.dataset, s = ui.session;
  const i = +btn.dataset.i;
  switch (act) {
    case 'recommend': return getRecommendations();
    case 'clear-mood': ui.mood = null; return render();
    case 'stream-only': ui.streamOnly = btn.checked; return;
    case 'hide': state.hidden.push(ui.recs[i].meta.key); ui.recs.splice(i, 1); persist(); return render();
    case 'watchlist': state.watchlist.push(ui.recs[i].meta); ui.recs.splice(i, 1); persist(); return render();
    case 'seen': {
      const meta = ui.recs[i].meta;
      state.movies[meta.key] = { key: meta.key, title: meta.title, year: meta.year, rating: null, watchedDate: null, sources: ['recommendation'], meta };
      ui.recs.splice(i, 1); persist(); return startRanking(meta.key); // "what did you think?"
    }
    case 'rank-next': { const k = nextToRank(); return k && startRanking(k); }
    case 'rank-stop': ui.session = null; persist(); return render();
    case 'seed': R.seedFromRatings(state.order, state.movies); persist(); return render();
    case 'skip-duel': s.ins = R.skip(s.ins); return R.isDone(s.ins) ? finishPlacement() : render();
    case 'duel': {
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
    case 'demo': Object.assign(state.movies, demoLibrary()); R.seedFromRatings(state.order, state.movies); persist(); ui.status = 'Demo library loaded.'; return render();
    case 'enrich': return enrichLibrary();
    case 'wipe': if (confirm('Erase your library, rankings and settings from this browser?')) { localStorage.clear(); location.reload(); } return;
    case 'save-settings':
      state.settings.syncPass = document.getElementById('s-pass').value.trim();
      state.settings.tmdbKey = document.getElementById('s-key').value.trim();
      state.settings.region = document.getElementById('s-region').value.trim().toUpperCase() || 'US';
      state.settings.services = document.getElementById('s-services').value.split(',').map(x => x.trim()).filter(Boolean);
      persist(false); ui.status = 'Saved.'; ui.tab = 'recommend';
      await syncNow(); render(); if (!isDemo()) enrichLibrary(); return;
  }
});
$app.addEventListener('change', e => {
  if (e.target.matches('[data-act="stream-only"]')) ui.streamOnly = e.target.checked;
  if (e.target.id === 'file-lb' || e.target.id === 'file-other') handleFiles(e.target);
});

function finishPlacement() {
  const s = ui.session;
  const pos = R.position(s.ins);
  R.insertAt(state.order, s.key, pos);
  persist();
  const m = state.movies[s.key];
  ui.status = `${m.title} is now #${pos + 1} of ${state.order.length}.`;
  const k = nextToRank();
  ui.session = null;
  if (k && confirm(`${ui.status} Rank the next film?`)) return startRanking(k);
  ui.tab = 'library';
  render();
}

function render() {
  renderNav();
  $app.innerHTML = { recommend: renderRecommend, rank: renderRank, library: renderLibrary, import: renderImport, settings: renderSettings }[ui.tab]();
}
render();
syncNow(); // pull the latest on load
