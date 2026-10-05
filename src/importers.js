// Turns exported files into normalized rows: { title, year, rating, watchedDate, source }.
// Supported: Letterboxd export (ratings.csv / watched.csv / diary.csv), Netflix ViewingActivity.csv,
// and any CSV with a Name/Title column (Year / Rating optional) as a generic fallback.
import { parseCSVObjects } from './csv.js';

const pick = (row, names) => {
  for (const n of names) if (row[n] !== undefined && row[n] !== '') return row[n];
  return '';
};

export function norm(title) {
  return title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}
export const movieKey = (title, year) => `${norm(title)}|${year || ''}`;

const SERIES_PATTERN = /:\s*(season|series|limited series|volume|part|chapter|book)\b|:\s*episode\b|\bepisode\s+\d+/i;

export function detectSource(header) {
  const h = header.map(x => x.trim());
  if (h.includes('Letterboxd URI')) return 'letterboxd';
  if (h.includes('Profile Name') && h.includes('Title')) return 'netflix';
  return 'generic';
}

export function parseExport(text) {
  const rows = parseCSVObjects(text);
  if (!rows.length) return { source: 'generic', items: [] };
  const source = detectSource(Object.keys(rows[0]));
  const items = [];
  const seen = new Map();

  for (const row of rows) {
    const title = pick(row, ['Name', 'Title']);
    if (!title) continue;
    if (source === 'netflix' && SERIES_PATTERN.test(title)) continue;
    const year = parseInt(pick(row, ['Year']), 10) || null;
    const ratingRaw = parseFloat(pick(row, ['Rating']));
    const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : null;
    const watchedDate = pick(row, ['Watched Date', 'Date', 'Start Time']).slice(0, 10) || null;
    const item = { title, year, rating, watchedDate, source };
    const key = movieKey(title, year);
    // diary.csv can repeat a film (rewatches); keep the latest rating we've seen.
    if (seen.has(key)) {
      const prev = seen.get(key);
      if (rating != null) prev.rating = rating;
      continue;
    }
    seen.set(key, item);
    items.push(item);
  }
  return { source, items };
}

// Merge rows into library.movies (a plain object keyed by movieKey). Returns counts.
export function mergeIntoLibrary(library, items) {
  let added = 0, updated = 0;
  for (const it of items) {
    let key = movieKey(it.title, it.year);
    if (!library.movies[key] && !it.year) {
      // Year-less sources (Netflix): match an existing film by title.
      const hit = Object.values(library.movies).find(m => norm(m.title) === norm(it.title));
      if (hit) key = hit.key;
    }
    const existing = library.movies[key];
    if (existing) {
      if (it.rating != null && existing.rating == null) { existing.rating = it.rating; updated++; }
      if (it.watchedDate && !existing.watchedDate) existing.watchedDate = it.watchedDate;
    } else {
      library.movies[key] = { key, title: it.title, year: it.year, rating: it.rating,
        watchedDate: it.watchedDate, sources: [it.source], meta: null };
      added++;
    }
  }
  return { added, updated };
}

// Letterboxd list export (e.g. lists/top-10.csv): a metadata preamble, then a
// "Position,Name,Year,URL,Description" table. Returns films in list order.
export function isListExport(text) {
  return /^﻿?Letterboxd list export/.test(text);
}
export function parseList(text) {
  const at = text.search(/^Position,/m);
  if (at < 0) return [];
  return parseCSVObjects(text.slice(at))
    .map(r => ({ title: r.Name, year: parseInt(r.Year, 10) || null, position: parseInt(r.Position, 10) }))
    .filter(r => r.title)
    .sort((a, b) => a.position - b.position);
}
