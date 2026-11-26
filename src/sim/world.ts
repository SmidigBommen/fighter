import { chars, variants } from '../data/characters';
import { slamDirs, think } from './ai';
import { activeHitbox, boxesOverlap, resolveHits, worldBox } from './combat';
import { Fighter, NEUTRAL, onMoveConnected, takeHit, updateFighter } from './fighter';
import { BARREL, BOTTLE, PICKUPS, PICKUP_LIFE, PICKUP_REACH, PROJECTILES, ROLLING_BARREL, SHOCKWAVE } from './objects';
import type { Breakable, Pickup, PickupKind, Projectile, Shockwave } from './objects';
import { DEPTH_TOLERANCE, EXTRA_LIFE_EVERY, GRAVITY, MAX_ATTACK_TOKENS, START_LIVES, TICK_RATE, VIEW_W } from './types';
import type { Hazard, Intent, ProjectileKind, SimEvent, Spawn, StageDef } from './types';

/** Small seeded generator so a run is reproducible in tests. */
export class Rng {
  constructor(private s: number) {}
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
}

export type Status = 'playing' | 'gameover' | 'cleared';

const CAMERA_SPEED = 2.5;
const EDGE = 10;
/** Ticks without a hit before the combo count ends. */
const COMBO_GAP = 150;
/** Seconds on the clock after losing a life to the time limit. */
const TIMEOUT_REFILL = 60;

/** What a run brings into a stage from the one before. */
export interface Carry {
  score: number;
  lives: number;
  hp: number;
}

/** Hit points are multiplied by this, growing with the combo count: x1 up to x5. */
export function comboMultiplier(combo: number): number {
  return 1 + Math.min(4, Math.floor(combo / 5));
}

export class World {
  tick = 0;
  readonly rng: Rng;
  readonly fighters: Fighter[] = [];
  readonly player: Fighter;
  breakables: Breakable[] = [];
  pickups: Pickup[] = [];
  projectiles: Projectile[] = [];
  /** Slam shockwaves in flight. */
  shockwaves: Shockwave[] = [];
  /** Events of the last step, for the view (sound, sparks, shake). */
  events: SimEvent[] = [];
  /** Ids of the enemies currently allowed to attack. */
  readonly tokens = new Set<number>();
  camX = 0;
  waveIndex = 0;
  locked = false;
  private waveTick = 0;
  private pending: Spawn[] = [];
  private hazards: Hazard[] = [];
  score = 0;
  lives = START_LIVES;
  status: Status = 'playing';
  /** Player hits in a row without taking one, and the best such run this stage. */
  combo = 0;
  maxCombo = 0;
  private comboTimer = 0;
  /** Ticks left on the stage clock. */
  timeLeft: number;
  readonly maxTokens: number;
  private nextLifeAt = EXTRA_LIFE_EVERY;
  /** The enemy the player hit last, for the HUD. */
  lastTarget?: Fighter;
  private nextId = 1;

  constructor(
    readonly stage: StageDef,
    seed = 1,
    carry?: Carry,
  ) {
    this.rng = new Rng(seed);
    this.timeLeft = stage.time * TICK_RATE;
    this.maxTokens = stage.tokens ?? MAX_ATTACK_TOKENS;
    this.player = new Fighter(this.nextId++, 'player', chars.player);
    if (carry) {
      this.score = carry.score;
      this.lives = carry.lives;
      this.player.hp = Math.max(1, Math.min(this.player.maxHp, carry.hp));
      while (this.nextLifeAt <= this.score) this.nextLifeAt += EXTRA_LIFE_EVERY;
    }
    this.player.x = stage.playerStart.x;
    this.player.y = stage.playerStart.y;
    this.fighters.push(this.player);
    for (const b of stage.breakables) this.addBreakable(b.x, b.y, b.drop);
  }

