#!/usr/bin/env node
// Production server: the built game from dist/ plus the score table on /api/scores.
//   node server/server.mjs
// Environment: PORT (default 80), SCORES_FILE (default /data/scores.json), STATIC_DIR (default dist).
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { createScoreHandler } from './scores.mjs';

const root = resolve(process.env.STATIC_DIR ?? 'dist');
const port = Number(process.env.PORT ?? 80);
const scores = createScoreHandler(process.env.SCORES_FILE ?? '/data/scores.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    if (await scores(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, normalize(path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    const stat = statSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      // Vite puts content-hashed bundles in /assets/, so they never change under the same name.
      // Sprites, audio and index.html keep their names between deploys, so the browser must revalidate.
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(port, () => console.log(`listening on ${port}, serving ${root}`));

// As process 1 in a container, Node ignores these unless told what to do with them.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
