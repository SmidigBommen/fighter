import type { AiState, Fighter } from './fighter';
import { SHOCKWAVE } from './objects';
import { VIEW_W } from './types';
import type { Intent, VariantDef } from './types';
import type { World } from './world';

const STANDOFF = 78;
const ATTACK_REACH = 27;
/** Distance from the player at which throwers and chargers line up, and the range they fire in. */
const LINEUP = 140;
const LINEUP_MIN = 70;
const LINEUP_MAX = 250;
const SCREEN_MARGIN = 14;

/** Keeps a spot far enough inside the screen that an enemy standing on it is in play. */
function inView(w: World, x: number): number {
  return Math.min(w.camX + VIEW_W - SCREEN_MARGIN, Math.max(w.camX + SCREEN_MARGIN, x));
}

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

/** A slam pattern begins only this close to the player: along the street, and in depth. */
const SLAM_RANGE = { x: 80, y: 3 };
/** Where a slammer walks to when a slam is due: this far from the player, in the player's lane. */
const SLAM_SPOT = 50;
/** Ticks from the last impact of a pattern to the earliest next wind-up: base and random extra. */
const SLAM_REST = { base: 200, extra: 100 };
/** Ticks from an impact to the second slam of a pattern, and to the charge: base and random extra. */
const SLAM_GAP = { slam: 16, slamExtra: 20, charge: 16, chargeExtra: 8 };
/** Ticks a slammer may spend walking into the player's lane before it gives up the charge. */
const CHARGE_PATIENCE = 45;

/** The directions of the shockwaves of the slam this fighter is landing. */
export function slamDirs(f: Fighter): (1 | -1)[] {
  return f.ai?.slam?.both ? [-1, 1] : [f.facing];
}

/**
 * The slam patterns of a boss, by health: one slam with a wave ahead; two slams with waves
 * both ways; one such slam and then a charge. Returns nothing while no pattern is due or
 * running, and the boss then behaves like any other.
 */
function slamThink(e: Fighter, w: World, ai: AiState, slam: NonNullable<VariantDef['slam']>): Intent | undefined {
  const s = (ai.slam ??= { cooldown: 120 + w.rng.int(90), stage: 'idle', both: false, at: 0, until: 0 });
  const p = w.player;
  if (s.cooldown > 0) s.cooldown--;
  const face: 1 | -1 = e.x < p.x ? 1 : -1;
  const hold: Intent = { mx: 0, my: 0, attack: false, jump: false, face };

  const begin = (): Intent => {
    s.stage = 'slam';
    const gap = s.next === 'slam' ? SLAM_GAP.slam + w.rng.int(SLAM_GAP.slamExtra) : SLAM_GAP.charge + w.rng.int(SLAM_GAP.chargeExtra);
    s.at = w.tick + SHOCKWAVE.windup + gap;
    s.until = s.at + CHARGE_PATIENCE;
    s.cooldown = SHOCKWAVE.windup + SLAM_REST.base + w.rng.int(SLAM_REST.extra);
    w.tokens.delete(e.id);
    ai.mode = 'recover';
    ai.timer = 30 + w.rng.int(40);
    // A move takes its facing from the direction pressed as it starts.
    return { mx: face, my: 0, attack: true, jump: false, move: slam.move };
  };

  if (s.stage === 'slam') {
    if (e.state === 'attack' && e.move?.id === slam.move) return hold;
    s.stage = s.next ? 'gap' : 'idle';
  }
  if (s.stage === 'gap') {
    if (!e.canAct || e.hitstop > 0) {
      // Hit between two parts: the rest of the pattern is dropped.
      s.stage = 'idle';
      return undefined;
    }
    if (w.tick < s.at) return hold;
    if (s.next === 'slam') {
      s.next = undefined;
      return begin();
    }
    s.stage = 'idle';
    if (!p.hittable || w.tick > s.until) return undefined;
    if (Math.abs(p.y - e.y) > 4) {
      s.stage = 'gap';
      return { ...hold, my: Math.sign(p.y - e.y) * 1.2 };
    }
    return { mx: face, my: 0, attack: true, jump: false, move: slam.charge };
  }

  if (s.cooldown > 0 || !e.canAct || e.hitstop > 0) return undefined;
  if (!p.alive || (!p.hittable && p.state !== 'jump')) return undefined;
  // A slam is due: go and stand near the player, in their lane.
  w.tokens.delete(e.id);
  if (ai.mode !== 'recover') ai.mode = 'circle';
  if (Math.abs(p.x - e.x) > SLAM_RANGE.x || Math.abs(p.y - e.y) > SLAM_RANGE.y) {
    return { ...steer(e, inView(w, p.x - face * SLAM_SPOT), p.y, 1.3), face };
  }
  const phase = e.hp > 0.66 * e.maxHp ? 1 : e.hp > 0.33 * e.maxHp ? 2 : 3;
  s.both = phase > 1;
  s.next = phase === 2 ? 'slam' : phase === 3 ? 'charge' : undefined;
  return begin();
}

