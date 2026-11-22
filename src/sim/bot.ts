import type { Intent } from './types';
import type { World } from './world';

/**
 * A simple player: walks to the nearest enemy, lines up in depth and presses attack,
 * jumps rolling barrels, and walks right when the screen is clear.
 * Used by the tests to prove every stage can be finished, and by the smoke test.
 */
export function botIntent(w: World): Intent {
  const p = w.player;
  const intent: Intent = { mx: 0, my: 0, attack: false, jump: false };
  const barrel = w.projectiles.find(
    (b) => b.kind === 'barrel' && Math.abs(b.y - p.y) < 10 && Math.abs(b.x - p.x) < 46 && Math.sign(p.x - b.x) === Math.sign(b.vx),
  );
  if (barrel) {
    intent.jump = true;
    return intent;
  }
  const targets = w.enemies.filter((e) => e.alive);
  const standing = targets.filter((e) => e.hittable);
  const e = (standing.length ? standing : targets).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
  if (!e) {
    intent.mx = 1;
    intent.run = true;
    // Walk round barrels in the lane rather than push against them.
    if (w.breakables.some((b) => !b.broken && Math.abs(b.y - p.y) < 8 && b.x > p.x && b.x - p.x < 30)) intent.attack = w.tick % 12 === 0;
    return intent;
  }
  const side = p.x <= e.x ? -1 : 1;
  const tx = e.x + side * 28;
  if (Math.abs(tx - p.x) > 4) intent.mx = Math.sign(tx - p.x);
  if (Math.abs(e.y - p.y) > 2) intent.my = Math.sign(e.y - p.y);
  if (Math.abs(e.x - p.x) < 40 && Math.abs(e.y - p.y) < 7 && e.hittable) {
    intent.mx = Math.sign(e.x - p.x);
    intent.attack = w.tick % 6 === 0;
  }
  return intent;
}
