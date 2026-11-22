import { describe, expect, it } from 'vitest';
import { stage1 } from '../data/stage1';
import { stages } from '../data/stages';
import { botIntent } from './bot';
import { DEPTH_TOLERANCE, EXTRA_LIFE_EVERY, MAX_ATTACK_TOKENS, START_LIVES, VIEW_W } from './types';
import type { Intent, StageDef } from './types';
import { World, comboMultiplier } from './world';

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

describe('run, special and combo', () => {
  it('running covers more ground than walking', () => {
    const a = new World(arena, 1);
    const b = new World(arena, 1);
    run(a, 30, { ...idle, mx: 1 });
    run(b, 30, { ...idle, mx: 1, run: true });
    expect(b.player.x - 200).toBeGreaterThan((a.player.x - 200) * 1.5);
  });

  it('attack out of a run is a sliding kick that knocks down', () => {
    const { w, p, dummy } = duel(70);
    run(w, 4, { ...idle, mx: 1, run: true });
    w.step({ ...idle, mx: 1, run: true, attack: true });
    expect(p.move!.id).toBe('run_kick');
    run(w, 30);
    expect(dummy.hp).toBe(dummy.maxHp - 13);
    expect(['fall', 'down', 'getup']).toContain(dummy.state);
  });

  it('the special hits both sides, costs health once and cannot be interrupted', () => {
    const { w, p, dummy } = duel(26);
    const behind = w.spawnEnemy('bruiser', 174, 160);
    behind.ai = { mode: 'recover', timer: 1e9, offY: 0, wind: 0, patience: 0 };
    w.step({ ...idle, special: true });
    expect(p.hittable).toBe(false);
    run(w, 40);
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
    expect(behind.hp).toBeLessThan(behind.maxHp);
    expect(dummy.x).toBeGreaterThan(226);
    expect(behind.x).toBeLessThan(174);
    expect(p.hp).toBe(p.maxHp - 8);
  });

  it('hits in a row raise the combo and the multiplier; being hit resets it', () => {
    const { w, p, dummy } = duel();
    dummy.hp = dummy.maxHp = 500;
    // The dummy wakes up once hit. Invulnerability keeps it from hitting back during the count.
    p.invuln = 1e6;
    for (let i = 0; i < 6; i++) {
      const hp = dummy.hp;
      while (dummy.state === 'fall' || dummy.state === 'down' || dummy.state === 'getup') w.step(idle);
      dummy.x = p.x + 26;
      pressUntil(w, () => dummy.hp < hp);
    }
    expect(w.combo).toBe(6);
    expect(comboMultiplier(w.combo)).toBe(2);
    p.invuln = 0;
    dummy.x = p.x + 300;
    w.spawnProjectile('bottle', p.x - 40, p.y, 30, 3, 0, 'enemy', 8, false);
    run(w, 30);
    expect(p.hp).toBe(p.maxHp - 8);
    expect(w.combo).toBe(0);
  });
});

