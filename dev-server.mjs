// Run the whole app on your own computer without Netlify:  npm run dev:local
// Data is saved as plain JSON files in ./.local-data (ignored by git).
// Set APP_PASSCODE first, for example:  APP_PASSCODE=letmein npm run dev:local
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileKV } from './server/kv.mjs';
import { createHandler } from './server/router.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8888);
const dataDir = process.env.DXLVI_LOCAL_DIR || path.join(root, '.local-data');
const handler = createHandler({ kv: fileKV(dataDir), env: { APP_PASSCODE: 'dxlvi-local', ...process.env } });

// Same Content-Security-Policy as netlify.toml, so problems show up locally first.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const r = await handler(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.join(root, 'public', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(path.join(root, 'public'))) { res.writeHead(403).end(); return; }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'content-security-policy': csp });
      res.end(data);
    } catch (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(err.code === 'ENOENT' ? 'Not found' : 'Error');
    }
  })
  .listen(port, () => console.log(`DXLVI running at http://localhost:${port}  (passcode: ${process.env.APP_PASSCODE || 'dxlvi-local'})`));
