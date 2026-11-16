// Minimal static server for local play-testing: serves game/ at :8080.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  const clean = (req.url || '/').split('?')[0];
  const path = clean === '/' ? '/index.html' : clean;
  try {
    const data = await readFile(join(here, 'game', path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
server.listen(8080, () => console.log('SALTLINE at http://localhost:8080'));