describe('projectiles, clock and lives', () => {
  it('a thrower lines up and its bottle hurts the player', () => {
    const w = new World(arena, 4);
    w.spawnEnemy('thrower', 380, 200);
    let thrown = false;
    for (let i = 0; i < 1500 && w.player.hp === 100; i++) {
      w.step(idle);
      thrown ||= w.projectiles.length > 0;
    }
    expect(thrown).toBe(true);
    expect(w.player.hp).toBeLessThan(100);
  });

  it('a bottle can be knocked out of the air', () => {
    const w = new World(arena, 1);
    w.spawnProjectile('bottle', 260, 160, 34, -3, 0, 'enemy', 8, false);
    w.step(attack);
    run(w, 20);
    expect(w.player.hp).toBe(100);
    expect(w.score).toBe(200);
  });

  it('a rolling barrel knocks down whoever stands in its lane and can be jumped', () => {
    const w = new World(arena, 1);
    const enemy = w.spawnEnemy('punk', 120, 160);
    enemy.ai = { mode: 'recover', timer: 1e9, offY: 0, wind: 0, patience: 0 };
    w.spawnProjectile('barrel', 300, 160, 0, -2.3, 0, 'none', 12, true);
    for (let i = 0; i < 200; i++) {
      const b = w.projectiles[0];
      w.step({ ...idle, jump: !!b && b.x - w.player.x < 40 && b.x > w.player.x });
    }
    expect(w.player.hp).toBe(100);
    expect(enemy.hp).toBe(enemy.maxHp - 12);
  });

  it('a charging enemy rushes across the screen', () => {
    const w = new World(arena, 2);
    const e = w.spawnEnemy('rusher', 380, 160);
    let charged = false;
    for (let i = 0; i < 2000 && !charged; i++) {
      w.step(idle);
      w.player.hp = 100;
      charged = e.move?.id === 'punk_charge';
    }
    expect(charged).toBe(true);
    const x0 = e.x;
    while (e.move?.id === 'punk_charge') w.step({ ...idle, my: -1 });
    expect(Math.abs(e.x - x0)).toBeGreaterThan(100);
  });

  it('running out of time costs a life and refills the clock', () => {
    const w = new World({ ...arena, time: 2 }, 1);
    run(w, 121);
    expect(w.player.hp).toBe(0);
    run(w, 300);
    expect(w.lives).toBe(START_LIVES - 1);
    expect(w.player.hp).toBe(100);
    expect(w.seconds).toBeGreaterThan(50);
  });

  it('passing the score threshold awards a life', () => {
    const w = new World(arena, 1, { score: EXTRA_LIFE_EVERY - 100, lives: 1, hp: 60 });
    expect(w.player.hp).toBe(60);
    w.addScore(200);
    expect(w.lives).toBe(2);
    w.addScore(200);
    expect(w.lives).toBe(2);
  });
});

describe('every stage can be finished', () => {
  for (const stage of stages) {
    it(`${stage.id}: the bot reaches the end without getting stuck`, () => {
      const w = new World(stage, 11);
      let deaths = 0;
      let lives = w.lives;
      let i = 0;
      for (; i < 60 * 60 * 12 && w.status === 'playing'; i++) {
        w.step(botIntent(w));
        if (w.lives < lives) deaths++;
        // The bot is not good enough to be graded: it gets unlimited lives and time.
        lives = w.lives = 5;
        w.timeLeft = Math.max(w.timeLeft, 600);
      }
      console.log(`${stage.id}: ${Math.round(i / 60)} s, ${deaths} lives lost, score ${w.score}, best combo ${w.maxCombo}`);
      expect(w.status).toBe('cleared');
    });
  }
});

describe('bosses', () => {
  it('when the boss goes down the rest of the wave goes with it', () => {
    const w = new World(arena, 1);
    const boss = w.spawnEnemy('boss', 300, 160);
    const other = w.spawnEnemy('punk', 100, 200);
    boss.hp = 0;
    boss.vz = 3;
    boss.bounced = true;
    boss.setState('fall');
    run(w, 200);
    expect(other.hp).toBe(0);
    expect(w.enemies).toHaveLength(0);
    expect(w.score).toBe(5000 + 500);
  });
});

describe('screen edges', () => {
  it('enemies come on screen even when the player stands against the edge they enter from', () => {
    const w = new World({ ...arena, playerStart: { x: VIEW_W - 10, y: 160 } }, 6);
    const enemies = [w.spawnEnemy('punk', VIEW_W + 30, 150), w.spawnEnemy('bruiser', VIEW_W + 30, 190)];
    for (let i = 0; i < 600; i++) {
      w.step({ ...idle, mx: 1 });
      w.player.hp = 100;
    }
    for (const e of enemies) {
      expect(e.entered).toBe(true);
      expect(e.x).toBeLessThanOrEqual(w.camX + VIEW_W - 10);
    }
  });
});
