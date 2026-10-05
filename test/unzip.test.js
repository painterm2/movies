import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipText, isLetterboxdTasteFile } from '../src/unzip.js';

test('reads deflated and stored entries, filters by name', async t => {
  let zip;
  try {
    const dir = mkdtempSync(join(tmpdir(), 'zt-'));
    mkdirSync(join(dir, 'lists'));
    writeFileSync(join(dir, 'ratings.csv'), 'Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,Café,2000,u,4\n'.repeat(50));
    writeFileSync(join(dir, 'lists', 'top.csv'), 'x');
    writeFileSync(join(dir, 'reviews.csv'), 'secret');
    execFileSync('zip', ['-qr', '../out.zip', '.'], { cwd: dir });
    zip = readFileSync(join(dir, '..', 'out.zip'));
  } catch { return t.skip('zip CLI unavailable'); }
  const ab = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
  const files = await unzipText(ab, isLetterboxdTasteFile);
  assert.deepEqual(files.map(f => f.name).sort(), ['lists/top.csv', 'ratings.csv']);
  assert.ok(files.find(f => f.name === 'ratings.csv').text.includes('Café'));
});