  addBreakable(x: number, y: number, drop?: PickupKind): Breakable {
    const b: Breakable = { id: this.nextId++, x, y, drop, broken: false, timer: 0 };
    this.breakables.push(b);
    return b;
  }

  /** Seconds left on the clock, rounded up. */
  get seconds(): number {
    return Math.ceil(this.timeLeft / TICK_RATE);
  }

  /** Bonus points paid when the stage is cleared. */
  tally(): { time: number; health: number } {
    return { time: this.seconds * 50, health: Math.round(this.player.hp) * 30 };
  }

  /** Adds points and awards the lives that come with them. */
  addScore(amount: number): void {
    this.score += amount;
    while (this.score >= this.nextLifeAt) {
      this.nextLifeAt += EXTRA_LIFE_EVERY;
      this.lives++;
      this.events.push({ type: 'extralife' });
    }
  }

  get enemies(): Fighter[] {
    return this.fighters.filter((f) => f.team === 'enemy');
  }

  /** True while the player may walk on to the next lock point. */
  get go(): boolean {
    return this.status === 'playing' && !this.locked && this.waveIndex > 0 && this.camX < this.cameraLimit - 2;
  }

  private get cameraLimit(): number {
    const wave = this.stage.waves[this.waveIndex];
    return wave ? wave.camX : this.stage.width - VIEW_W;
  }

  spawnEnemy(variantId: string, x: number, y: number): Fighter {
    const v = variants[variantId];
    const e = new Fighter(this.nextId++, 'enemy', chars[v.char], v);
    e.x = x;
    e.y = y;
    e.facing = x > this.player.x ? -1 : 1;
    this.fighters.push(e);
    if (v.boss) this.events.push({ type: 'boss', name: v.name });
    return e;
  }

  spawnProjectile(kind: ProjectileKind, x: number, y: number, z: number, vx: number, vz: number, team: Projectile['team'], damage: number, knockdown: boolean): Projectile {
    const pr: Projectile = { id: this.nextId++, kind, team, x, y, z, vx, vz, damage, knockdown, age: 0 };
    this.projectiles.push(pr);
    return pr;
  }

  spawnShockwave(x: number, y: number, dir: 1 | -1): Shockwave {
    const s: Shockwave = { id: this.nextId++, x, y, dir, age: 0 };
    this.shockwaves.push(s);
    return s;
  }

  step(input: Intent): void {
    this.events = [];
    if (this.status !== 'playing') return;
    this.tick++;

    this.updateClock();

    for (const f of this.fighters) {
      f.intent = f.team === 'player' ? input : think(f, this);
      updateFighter(f, this.events);
      this.clamp(f);
    }
    for (const e of this.events) {
      if (e.type === 'throw') this.release(e.id, e.kind);
      else if (e.type === 'slam') this.slam(e.id, e.x, e.y);
    }
    this.updateShockwaves();

    if (this.combo > 0 && --this.comboTimer <= 0) this.combo = 0;
    for (const hit of resolveHits(this.fighters, this.events)) {
      if (hit.attacker.team === 'player') {
        this.countHit();
        this.addScore(hit.damage * 10 * comboMultiplier(this.combo));
        this.lastTarget = hit.target;
      } else {
        this.combo = 0;
      }
    }

    for (const e of this.events) if (e.type === 'ko') this.onKo(e.id);

    for (let i = this.fighters.length - 1; i >= 0; i--) {
      const f = this.fighters[i];
      if (f.team === 'enemy' && f.state === 'dead' && f.timer <= 0) {
        const points = f.variant?.score ?? 0;
        this.addScore(points);
        this.events.push({ type: 'score', amount: points, x: f.x, y: f.y, z: 30 });
        this.tokens.delete(f.id);
        if (this.lastTarget === f) this.lastTarget = undefined;
        this.fighters.splice(i, 1);
      }
    }

    this.updateProjectiles();
    this.updateObjects();
    this.updatePlayerLife();
    this.updateWave();
    this.updateCamera();
  }

