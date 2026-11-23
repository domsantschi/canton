import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup, contracts, submit, LedgerError } from './ledger.js';

let parties;
const port = 3001;
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const assets = { '/': [path.join(frontend, 'index.html'), 'text/html; charset=utf-8'], '/app.js': [path.join(frontend, 'app.js'), 'text/javascript; charset=utf-8'], '/style.css': [path.join(frontend, 'style.css'), 'text/css; charset=utf-8'] };

function reply(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:3001');
    if (!['localhost:3001', '127.0.0.1:3001'].includes(req.headers.host)) return reply(res, 403, { error: 'Invalid host.' });
    if (req.method === 'GET' && assets[url.pathname]) {
      const [file, type] = assets[url.pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
      return res.end(await readFile(file));
    }
    if (req.method === 'POST' && req.headers.origin !== `http://${req.headers.host}`) return reply(res, 403, { error: 'Same-origin requests only.' });
    if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, { error: 'Expected JSON.' });
    if (req.method === 'POST' && url.pathname === '/api/setup') {
      parties = undefined;
      const result = await setup();
      parties = result.parties;
      return reply(res, 200, result);
    }
    if (!parties) return reply(res, 503, { error: 'Run setup first.' });
    if (req.method === 'GET' && url.pathname === '/api/contracts') return reply(res, 200, await contracts(url.searchParams.get('party'), parties));
    if (req.method === 'POST' && url.pathname === '/api/action') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 20000) throw new LedgerError(413, 'Request too large.');
      }
      let data;
      try { data = JSON.parse(raw); } catch { throw new LedgerError(400, 'Invalid JSON.'); }
      return reply(res, 200, await submit(data.party, parties, data.action, data.input || {}));
    }
    return reply(res, 404, { error: 'Not found.' });
  } catch (error) {
    return reply(res, error.status || 500, { error: error.message, detail: error.detail });
  }
}).listen(port, '127.0.0.1', () => console.log(`LOCAL DEMO ONLY: http://localhost:${port} (LocalNet JSON API: http://localhost:3975)`));
