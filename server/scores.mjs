// Shared score table: GET and POST on /api/scores, stored in one JSON file.
// Used by the production server (server/server.mjs) and by the Vite dev server (vite.config.ts).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const KEEP = 100;
const SHOWN = 10;
const MAX_SCORE = 9_999_999;
const MAX_STAGE = 99;
const MAX_BODY = 512;
/** Posts allowed per address per minute. */
const RATE = 12;

/** Returns a cleaned entry, or undefined if the body is not a valid score. */
export function parseEntry(body) {
  if (!body || typeof body !== 'object') return undefined;
  const { name, score, stage, cleared } = body;
  if (typeof name !== 'string' || !/^[A-Z0-9 ]{3}$/.test(name)) return undefined;
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return undefined;
  if (!Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE) return undefined;
  return { name, score, stage, cleared: cleared === true };
}

/**
 * Returns handle(req, res): answers requests for /api/scores and resolves to true,
 * resolves to false for any other path.
 */
export function createScoreHandler(file) {
  let entries = [];
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(stored)) entries = stored.map(parseEntry).filter(Boolean);
  } catch {
    // No file yet, or an unreadable one: start with an empty table.
  }
  const posts = new Map();

  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(entries));
    renameSync(`${file}.tmp`, file);
  };

  const allowed = (address) => {
    const now = Date.now();
    const recent = (posts.get(address) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= RATE) return false;
    recent.push(now);
    posts.set(address, recent);
    if (posts.size > 5000) posts.clear();
    return true;
  };

  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  return async function handle(req, res) {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!path.endsWith('/api/scores')) return false;
    if (req.method === 'GET') {
      reply(res, 200, { entries: entries.slice(0, SHOWN) });
      return true;
    }
    if (req.method !== 'POST') {
      reply(res, 405, { error: 'method not allowed' });
      return true;
    }
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (!allowed(forwarded || req.socket.remoteAddress || '')) {
      reply(res, 429, { error: 'too many scores' });
      return true;
    }
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        reply(res, 413, { error: 'too large' });
        return true;
      }
    }
    let entry;
    try {
      entry = parseEntry(JSON.parse(raw));
    } catch {
      entry = undefined;
    }
    if (!entry) {
      reply(res, 400, { error: 'bad score' });
      return true;
    }
    entries.push(entry);
    entries.sort((a, b) => b.score - a.score);
    entries = entries.slice(0, KEEP);
    const rank = entries.indexOf(entry);
    try {
      save();
    } catch (err) {
      console.error(`scores: cannot write ${file}: ${err.message}`);
    }
    reply(res, 200, { entries: entries.slice(0, SHOWN), rank: rank < SHOWN ? rank : -1 });
    return true;
  };
}