  /** When the last boss on screen goes down, the rest of the wave goes with it. */
  private onKo(id: number): void {
    const boss = this.fighters.find((f) => f.id === id);
    if (!boss?.variant?.boss || this.enemies.some((f) => f !== boss && f.variant?.boss && f.hp > 0)) return;
    this.pending = [];
    this.projectiles = this.projectiles.filter((pr) => pr.kind !== 'bottle');
    for (const f of this.enemies) {
      if (f.hp <= 0) continue;
      f.hp = 0;
      if (f.state !== 'fall') takeHit(f, f.x < boss.x ? -1 : 1, 2.6, 0, true);
    }
  }

  private countHit(): void {
    this.combo++;
    this.comboTimer = COMBO_GAP;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  /** The clock runs while the player is on their feet. At zero it costs a life. */
  private updateClock(): void {
    const p = this.player;
    if (this.timeLeft <= 0 || !p.alive) return;
    if (--this.timeLeft > 0) return;
    this.events.push({ type: 'timeout' });
    p.hp = 0;
    p.invuln = 0;
    if (p.state !== 'fall') takeHit(p, p.facing === 1 ? -1 : 1, 2.2, 0, true);
  }

  /** A fighter's move reached a throw tick: the bottle leaves the hand. */
  private release(id: number, kind: ProjectileKind): void {
    const f = this.fighters.find((x) => x.id === id);
    if (!f) return;
    const damage = Math.round(BOTTLE.damage * (f.variant?.damage ?? 1));
    this.spawnProjectile(kind, f.x + f.facing * 18 * f.scale, f.y, 30 * f.scale, f.facing * BOTTLE.speed, BOTTLE.vz, f.team, damage, f.variant?.heavy ?? false);
  }

  /** A slam landed: the waves start at the feet. */
  private slam(id: number, x: number, y: number): void {
    const f = this.fighters.find((o) => o.id === id);
    if (f) for (const dir of slamDirs(f)) this.spawnShockwave(x, y, dir);
  }

  /** Each wave sweeps one step along its lane and knocks the player down if it passes under them. */
  private updateShockwaves(): void {
    const p = this.player;
    this.shockwaves = this.shockwaves.filter((s) => {
      const from = s.x;
      s.x += s.dir * SHOCKWAVE.speed;
      s.age++;
      const reach = Math.min(from, s.x) <= p.x + p.def.hurtbox.x1 && Math.max(from, s.x) >= p.x + p.def.hurtbox.x0;
      if (!s.spent && p.hittable && Math.abs(p.y - s.y) <= DEPTH_TOLERANCE && p.z < SHOCKWAVE.height && reach) {
        s.spent = true;
        p.hp = Math.max(0, p.hp - SHOCKWAVE.damage);
        p.hitstop = 5;
        takeHit(p, s.dir, SHOCKWAVE.knockback, 0, true);
        this.combo = 0;
        this.events.push({ type: 'hit', x: p.x, y: p.y, z: 6, heavy: true, targetId: p.id, byPlayer: false });
      }
      return s.age < SHOCKWAVE.life;
    });
  }

  private updateProjectiles(): void {
    const p = this.player;
    const box = activeHitbox(p);
    const swing = box && worldBox(p, box);
    this.projectiles = this.projectiles.filter((pr) => {
      const def = PROJECTILES[pr.kind];
      pr.age++;
      pr.x += pr.vx;
      if (def.gravity > 0) {
        pr.z += pr.vz;
        pr.vz -= def.gravity;
        if (pr.z <= 0) {
          this.events.push({ type: 'shatter', x: pr.x, y: pr.y, z: 0 });
          return false;
        }
      }
      const span = { x0: pr.x - def.halfW, x1: pr.x + def.halfW, z0: pr.z, z1: pr.z + def.height };

      // The player can knock it out of the air or smash it.
      if (swing && pr.team !== 'player' && Math.abs(pr.y - p.y) <= DEPTH_TOLERANCE && boxesOverlap(swing, span)) {
        p.hitstop = 3;
        this.addScore(def.score);
        this.events.push({ type: 'hit', x: pr.x, y: pr.y, z: pr.z + def.height / 2, heavy: false, targetId: pr.id, byPlayer: true });
        this.events.push({ type: 'score', amount: def.score, x: pr.x, y: pr.y, z: pr.z + 20 });
        this.events.push(pr.kind === 'barrel' ? { type: 'break', x: pr.x, y: pr.y } : { type: 'shatter', x: pr.x, y: pr.y, z: pr.z });
        return false;
      }

      for (const f of this.fighters) {
        if (!f.hittable || f.team === pr.team || Math.abs(f.y - pr.y) > DEPTH_TOLERANCE) continue;
        const hurt = worldBox(f, f.def.hurtbox);
        if (!boxesOverlap(span, hurt)) continue;
        f.hp = Math.max(0, f.hp - pr.damage);
        f.hitstop = 5;
        takeHit(f, pr.vx < 0 ? -1 : 1, BOTTLE.knockback, BOTTLE.hitstun, pr.knockdown);
        if (f === p) this.combo = 0;
        this.events.push({ type: 'hit', x: pr.x, y: f.y, z: Math.max(pr.z, f.z) + 24, heavy: pr.knockdown, targetId: f.id, byPlayer: false });
        this.events.push(pr.kind === 'barrel' ? { type: 'break', x: pr.x, y: pr.y } : { type: 'shatter', x: pr.x, y: pr.y, z: pr.z });
        return false;
      }
      return pr.x > this.camX - 120 && pr.x < this.camX + VIEW_W + 120;
    });
  }

  private clamp(f: Fighter): void {
    const s = this.stage;
    this.blockByBarrels(f);
    f.y = Math.min(s.bandBottom, Math.max(s.bandTop, f.y));
    if (f.team === 'player') {
      f.x = Math.min(this.camX + VIEW_W - EDGE, Math.max(this.camX + EDGE, f.x));
    } else {
      // Enemies walk in from beyond the edges. Once on screen they stay there, so none can hide.
      const lo = this.camX + EDGE;
      const hi = this.camX + VIEW_W - EDGE;
      if (f.x >= lo && f.x <= hi) f.entered = true;
      const m = f.entered ? EDGE : -50;
      f.x = Math.min(this.camX + VIEW_W - m, Math.max(this.camX + m, f.x));
    }
  }

  /** Barrels block walking. A blocked fighter also slides sideways, so nobody gets stuck. */
  private blockByBarrels(f: Fighter): void {
    if (f.z > 16 || f.state === 'fall') return;
    for (const b of this.breakables) {
      if (b.broken) continue;
      const dx = f.x - b.x;
      const dy = f.y - b.y;
      const px = BARREL.blockX - Math.abs(dx);
      const py = BARREL.blockY - Math.abs(dy);
      if (px <= 0 || py <= 0) continue;
      if (px < py) {
        f.x += (dx < 0 ? -1 : 1) * px;
        f.y += (dy < 0 ? -1 : 1) * 0.4;
      } else {
        f.y += (dy < 0 ? -1 : 1) * py;
      }
    }
  }

  private updateObjects(): void {
    const p = this.player;
    const box = activeHitbox(p);
    if (box) {
      const hit = worldBox(p, box);
      for (const b of this.breakables) {
        if (b.broken || p.moveHits.has(b.id) || Math.abs(b.y - p.y) > DEPTH_TOLERANCE) continue;
        if (!boxesOverlap(hit, { x0: b.x - BARREL.halfW, x1: b.x + BARREL.halfW, z0: 0, z1: BARREL.height })) continue;
        p.moveHits.add(b.id);
        p.hitstop = p.move!.hitstop;
        onMoveConnected(p);
        b.broken = true;
        b.timer = BARREL.wreckTicks;
        this.addScore(BARREL.score);
        this.events.push({ type: 'hit', x: b.x, y: b.y, z: 20, heavy: false, targetId: b.id, byPlayer: true });
        this.events.push({ type: 'break', x: b.x, y: b.y });
        if (b.drop) this.pickups.push({ id: this.nextId++, kind: b.drop, x: b.x, y: b.y, z: 14, vz: 3.2, age: 0 });
      }
    }
    this.breakables = this.breakables.filter((b) => !b.broken || --b.timer > 0);

    this.pickups = this.pickups.filter((k) => {
      k.age++;
      if (k.z > 0 || k.vz > 0) {
        k.z += k.vz;
        k.vz -= GRAVITY;
        if (k.z <= 0) {
          k.z = 0;
          k.vz = 0;
        }
        return true;
      }
      const near = Math.abs(p.x - k.x) <= PICKUP_REACH.x && Math.abs(p.y - k.y) <= PICKUP_REACH.y;
      if (near && p.alive && p.z < 10) {
        const def = PICKUPS[k.kind];
        p.hp = Math.min(p.maxHp, p.hp + def.heal);
        this.lives += def.lives;
        this.addScore(def.score);
        if (def.score) this.events.push({ type: 'score', amount: def.score, x: k.x, y: k.y, z: 20 });
        this.events.push({ type: 'pickup', kind: k.kind, x: k.x, y: k.y });
        return false;
      }
      return k.age < PICKUP_LIFE;
    });
  }

  private updatePlayerLife(): void {
    const p = this.player;
    if (p.state !== 'dead' || p.timer > 0) return;
    if (this.lives > 0) {
      this.lives--;
      p.hp = p.maxHp;
      p.invuln = 150;
      if (this.timeLeft <= 0) this.timeLeft = TIMEOUT_REFILL * TICK_RATE;
      p.setState('getup', 16);
    } else {
      this.status = 'gameover';
    }
  }

  private updateWave(): void {
    const wave = this.stage.waves[this.waveIndex];
    if (!this.locked) {
      if (wave && this.camX >= wave.camX) {
        this.locked = true;
        this.waveTick = 0;
        this.pending = [...wave.spawns];
        this.hazards = (wave.hazards ?? []).map((h) => ({ ...h }));
        this.events.push({ type: 'wave', index: this.waveIndex });
      }
      return;
    }
    this.waveTick++;
    // If the screen is empty, bring the next spawn forward instead of making the player wait.
    let early = this.enemies.length === 0;
    this.pending = this.pending.filter((s) => {
      if (s.delay > this.waveTick && !early) return true;
      early = false;
      this.spawnEnemy(s.variant, s.side > 0 ? this.camX + VIEW_W + 30 : this.camX - 30, s.y);
      return false;
    });
    for (const h of this.hazards) {
      if (h.delay > this.waveTick) continue;
      const y = h.y ?? this.player.y;
      this.spawnProjectile('barrel', h.side > 0 ? this.camX + VIEW_W + 30 : this.camX - 30, y, 0, -h.side * ROLLING_BARREL.speed, 0, 'none', ROLLING_BARREL.damage, true);
      h.delay = h.every ? h.delay + h.every : Infinity;
    }
    if (this.pending.length === 0 && this.enemies.length === 0) {
      this.locked = false;
      this.hazards = [];
      this.waveIndex++;
      if (this.waveIndex >= this.stage.waves.length) this.status = 'cleared';
      else this.events.push({ type: 'unlock' });
    }
  }

  private updateCamera(): void {
    const target = this.player.x - VIEW_W * 0.4;
    if (target > this.camX) this.camX = Math.min(this.camX + CAMERA_SPEED, target);
    this.camX = Math.max(0, Math.min(this.camX, this.cameraLimit));
  }
}

export { NEUTRAL };
