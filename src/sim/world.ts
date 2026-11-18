import { chars, variants } from '../data/characters';
import { think } from './ai';
import { activeHitbox, boxesOverlap, resolveHits, worldBox } from './combat';
import { Fighter, NEUTRAL, onMoveConnected, updateFighter } from './fighter';
import { BARREL, PICKUPS, PICKUP_LIFE, PICKUP_REACH } from './objects';
import type { Breakable, Pickup, PickupKind } from './objects';
import { DEPTH_TOLERANCE, GRAVITY, VIEW_W } from './types';
import type { Intent, SimEvent, Spawn, StageDef } from './types';

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

export class World {
  tick = 0;
  readonly rng: Rng;
  readonly fighters: Fighter[] = [];
  readonly player: Fighter;
  breakables: Breakable[] = [];
  pickups: Pickup[] = [];
  /** Events of the last step, for the view (sound, sparks, shake). */
  events: SimEvent[] = [];
  /** Ids of the enemies currently allowed to attack. */
  readonly tokens = new Set<number>();
  camX = 0;
  waveIndex = 0;
  locked = false;
  private waveTick = 0;
  private pending: Spawn[] = [];
  score = 0;
  lives = 2;
  status: Status = 'playing';
  /** The enemy the player hit last, for the HUD. */
  lastTarget?: Fighter;
  private nextId = 1;

  constructor(
    readonly stage: StageDef,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
    this.player = new Fighter(this.nextId++, 'player', chars.player);
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
    return e;
  }

  step(input: Intent): void {
    this.events = [];
    if (this.status !== 'playing') return;
    this.tick++;

    for (const f of this.fighters) {
      f.intent = f.team === 'player' ? input : think(f, this);
      updateFighter(f, this.events);
      this.clamp(f);
    }

    for (const hit of resolveHits(this.fighters, this.events)) {
      if (hit.attacker.team === 'player') {
        this.score += hit.damage * 10;
        this.lastTarget = hit.target;
      }
    }

    for (let i = this.fighters.length - 1; i >= 0; i--) {
      const f = this.fighters[i];
      if (f.team === 'enemy' && f.state === 'dead' && f.timer <= 0) {
        this.score += f.variant?.score ?? 0;
        this.tokens.delete(f.id);
        if (this.lastTarget === f) this.lastTarget = undefined;
        this.fighters.splice(i, 1);
      }
    }

    this.updateObjects();
    this.updatePlayerLife();
    this.updateWave();
    this.updateCamera();
  }

  private clamp(f: Fighter): void {
    const s = this.stage;
    this.blockByBarrels(f);
    f.y = Math.min(s.bandBottom, Math.max(s.bandTop, f.y));
    if (f.team === 'player') {
      f.x = Math.min(this.camX + VIEW_W - EDGE, Math.max(this.camX + EDGE, f.x));
    } else {
      // Walking enemies may be off screen (they enter from the edges); knocked-back ones may not.
      const m = f.canAct || f.state === 'attack' ? -50 : EDGE;
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
        this.score += BARREL.score;
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
        this.score += def.score;
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
    if (this.pending.length === 0 && this.enemies.length === 0) {
      this.locked = false;
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
