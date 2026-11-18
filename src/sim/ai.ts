import type { Fighter } from './fighter';
import { MAX_ATTACK_TOKENS } from './types';
import type { Intent } from './types';
import type { World } from './world';

const STANDOFF = 78;
const ATTACK_REACH = 27;

function steer(f: Fighter, tx: number, ty: number, speed: number): Intent {
  const dx = tx - f.x;
  const dy = ty - f.y;
  return {
    mx: Math.abs(dx) > 2 ? Math.sign(dx) * speed : 0,
    my: Math.abs(dy) > 1.5 ? Math.sign(dy) * speed : 0,
    attack: false,
    jump: false,
  };
}

/**
 * Enemy behaviour. An enemy circles at a distance until it gets one of the
 * attack tokens, walks in, punches once, then backs off and returns the token.
 */
export function think(e: Fighter, w: World): Intent {
  const ai = (e.ai ??= { mode: 'circle', timer: 20 + w.rng.int(60), offY: w.rng.range(-28, 28), wind: 0, patience: 0 });
  const p = w.player;
  const idle: Intent = { mx: 0, my: 0, attack: false, jump: false };

  if (!e.canAct) {
    if (e.state !== 'attack') {
      w.tokens.delete(e.id);
      ai.mode = 'recover';
      ai.timer = 30 + w.rng.int(40);
    }
    return idle;
  }

  const side = e.x < p.x ? -1 : 1;
  const face: 1 | -1 = side === -1 ? 1 : -1;

  if (!p.hittable && p.state !== 'jump') {
    // Player is down or invulnerable: give the token back and keep distance.
    w.tokens.delete(e.id);
    if (ai.mode === 'engage') ai.mode = 'circle';
  }

  let intent: Intent;
  switch (ai.mode) {
    case 'recover': {
      intent = steer(e, p.x + side * (STANDOFF + 20), p.y + ai.offY, 0.8);
      if (--ai.timer <= 0) {
        w.tokens.delete(e.id);
        ai.mode = 'circle';
        ai.timer = 30 + w.rng.int(70);
        ai.offY = w.rng.range(-30, 30);
      }
      break;
    }
    case 'circle': {
      // Hurry while far away, stroll once at standoff distance.
      intent = steer(e, p.x + side * STANDOFF, p.y + ai.offY, Math.abs(p.x - e.x) > STANDOFF + 50 ? 1.3 : 0.75);
      if (--ai.timer <= 0) {
        if (p.hittable && w.tokens.size < MAX_ATTACK_TOKENS) {
          w.tokens.add(e.id);
          ai.mode = 'engage';
          ai.wind = 6 + w.rng.int(14);
          ai.patience = 240;
        } else {
          ai.timer = 20 + w.rng.int(50);
          ai.offY = w.rng.range(-30, 30);
        }
      }
      break;
    }
    case 'engage': {
      const tx = p.x + side * ATTACK_REACH * e.scale;
      intent = steer(e, tx, p.y, 1);
      const inRange = Math.abs(tx - e.x) <= 5 && Math.abs(p.y - e.y) <= 4;
      if (inRange) {
        intent.mx = 0;
        intent.my = 0;
        if (--ai.wind <= 0) {
          intent.attack = true;
          ai.mode = 'recover';
          ai.timer = 50 + w.rng.int(60);
        }
      } else if (--ai.patience <= 0) {
        w.tokens.delete(e.id);
        ai.mode = 'circle';
        ai.timer = 40 + w.rng.int(40);
      }
      break;
    }
  }
  intent.face = face;
  return intent;
}
