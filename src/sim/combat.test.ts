import { describe, expect, it } from 'vitest';
import { stage1 } from '../data/stage1';
import { DEPTH_TOLERANCE, MAX_ATTACK_TOKENS, VIEW_W } from './types';
import type { Intent, StageDef } from './types';
import { World } from './world';

const arena: StageDef = { ...stage1, waves: [], breakables: [], playerStart: { x: 200, y: 160 } };
const idle: Intent = { mx: 0, my: 0, attack: false, jump: false };
const attack: Intent = { ...idle, attack: true };

/** A world with one enemy that never acts on its own (AI output is overwritten by hitstun-free dummy hp). */
function duel(dx = 26, dy = 0) {
  const w = new World(arena, 7);
  const dummy = w.spawnEnemy('bruiser', 200 + dx, 160 + dy);
  dummy.ai = { mode: 'recover', timer: 1e9, offY: dy, wind: 0, patience: 0 };
  dummy.x = 200 + dx;
  return { w, p: w.player, dummy };
}

function run(w: World, ticks: number, input: Intent = idle) {
  for (let i = 0; i < ticks; i++) w.step(input);
}

/** Press attack once, then idle until the predicate holds or the limit passes. */
function pressUntil(w: World, done: () => boolean, limit = 60) {
  w.step(attack);
  for (let i = 0; i < limit && !done(); i++) w.step(idle);
}

describe('hit resolution', () => {
  it('a jab in range damages the target once', () => {
    const { w, p, dummy } = duel();
    dummy.intent = idle;
    const x0 = dummy.x;
    w.step(attack);
    // freeze the dummy in place for the test: recover mode walks away slowly, so check quickly
    run(w, 8);
    expect(dummy.hp).toBe(dummy.maxHp - 6);
    expect(dummy.state).toBe('hurt');
    expect(dummy.x).toBeGreaterThanOrEqual(x0 - 1);
    run(w, 30);
    expect(dummy.hp).toBe(dummy.maxHp - 6);
    expect(p.state).toBe('idle');
  });

  it('misses a target outside the depth tolerance', () => {
    const { w, dummy } = duel(26, DEPTH_TOLERANCE + 3);
    w.step(attack);
    run(w, 6);
    expect(dummy.hp).toBe(dummy.maxHp);
  });

  it('hits a target just inside the depth tolerance', () => {
    const { w, dummy } = duel(26, DEPTH_TOLERANCE - 2);
    w.step(attack);
    run(w, 6);
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
  });

  it('misses a target behind the attacker', () => {
    const { w, dummy } = duel(-26);
    w.step(attack);
    run(w, 6);
    expect(dummy.hp).toBe(dummy.maxHp);
  });

  it('freezes both fighters for the hitstop', () => {
    const { w, p, dummy } = duel();
    w.step(attack);
    while (dummy.hp === dummy.maxHp) w.step(idle);
    expect(p.hitstop).toBe(4);
    expect(dummy.hitstop).toBe(4);
    const tick = p.moveTick;
    run(w, 4);
    expect(p.moveTick).toBe(tick);
    run(w, 1);
    expect(p.moveTick).toBe(tick + 1);
  });
});

describe('combo chain', () => {
  it('steps jab, jab, punch, kick and the kick knocks down', () => {
    const { w, p, dummy } = duel();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const hp = dummy.hp;
      dummy.x = p.x + 26;
      pressUntil(w, () => dummy.hp < hp);
      seen.push(p.move!.id);
      run(w, 6);
    }
    expect(seen).toEqual(['jab', 'jab', 'punch', 'kick']);
    expect(dummy.state).toBe('fall');
  });

  it('a whiffed attack restarts the chain at the jab', () => {
    const { w, p, dummy } = duel();
    pressUntil(w, () => dummy.hp < dummy.maxHp);
    dummy.x = p.x + 200;
    run(w, 14);
    w.step(attack);
    run(w, 3);
    expect(p.move!.id).toBe('jab');
    run(w, 20);
    w.step(attack);
    expect(p.move!.id).toBe('jab');
  });

  it('knocked-down enemies cannot be hit until they stand', () => {
    const { w, p, dummy } = duel();
    dummy.hp = 200;
    for (let i = 0; i < 4; i++) {
      const hp = dummy.hp;
      dummy.x = p.x + 26;
      pressUntil(w, () => dummy.hp < hp);
      run(w, 6);
    }
    const hp = dummy.hp;
    while (dummy.state === 'fall') w.step(idle);
    expect(dummy.state).toBe('down');
    dummy.x = p.x + 26;
    pressUntil(w, () => false, 20);
    expect(dummy.hp).toBe(hp);
  });
});

