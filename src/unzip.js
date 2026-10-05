// Minimal zip reader using the browser's built-in DecompressionStream (no dependencies).
// Reads the central directory, so it handles zips whose local headers omit sizes.
const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns [{ name, text }] for every non-directory entry accepted by `filter(name)`.
export async function unzipText(buffer, filter = () => true) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer instanceof ArrayBuffer ? buffer : bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid zip file.');
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const dec = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (u32(view, p) !== 0x02014b50) throw new Error('Corrupt zip directory.');
    const method = u16(view, p + 10), compSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28), extraLen = u16(view, p + 30), commentLen = u16(view, p + 32);
    const local = u32(view, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || !filter(name)) continue;
    const start = local + 30 + u16(view, local + 26) + u16(view, local + 28);
    const raw = bytes.subarray(start, start + compSize);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported zip compression in ${name}.`);
    out.push({ name, text: dec.decode(method === 0 ? raw : await inflateRaw(raw)) });
  }
  return out;
}

// Which files in a Letterboxd export are useful taste data (skips reviews, comments, likes, deleted…).
export const isLetterboxdTasteFile = name =>
  /^(ratings|watched|diary)\.csv$/.test(name) || /^lists\/[^/]+\.csv$/.test(name);
