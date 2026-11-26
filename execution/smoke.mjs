#!/usr/bin/env node
// Smoke test: start the dev server first (pnpm dev), then run
//   node execution/smoke.mjs [--url http://localhost:5173] [--out dir] [--seconds 8]
// Opens the game in headless Chromium and goes through all of it: intro, title, every stage
// (a bot plays each for --seconds, then the remaining enemies are knocked out through the
// dev-only window.world), the bonus tally, ending, name entry, score table, and the
// game over and continue screens. Saves screenshots. Exit code 1 on any page error or failed check.
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('usage: node execution/smoke.mjs [--url URL] [--out DIR] [--seconds N]\nNeeds a running dev server and a Chromium in ~/.cache/ms-playwright.\nAdds one entry named BOT to the score table of that server.');
  process.exit(0);
}
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const url = opt('--url', 'http://localhost:5173');
const out = opt('--out', 'smoke-out');
const seconds = Number(opt('--seconds', '8'));
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
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

let shots = 0;
const shot = (name) => page.screenshot({ path: join(out, `${String(++shots).padStart(2, '0')}-${name}.png`) });
const tap = async (key, gap = 150) => { await page.keyboard.press(key, { delay: 40 }); await page.waitForTimeout(gap); };
const scene = () => page.evaluate(() => window.game.scene.getScenes(true).map((s) => s.scene.key).join(','));
const check = (ok, what) => { if (!ok) errors.push(`check failed: ${what}`); };
const waitScene = async (key, ms = 15000) => {
  for (let t = 0; t < ms; t += 100) {
    if ((await scene()) === key) return true;
    await page.waitForTimeout(100);
  }
  check(false, `scene ${key} not reached, at ${await scene()}`);
  return false;
};
const read = () => page.evaluate(() => {
  const w = window.world;
  const p = w.player;
  const es = w.enemies.filter((e) => e.state !== 'dead').map((e) => ({ x: e.x, y: e.y }));
  return { x: p.x, y: p.y, score: w.score, status: w.status, wave: w.waveIndex, stage: w.stage.id, es };
});
const held = new Set();
const set = async (key, on) => {
  if (on && !held.has(key)) { held.add(key); await page.keyboard.down(key); }
  if (!on && held.has(key)) { held.delete(key); await page.keyboard.up(key); }
};
const release = async () => { for (const k of [...held]) await set(k, false); };

/** Real key presses: walk to the nearest enemy, line up in depth, attack in range. */
async function botPlays(ms) {
  for (let t = 0; t < ms; t += 50) {
    const s = await read();
    if (s.status !== 'playing') break;
    const e = s.es.sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
    const tx = e ? e.x - Math.sign(e.x - s.x || 1) * 28 : s.x + 100;
    const ty = e ? e.y : s.y;
    await set('ArrowRight', tx - s.x > 4);
    await set('ArrowLeft', tx - s.x < -4);
    await set('ArrowDown', ty - s.y > 3);
    await set('ArrowUp', ty - s.y < -3);
    if (e && Math.abs(e.x - s.x) < 40 && Math.abs(ty - s.y) < 7) await page.keyboard.press(t % 1000 < 100 ? 'c' : 'z');
    await page.waitForTimeout(50);
  }
  await release();
}

/** Runs right and knocks out whatever spawns, until the stage is cleared. The player cannot die. */
async function rushStage(name) {
  await set('Shift', true);
  await set('ArrowRight', true);
  let bossShot = false;
  for (let t = 0; t < 120000; t += 50) {
    const state = await page.evaluate(() => {
      const w = window.world;
      w.player.hp = w.player.maxHp;
      const boss = w.enemies.some((e) => e.variant.boss);
      for (const e of w.enemies) {
        if (e.hp > 0 && e.state !== 'fall') { e.hp = 0; e.vz = 3; e.vx = 2; e.bounced = false; e.setState('fall'); }
        // Knocked-out enemies leave at once, so the next spawn is not held up.
        if (e.state === 'dead') e.timer = Math.min(e.timer, 5);
      }
      return { status: w.status, boss };
    });
    if (state.boss && !bossShot) { bossShot = true; await page.waitForTimeout(400); await shot(`${name}-boss`); }
    if (state.status !== 'playing') break;
    await page.waitForTimeout(50);
  }
  await release();
  check((await read()).status === 'cleared', `${name} cleared`);
}

await page.goto(url);
await waitScene('Intro');
await page.waitForTimeout(1200);
await shot('intro');
await tap('Enter', 300);
await waitScene('Title');
await page.waitForTimeout(500);
await shot('title');
await tap('Enter', 300);
await waitScene('Stage');

const stageCount = await page.evaluate(() => window.game.scene.getScene('Boot') && 5);
for (let n = 1; n <= stageCount; n++) {
  const name = `stage${n}`;
  await page.waitForTimeout(900);
  check((await read()).stage === name, `${name} is running`);
  await shot(`${name}-start`);
  if (n === 1) {
    await tap('p', 400);
    await shot('paused');
    const tick = await page.evaluate(() => window.world.tick);
    await page.waitForTimeout(300);
    check((await page.evaluate(() => window.world.tick)) === tick, 'pause stops the simulation');
    await tap('p', 200);
  }
  await botPlays(seconds * 1000);
  await shot(`${name}-fight`);
  if ((await read()).status === 'playing') await rushStage(name);
  await page.waitForTimeout(4200);
  await shot(`${name}-tally`);
  await tap('z', 300);
  await waitScene(n < stageCount ? 'Stage' : 'Ending');
  if (n < stageCount) {
    for (let t = 0; t < 50 && (await read()).stage === name; t++) await page.waitForTimeout(100);
  }
}

await page.waitForTimeout(6000);
await shot('ending');
await tap('Enter', 600);
await shot('the-end');
await tap('Enter', 300);
await waitScene('NameEntry');
await page.waitForTimeout(400);
for (const k of ['b', 'o', 't']) await tap(k, 120);
await shot('name-entry');
await tap('Enter', 300);
await waitScene('Scores');
await page.waitForTimeout(600);
await shot('scores');
const board = await page.evaluate(() => fetch('api/scores').then((r) => r.json()));
check(board.entries.some((e) => e.name === 'BOT' && e.cleared), 'BOT is on the shared score table');
await tap('Enter', 300);
await waitScene('Title');

// Game over, continue, game over again, then decline.
await page.waitForTimeout(400);
await tap('Enter', 300);
await waitScene('Stage');
const die = async () => {
  await page.waitForTimeout(800);
  await page.evaluate(() => { const w = window.world; w.score += 1234; w.lives = 0; w.timeLeft = 2; });
  await waitScene('GameOver', 20000);
  await page.waitForTimeout(600);
};
await die();
await shot('continue');
await tap('Enter', 300);
await waitScene('Stage');
check((await read()).score === 0, 'continue resets the score');
await die();
await tap('Escape', 300);
await waitScene('NameEntry');
await tap('Enter', 150);
await tap('Enter', 150);
await tap('Enter', 300);
await waitScene('Scores');
await page.waitForTimeout(500);
await shot('scores-after-game-over');

await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`ok, ${shots} screenshots in ${out}/`);