describe('jumping', () => {
  it('returns to the ground and a jump kick knocks down', () => {
    const { w, p, dummy } = duel(40);
    w.step({ ...idle, mx: 1, jump: true });
    expect(p.state).toBe('jump');
    run(w, 10);
    expect(p.z).toBeGreaterThan(20);
    w.step({ ...idle, attack: true });
    run(w, 40);
    expect(p.z).toBe(0);
    expect(p.state).toBe('idle');
    expect(dummy.hp).toBe(dummy.maxHp - 12);
    expect(['fall', 'down', 'getup']).toContain(dummy.state);
  });
});

describe('enemies and stage flow', () => {
  it('never lets more than two enemies hold an attack token', () => {
    const w = new World(arena, 3);
    for (let i = 0; i < 6; i++) w.spawnEnemy('punk', 60 + i * 60, 120 + i * 18);
    let max = 0;
    let attackers = 0;
    for (let i = 0; i < 1500; i++) {
      w.step(idle);
      w.player.hp = 100;
      max = Math.max(max, w.tokens.size);
      attackers = Math.max(attackers, w.enemies.filter((e) => e.state === 'attack').length);
    }
    expect(max).toBe(MAX_ATTACK_TOKENS);
    expect(attackers).toBeGreaterThan(0);
    expect(attackers).toBeLessThanOrEqual(MAX_ATTACK_TOKENS);
  });

  it('an idle player is beaten and the game ends after the last life', () => {
    const w = new World(stage1, 5);
    for (let i = 0; i < 400; i++) w.step({ ...idle, mx: 1 });
    expect(w.locked).toBe(true);
    for (let i = 0; i < 60 * 240 && w.status === 'playing'; i++) w.step(idle);
    expect(w.status).toBe('gameover');
    expect(w.lives).toBe(0);
  });

  it('locks the camera for a wave and unlocks when it is cleared', () => {
    const w = new World(stage1, 5);
    for (let i = 0; i < 400; i++) w.step({ ...idle, mx: 1 });
    expect(w.locked).toBe(true);
    expect(w.camX).toBe(stage1.waves[0].camX);
    expect(w.player.x).toBeLessThanOrEqual(w.camX + VIEW_W);
    for (let guard = 0; w.locked && guard < 2000; guard++) {
      for (const e of w.enemies) if (e.alive && e.state !== 'fall') { e.hp = 0; e.vz = 3; e.bounced = true; e.setState('fall'); }
      w.step(idle);
    }
    expect(w.locked).toBe(false);
    expect(w.waveIndex).toBe(1);
    expect(w.go).toBe(true);
    for (let i = 0; i < 400; i++) w.step({ ...idle, mx: 1 });
    expect(w.waveIndex).toBe(1);
    expect(w.locked).toBe(true);
    expect(w.camX).toBe(stage1.waves[1].camX);
  });
});

describe('barrels and pickups', () => {
  it('a hit breaks a barrel, which drops its pickup and counts for the combo', () => {
    const w = new World(arena, 1);
    const b = w.addBreakable(226, 160, 'food');
    w.step(attack);
    run(w, 6);
    expect(b.broken).toBe(true);
    expect(w.pickups.map((k) => k.kind)).toEqual(['food']);
    expect(w.score).toBe(100);
    expect(w.player.comboStep).toBe(1);
    run(w, 200);
    expect(w.breakables).toHaveLength(0);
  });

  it('a barrel in another lane is not hit', () => {
    const w = new World(arena, 1);
    const b = w.addBreakable(226, 160 + DEPTH_TOLERANCE + 4);
    w.step(attack);
    run(w, 10);
    expect(b.broken).toBe(false);
  });

  it('walking over food heals up to the maximum, points add score', () => {
    const w = new World(arena, 1);
    w.player.hp = 30;
    w.pickups.push({ id: 900, kind: 'food', x: 240, y: 160, z: 0, vz: 0, age: 0 });
    w.pickups.push({ id: 901, kind: 'points', x: 280, y: 160, z: 0, vz: 0, age: 0 });
    run(w, 80, { ...idle, mx: 1 });
    expect(w.player.hp).toBe(70);
    expect(w.score).toBe(1000);
    expect(w.pickups).toHaveLength(0);
  });

  it('a barrel blocks the lane and the walker slides around it', () => {
    const w = new World(arena, 1);
    w.addBreakable(240, 160);
    const p = w.player;
    run(w, 10, { ...idle, mx: 1 });
    expect(p.x).toBeLessThanOrEqual(225);
    run(w, 120, { ...idle, mx: 1 });
    expect(p.x).toBeGreaterThan(260);
    expect(Math.abs(p.y - 160)).toBeGreaterThanOrEqual(6);
  });
});
