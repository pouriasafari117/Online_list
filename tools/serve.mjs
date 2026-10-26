#!/usr/bin/env node
/**
 * tools/serve.mjs — zero-dependency static server for local preview.
 * The site itself needs no build step; this only exists to preview it with
 * the same paths GitHub Pages uses.
 *
 *   node tools/serve.mjs [--port 8080] [--root .]
 *
 * Press "v" + Enter to print the local URLs.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, env, exit } from 'node:process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = Number(portArg >= 0 ? args[portArg + 1] : env.PORT || 8080);
const HOST = env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = path.resolve(ROOT, `.${decoded}`);
  if (!target.startsWith(ROOT)) return null;
  return target;
}

const server = http.createServer((req, res) => {
  let filePath = safeResolve(req.url === '/' ? '/index.html' : req.url);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    // GitHub Pages serves 404.html for unknown paths.
    const notFound = path.join(ROOT, '404.html');
    const body = fs.existsSync(notFound) ? fs.readFileSync(notFound) : Buffer.from('404');
    res.writeHead(404, { 'Content-Type': MIME['.html'] }).end(body);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' || ext === '.json' ? 'no-cache' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff'
  };
  if (ext === '.json' || ext === '.html') headers['Access-Control-Allow-Origin'] = '*';
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Online List — local preview\n`);
  console.log(`  ➜  http://localhost:${PORT}/`);
  console.log(`  ➜  http://localhost:${PORT}/setup/   (one-time token sync)\n`);
  console.log(`  root: ${ROOT}\n  press Ctrl+C to stop\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✖ پورت ${PORT} در حال استفاده است. --port دیگری بدهید.`);
    exit(1);
  }
  throw err;
});
