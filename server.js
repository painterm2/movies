// Tiny static file server so ES modules load over http (file:// blocks them).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const port = process.env.PORT || 5173;

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
  if (!/^\/(index\.html|styles\.css|src\/[\w-]+\.js)$/.test(rel.replace(/\\/g, '/'))) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': types[extname(rel)] || 'text/plain' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Kinora running at http://localhost:${port}`));
