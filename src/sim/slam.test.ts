import { describe, expect, it } from 'vitest';
import { chars, variants } from '../data/characters';
import { stage5 } from '../data/stage5';
import { stages } from '../data/stages';
import { Fighter, moveLength } from './fighter';
import { SHOCKWAVE } from './objects';
import { DEPTH_TOLERANCE } from './types';
import type { Intent, SimEvent, StageDef } from './types';
import { World } from './world';

const arena: StageDef = {
  ...stage5,
  time: 999,
  props: [],
  breakables: [],
  playerStart: { x: 120, y: 170 },
  waves: [{ camX: 0, spawns: [{ variant: 'overseer', side: 1, y: 170, delay: 0 }] }],
};
const empty: StageDef = { ...arena, waves: [] };
const idle: Intent = { mx: 0, my: 0, attack: false, jump: false };
const jump: Intent = { ...idle, jump: true };

function slamming(b: Fighter): boolean {
  return b.state === 'attack' && b.move?.id === 'slam';
}

/** A fight against a player who stands still and is healed every step. */
function fight(seed: number, health: number) {
  const w = new World(arena, seed, { score: 0, lives: 0, hp: 100 });
  w.step(idle);
  w.step(idle);
  const boss = w.enemies.find((e) => e.variant?.id === 'overseer')!;
  boss.hp = Math.round(boss.maxHp * health);
  /** Steps until the predicate holds. Returns false if it never does. */
  const until = (done: () => boolean, limit = 900, input: Intent = idle) => {
    for (let i = 0; i < limit; i++) {
      w.step(input);
      w.player.hp = 100;
      if (done()) return true;
    }
    return false;
  };
  return { w, boss, until };
}

describe('shockwave', () => {
  it('knocks down a standing player in its lane, once', () => {
    const w = new World({ ...empty, playerStart: { x: 260, y: 164 } }, 1);
    const p = w.player;
    w.spawnShockwave(200, 160, 1);
    const hits: SimEvent[] = [];
    for (let i = 0; i < 4; i++) {
      w.step(idle);
      hits.push(...w.events.filter((e) => e.type === 'hit'));
      expect(w.shockwaves).toHaveLength(i < 3 ? 1 : 0);
    }
    expect(p.hp).toBe(p.maxHp - SHOCKWAVE.damage);
    expect(p.state).toBe('fall');
    expect(hits).toEqual([expect.objectContaining({ heavy: true, targetId: p.id, byPlayer: false })]);
  });

  it('moves 30 px per tick and is gone after 4 ticks', () => {
    const w = new World(empty, 1);
    const s = w.spawnShockwave(200, 160, -1);
    w.step(idle);
    expect(s).toMatchObject({ x: 170, age: 1 });
    w.step(idle);
    w.step(idle);
    expect(w.shockwaves).toEqual([expect.objectContaining({ x: 110, age: 3 })]);
    w.step(idle);
    expect(w.shockwaves).toHaveLength(0);
  });

  it.each([
    ['beyond its reach', 345, 160],
    ['behind it', 185, 160],
    ['in another lane', 260, 160 + DEPTH_TOLERANCE + 4],
  ])('misses a player %s', (_name, x, y) => {
    const w = new World({ ...empty, playerStart: { x, y } }, 1);
    w.spawnShockwave(200, 160, 1);
    for (let i = 0; i < 6; i++) w.step(idle);
    expect(w.player.hp).toBe(w.player.maxHp);
    expect(w.player.state).toBe('idle');
  });

  it('passes under a player who jumped', () => {
    const w = new World({ ...empty, playerStart: { x: 260, y: 160 } }, 1);
    w.step(jump);
    w.step(idle);
    w.step(idle);
    expect(w.player.z).toBeGreaterThanOrEqual(SHOCKWAVE.height);
    w.spawnShockwave(200, 160, 1);
    for (let i = 0; i < 6; i++) w.step(idle);
    expect(w.player.hp).toBe(w.player.maxHp);
  });

  it('never hits enemies', () => {
    const w = new World({ ...empty, playerStart: { x: 20, y: 110 } }, 1);
    const punk = w.spawnEnemy('punk', 260, 160);
    w.spawnShockwave(200, 160, 1);
    for (let i = 0; i < 6; i++) w.step(idle);
    expect(punk.hp).toBe(punk.maxHp);
    expect(punk.state).not.toBe('fall');
  });
});

