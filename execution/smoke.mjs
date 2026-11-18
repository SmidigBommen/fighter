#!/usr/bin/env node
// Smoke test: start the dev server first (pnpm dev), then run
//   node execution/smoke.mjs [--url http://localhost:5173] [--out dir] [--seconds 30]
// Opens the game in headless Chromium, lets a simple bot play,
// saves screenshots and prints console errors. Exit code 1 on any page error.
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('usage: node execution/smoke.mjs [--url URL] [--out DIR] [--seconds N]\nNeeds a running dev server and a Chromium in ~/.cache/ms-playwright.');
  process.exit(0);
}
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const url = opt('--url', 'http://localhost:5173');
const out = opt('--out', 'smoke-out');
mkdirSync(out, { recursive: true });

const cache = join(homedir(), '.cache', 'ms-playwright');
const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
if (!dir) throw new Error(`no chromium in ${cache}`);
const sub = readdirSync(join(cache, dir)).find((d) => d.startsWith('chrome'));
const browser = await chromium.launch({ executablePath: join(cache, dir, sub, 'chrome'), args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 852, height: 480 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const tap = async (key, gap = 150) => { await page.keyboard.press(key, { delay: 30 }); await page.waitForTimeout(gap); };

page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
await page.goto(url);
await page.waitForTimeout(1500);
await shot('1-title');
await tap('Enter', 500);
await tap('h', 50);

// A simple bot: walk to the nearest enemy, line up in depth, attack in range.
const read = () => page.evaluate(() => {
  const w = window.world;
  const p = w.player;
  const es = w.enemies.filter((e) => e.state !== 'dead').map((e) => ({ x: e.x, y: e.y, state: e.state }));
  return { x: p.x, y: p.y, score: w.score, status: w.status, go: w.go, wave: w.waveIndex, es };
});
const held = new Set();
const set = async (key, on) => {
  if (on && !held.has(key)) { held.add(key); await page.keyboard.down(key); }
  if (!on && held.has(key)) { held.delete(key); await page.keyboard.up(key); }
};
const seconds = Number(opt('--seconds', '30'));
let shots = 0, lastScore = 0, s;
for (let t = 0; t < seconds * 20; t++) {
  s = await read();
  if (s.status !== 'playing') break;
  const e = s.es.sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
  const tx = e ? e.x - Math.sign(e.x - s.x || 1) * 28 : s.x + 100;
  const ty = e ? e.y : s.y;
  await set('ArrowRight', tx - s.x > 4);
  await set('ArrowLeft', tx - s.x < -4);
  await set('ArrowDown', ty - s.y > 3);
  await set('ArrowUp', ty - s.y < -3);
  if (e && Math.abs(e.x - s.x) < 40 && Math.abs(ty - s.y) < 7) await page.keyboard.press('z');
  if (s.score !== lastScore && shots < 6 && t % 7 === 0) { lastScore = s.score; await shot(`hit-${++shots}`); }
  if (t === 100) await shot('2-early');
  await page.waitForTimeout(50);
}
await shot('9-end');
const state = await page.evaluate(() => {
  const w = window.world;
  return w && { tick: w.tick, status: w.status, score: w.score, hp: w.player.hp, lives: w.lives, camX: w.camX, wave: w.waveIndex, locked: w.locked, enemies: w.enemies.map((e) => [e.variant.id, e.state, Math.round(e.x), Math.round(e.y), e.hp]) };
});
console.log(JSON.stringify(state));
await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`ok, screenshots in ${out}/`);