/**
 * Enemy behaviour. An enemy circles at a distance until it gets one of the
 * attack tokens, walks in, punches once, then backs off and returns the token.
 * Variants with a ranged or charge move sometimes spend the token on that instead:
 * they walk to a spot level with the player and let fly from there.
 */
export function think(e: Fighter, w: World): Intent {
  const ai = (e.ai ??= { mode: 'circle', timer: 20 + w.rng.int(60), offY: w.rng.range(-28, 28), wind: 0, patience: 0 });
  const p = w.player;
  const idle: Intent = { mx: 0, my: 0, attack: false, jump: false };

  if (e.variant?.slam) {
    const intent = slamThink(e, w, ai, e.variant.slam);
    if (intent) return intent;
  }

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
  const v = e.variant;
  // Bosses think twice as fast below half health.
  const haste = v?.boss && e.hp < e.maxHp / 2 ? 2 : 1;

  if (!p.hittable && p.state !== 'jump') {
    // Player is down or invulnerable: give the token back and keep distance.
    w.tokens.delete(e.id);
    if (ai.mode === 'engage' || ai.mode === 'lineup') ai.mode = 'circle';
  }

  let intent: Intent;
  switch (ai.mode) {
    case 'recover': {
      intent = steer(e, inView(w, p.x + side * (STANDOFF + 20)), p.y + ai.offY, 0.8);
      if ((ai.timer -= haste) <= 0) {
        w.tokens.delete(e.id);
        ai.mode = 'circle';
        ai.timer = 30 + w.rng.int(70);
        ai.offY = w.rng.range(-30, 30);
      }
      break;
    }
    case 'circle': {
      // Hurry while far away, stroll once at standoff distance.
      intent = steer(e, inView(w, p.x + side * STANDOFF), p.y + ai.offY, Math.abs(p.x - e.x) > STANDOFF + 50 ? 1.3 : 0.75);
      if ((ai.timer -= haste) <= 0) {
        if (p.hittable && w.tokens.size < w.maxTokens) {
          w.tokens.add(e.id);
          const far = [v?.ranged, v?.charge].filter((m): m is string => !!m);
          if (far.length > 0 && w.rng.next() < 0.65) {
            ai.mode = 'lineup';
            ai.move = far[w.rng.int(far.length)];
            // Stand on the side with more room, so the spot is on screen.
            ai.side = p.x - w.camX > VIEW_W / 2 ? -1 : 1;
            ai.patience = 200;
          } else {
            ai.mode = 'engage';
            ai.wind = 6 + w.rng.int(14);
            ai.patience = 240;
          }
        } else {
          ai.timer = 20 + w.rng.int(50);
          ai.offY = w.rng.range(-30, 30);
        }
      }
      break;
    }
    case 'engage': {
      // With the player against the screen edge there is no room on that side: go round.
      const reach = ATTACK_REACH * e.scale;
      const near = p.x + side * reach;
      const tx = near === inView(w, near) ? near : p.x - side * reach;
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
    case 'lineup': {
      const tx = inView(w, p.x + ai.side! * LINEUP);
      intent = steer(e, tx, p.y, 1);
      const gap = Math.abs(p.x - e.x);
      const onScreen = e.x > w.camX + 8 && e.x < w.camX + VIEW_W - 8;
      if (onScreen && Math.abs(p.y - e.y) <= 4 && gap >= LINEUP_MIN && gap <= LINEUP_MAX) {
        intent.mx = 0;
        intent.my = 0;
        intent.attack = true;
        intent.move = ai.move;
        ai.mode = 'recover';
        ai.timer = 70 + w.rng.int(60);
      } else if (--ai.patience <= 0) {
        w.tokens.delete(e.id);
        ai.mode = 'circle';
        ai.timer = 30 + w.rng.int(40);
      }
      break;
    }
  }
  intent.face = face;
  return intent;
}
