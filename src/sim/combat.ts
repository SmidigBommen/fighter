import { Fighter, frameAt, onMoveConnected, takeHit } from './fighter';
import { DEPTH_TOLERANCE } from './types';
import type { Box, SimEvent } from './types';

interface Span {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A feet-relative box in world coordinates, taking facing and scale into account. */
export function worldBox(f: Fighter, box: Box): Span {
  const a = f.x + f.facing * box.x0 * f.scale;
  const b = f.x + f.facing * box.x1 * f.scale;
  return { x0: Math.min(a, b), x1: Math.max(a, b), z0: f.z + box.z0 * f.scale, z1: f.z + box.z1 * f.scale };
}

export function activeHitbox(f: Fighter): Box | undefined {
  if (!f.move || (f.state !== 'attack' && f.state !== 'jump')) return undefined;
  return frameAt(f.move, f.moveTick)?.hit;
}

export function boxesOverlap(a: Span, b: Span): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
}

export interface HitResult {
  attacker: Fighter;
  target: Fighter;
  damage: number;
}

/**
 * Tests every active hitbox against every opposing hurtbox and applies the hits.
 * A move hits each target at most once.
 */
export function resolveHits(fighters: Fighter[], events: SimEvent[]): HitResult[] {
  const results: HitResult[] = [];
  for (const a of fighters) {
    const box = activeHitbox(a);
    if (!box) continue;
    const move = a.move!;
    const hit = worldBox(a, box);
    for (const t of fighters) {
      if (t.team === a.team || !t.hittable || a.moveHits.has(t.id)) continue;
      if (Math.abs(t.y - a.y) > DEPTH_TOLERANCE) continue;
      const hurt = worldBox(t, t.def.hurtbox);
      if (!boxesOverlap(hit, hurt)) continue;

      a.moveHits.add(t.id);
      const damage = Math.round(move.damage * (a.variant?.damage ?? 1));
      const knockdown = move.knockdown || (a.variant?.heavy ?? false);
      t.hp = Math.max(0, t.hp - damage);
      const heavy = knockdown || t.hp <= 0;
      const stop = heavy ? Math.max(move.hitstop, 7) : move.hitstop;
      a.hitstop = stop;
      t.hitstop = stop;
      onMoveConnected(a);
      takeHit(t, a.facing, move.knockback, move.hitstun, knockdown);
      events.push({
        type: 'hit',
        x: Math.max(hit.x0, hurt.x0) / 2 + Math.min(hit.x1, hurt.x1) / 2,
        y: t.y,
        z: Math.max(hit.z0, hurt.z0) / 2 + Math.min(hit.z1, hurt.z1) / 2,
        heavy,
        targetId: t.id,
        byPlayer: a.team === 'player',
      });
      results.push({ attacker: a, target: t, damage });
    }
  }
  return results;
}
