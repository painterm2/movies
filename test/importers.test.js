import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from '../src/csv.js';
import { parseExport, mergeIntoLibrary } from '../src/importers.js';

test('csv handles quotes, commas and CRLF', () => {
  const rows = parseCSV('a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"']]);
});

test('letterboxd ratings.csv', () => {
  const csv = 'Date,Name,Year,Letterboxd URI,Rating\n2021-01-02,"Amélie",2001,https://boxd.it/x,4.5\n2021-01-03,Heat,1995,https://boxd.it/y,';
  const { source, items } = parseExport(csv);
  assert.equal(source, 'letterboxd');
  assert.equal(items.length, 2);
  assert.equal(items[0].rating, 4.5);
  assert.equal(items[1].rating, null);
});

test('diary rewatches collapse into one film', () => {
  const csv = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2020-01-01,Heat,1995,u,3,,,2020-01-01\n2021-01-01,Heat,1995,u,4,Yes,,2021-01-01';
  const { items } = parseExport(csv);
  assert.equal(items.length, 1);
  assert.equal(items[0].rating, 4);
});

test('netflix import drops series episodes and merges year-less titles', () => {
  const csv = 'Profile Name,Start Time,Duration,Attributes,Title\nme,2024-03-01 20:00:00,01:50:00,,Heat\nme,2024-03-02 20:00:00,00:45:00,,Dark: Season 1: Secrets';
  const { source, items } = parseExport(csv);
  assert.equal(source, 'netflix');
  assert.equal(items.length, 1);
  const lib = { movies: {} };
  mergeIntoLibrary(lib, [{ title: 'Heat', year: 1995, rating: 4, source: 'letterboxd' }]);
  const r = mergeIntoLibrary(lib, items);
  assert.equal(r.added, 0);
  assert.equal(Object.keys(lib.movies).length, 1);
});

import { isListExport, parseList } from '../src/importers.js';
test('letterboxd list export keeps order and skips preamble', () => {
  const t = 'Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2024-02-03,Top 10,,u,\n\nPosition,Name,Year,URL,Description\n2,B,2000,u,\n1,A,1999,u,\n';
  assert.ok(isListExport(t));
  assert.deepEqual(parseList(t).map(x => x.title), ['A', 'B']);
});