describe('the slam', () => {
  it('leaps on the spot for 30 ticks, cannot be hit, and lands with a slam event and a wave', () => {
    const { w, boss, until } = fight(3, 0.9);
    expect(until(() => slamming(boss))).toBe(true);
    const start = w.tick;
    const { x, y, facing } = boss;
    expect(boss.moveTick).toBe(0);
    expect(facing).toBe(Math.sign(w.player.x - x));
    expect(Math.abs(x - w.player.x)).toBeLessThanOrEqual(90);
    expect(Math.abs(y - w.player.y)).toBeLessThanOrEqual(4);
    for (let k = 1; k < SHOCKWAVE.windup; k++) {
      w.step(idle);
      expect(boss.moveTick).toBe(k);
      expect(boss.hittable).toBe(false);
      expect([boss.x, boss.y]).toEqual([x, y]);
      if (k >= 10 && k <= 25) expect(boss.z).toBeGreaterThan(0);
      expect(w.shockwaves).toHaveLength(0);
    }
    w.step(idle);
    expect(w.tick).toBe(start + SHOCKWAVE.windup);
    expect(boss.z).toBe(0);
    expect(w.events).toContainEqual({ type: 'slam', id: boss.id, x, y });
    expect(w.shockwaves).toEqual([expect.objectContaining({ x: x + facing * SHOCKWAVE.speed, y, dir: facing, age: 1 })]);
    for (let i = 0; i < 3; i++) w.step(idle);
    expect(w.shockwaves).toHaveLength(0);
    expect(w.player.state).toBe('fall');
  });

  it('a jump on the first wind-up tick clears the wave', () => {
    for (const health of [0.9, 0.5, 0.2]) {
      const { w, boss, until } = fight(5, health);
      expect(until(() => slamming(boss))).toBe(true);
      const hits: SimEvent[] = [];
      for (let k = 1; k <= 34; k++) {
        w.step(k === 1 ? jump : idle);
        hits.push(...w.events.filter((e) => e.type === 'hit'));
      }
      expect(hits).toEqual([]);
      expect(w.player.hp).toBe(100);
    }
  });

  it('waits at least 120 ticks after an impact before the next pattern', () => {
    const { w, boss, until } = fight(2, 0.9);
    let last = -Infinity;
    for (let n = 0; n < 4; n++) {
      expect(until(() => slamming(boss) && boss.moveTick === 0)).toBe(true);
      expect(w.tick - last).toBeGreaterThanOrEqual(120);
      last = w.tick + SHOCKWAVE.windup;
    }
  });
});

describe('slam patterns by health', () => {
  /** The first pattern of a fight: when each slam began, the waves of each, and whether a charge followed. */
  function pattern(health: number, input: Intent = idle) {
    const { w, boss, until } = fight(4, health);
    const starts: number[] = [];
    const waves: number[][] = [];
    let charge = -1;
    until(() => {
      if (slamming(boss) && boss.moveTick === 0) starts.push(w.tick);
      if (w.events.some((e) => e.type === 'slam')) waves.push(w.shockwaves.map((s) => s.dir));
      if (boss.move?.id === 'slam_charge' && charge < 0) charge = w.tick;
      return starts.length > 0 && w.tick > starts[0] + 150;
    });
    return { w, boss, starts, waves, charge };
  }

  it('above two thirds: one slam, one wave ahead', () => {
    const { boss, starts, waves, charge } = pattern(0.9);
    expect(starts).toHaveLength(1);
    expect(waves).toEqual([[boss.facing]]);
    expect(charge).toBe(-1);
  });

  it('between one and two thirds: two slams, waves both ways', () => {
    const { starts, waves, charge } = pattern(0.5);
    expect(starts).toHaveLength(2);
    expect(waves).toEqual([[-1, 1], [-1, 1]]);
    const gap = starts[1] - (starts[0] + SHOCKWAVE.windup);
    expect(gap).toBeGreaterThanOrEqual(10);
    expect(gap).toBeLessThanOrEqual(40);
    expect(charge).toBe(-1);
  });

  it('below one third: one slam with waves both ways, then a charge at a player who dodged', () => {
    const { w, boss, until } = fight(4, 0.2);
    expect(until(() => slamming(boss))).toBe(true);
    const start = w.tick;
    w.step(jump);
    expect(until(() => boss.move?.id === 'slam_charge', 150)).toBe(true);
    expect(w.tick - (start + SHOCKWAVE.windup)).toBeLessThanOrEqual(90);
    expect(boss.facing).toBe(Math.sign(w.player.x - boss.x));
    expect(Math.abs(boss.y - w.player.y)).toBeLessThanOrEqual(DEPTH_TOLERANCE);
  });

  it('below one third: no charge at a player the wave knocked down', () => {
    const { starts, waves, charge } = pattern(0.2);
    expect(starts).toHaveLength(1);
    expect(waves).toEqual([[-1, 1]]);
    expect(charge).toBe(-1);
  });
});

describe('stage 5 data', () => {
  it('is the last stage and ends with the Overseer alone', () => {
    expect(stages).toHaveLength(5);
    expect(stages[4]).toBe(stage5);
    const last = stage5.waves[stage5.waves.length - 1];
    expect(last.spawns.map((s) => s.variant)).toEqual(['overseer']);
    expect(last.hazards).toBeUndefined();
    for (const wave of stage5.waves.slice(0, -1)) {
      for (const s of wave.spawns) expect(variants[s.variant].boss).toBeFalsy();
    }
  });

  it('the slam move lands at the end of the wind-up and the charge has a tell', () => {
    const { slam, slam_charge: charge } = chars.punk.moves;
    expect(slam.slamAt).toBe(SHOCKWAVE.windup);
    expect(slam.invuln).toBe(true);
    expect(moveLength(slam)).toBeGreaterThanOrEqual(40);
    expect(moveLength(slam)).toBeLessThanOrEqual(60);
    expect(charge.lunge!.from).toBeGreaterThanOrEqual(20);
    expect(charge.frames[0].hit).toBeUndefined();
    expect(charge.frames[0].ticks).toBeGreaterThanOrEqual(20);
  });
});
