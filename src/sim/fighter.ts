import { GRAVITY, JUMP_VZ, RUN_SPEED } from './types';
import type { CharDef, Intent, MoveDef, MoveFrame, Pose, SimEvent, VariantDef } from './types';

export type State = 'idle' | 'walk' | 'jump' | 'attack' | 'hurt' | 'fall' | 'down' | 'getup' | 'dead';
export type Team = 'player' | 'enemy';

export interface AiState {
  /** lineup: walking to a spot level with the player to throw or charge from. */
  mode: 'circle' | 'engage' | 'recover' | 'lineup';
  timer: number;
  /** Depth offset from the player while circling. */
  offY: number;
  /** Ticks left before the punch once in range. */
  wind: number;
  /** Ticks left before giving up an engage. */
  patience: number;
  /** lineup: the move to use, and the side of the player to stand on. */
  move?: string;
  side?: 1 | -1;
  /** Variants with a slam: where they are in the slam pattern. */
  slam?: SlamState;
}

export interface SlamState {
  /** Ticks until the next pattern may begin. Runs in every state, so hits do not postpone it. */
  cooldown: number;
  /** idle: between patterns. slam: in the slam move. gap: waiting to start the next part. */
  stage: 'idle' | 'slam' | 'gap';
  /** Shockwaves go both ways instead of only forward. */
  both: boolean;
  /** What follows the current slam in this pattern. */
  next?: 'slam' | 'charge';
  /** World tick at which the next part starts, and the tick at which a charge is given up. */
  at: number;
  until: number;
}

const ATTACK_BUFFER = 10;
const COMBO_WINDOW = 24;
const GETUP_TICKS = 16;

export const NEUTRAL: Intent = { mx: 0, my: 0, attack: false, jump: false };

export class Fighter {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  facing: 1 | -1 = 1;
  state: State = 'idle';
  /** Ticks spent in the current state. */
  stateTick = 0;
  /** Countdown for timed states (hurt, down, getup, dead). */
  timer = 0;
  hp: number;
  maxHp: number;
  hitstop = 0;
  invuln = 0;
  move?: MoveDef;
  moveTick = 0;
  moveHits = new Set<number>();
  moveConnected = false;
  comboStep = 0;
  comboTimer = 0;
  attackBuffer = 0;
  bounced = false;
  /** Enemies: has been on screen. */
  entered = false;
  /** Moving at run speed this tick. */
  running = false;
  /** The current move is a step of the ground chain. */
  inChain = false;
  intent: Intent = NEUTRAL;
  ai?: AiState;
  readonly scale: number;
  readonly speedX: number;
  readonly speedY: number;

  constructor(
    readonly id: number,
    readonly team: Team,
    readonly def: CharDef,
    readonly variant?: VariantDef,
  ) {
    this.maxHp = this.hp = variant?.hp ?? def.hp;
    this.scale = variant?.scale ?? 1;
    this.speedX = def.speedX * (variant?.speed ?? 1);
    this.speedY = def.speedY * (variant?.speed ?? 1);
  }

  /** Can be hit right now. Knocked-down fighters stay safe until they stand. */
  get hittable(): boolean {
    if (this.state === 'attack' && this.move?.invuln) return false;
    return this.invuln === 0 && this.state !== 'fall' && this.state !== 'down' && this.state !== 'getup' && this.state !== 'dead';
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get canAct(): boolean {
    return this.state === 'idle' || this.state === 'walk';
  }

  setState(state: State, timer = 0): void {
    this.state = state;
    this.stateTick = 0;
    this.timer = timer;
  }
}

export function moveLength(move: MoveDef): number {
  return move.frames.reduce((n, f) => n + f.ticks, 0);
}

/** The frame shown at a tick. Air moves hold their last frame. */
export function frameAt(move: MoveDef, tick: number): MoveFrame | undefined {
  let t = tick;
  for (const f of move.frames) {
    if (t < f.ticks) return f;
    t -= f.ticks;
  }
  return move.air ? move.frames[move.frames.length - 1] : undefined;
}

/** Height of a leap at a move tick: a parabola from `from` to `to`, zero outside. */
function leapHeight(leap: NonNullable<MoveDef['leap']>, tick: number): number {
  const t = (tick - leap.from) / (leap.to - leap.from);
  return t <= 0 || t >= 1 ? 0 : 4 * leap.height * t * (1 - t);
}

function startMove(f: Fighter, move: MoveDef): void {
  f.move = move;
  f.moveTick = 0;
  f.moveHits.clear();
  f.moveConnected = false;
  f.attackBuffer = 0;
  f.inChain = false;
}

/** Starts a ground move outside the chain: run attack, special, or an AI choice. */
function startGroundMove(f: Fighter, id: string): void {
  if (f.intent.mx !== 0) f.facing = f.intent.mx > 0 ? 1 : -1;
  startMove(f, f.def.moves[id]);
  f.running = false;
  f.setState('attack');
}

function startGroundAttack(f: Fighter): void {
  if (f.intent.move) return startGroundMove(f, f.intent.move);
  if (f.running && f.def.runAttack) return startGroundMove(f, f.def.runAttack);
  startGroundMove(f, f.def.chain[f.comboStep % f.def.chain.length]);
  f.inChain = true;
}

function endMove(f: Fighter): void {
  if (!f.moveConnected) f.comboStep = 0;
  f.move = undefined;
  f.comboTimer = COMBO_WINDOW;
}

/** Called by hit resolution when this fighter's current move lands. */
export function onMoveConnected(f: Fighter): void {
  if (!f.move || f.moveConnected) return;
  f.moveConnected = true;
  if (f.move.cost) f.hp = Math.max(1, f.hp - f.move.cost);
  if (!f.inChain) return;
  f.comboStep = f.comboStep + 1 >= f.def.chain.length ? 0 : f.comboStep + 1;
}

/** Puts a fighter into hurt or knockdown. dir is the direction the hit travels. */
export function takeHit(f: Fighter, dir: 1 | -1, knockback: number, hitstun: number, knockdown: boolean): void {
  f.move = undefined;
  f.comboStep = 0;
  f.attackBuffer = 0;
  f.running = false;
  f.facing = dir === 1 ? -1 : 1;
  if (knockdown || f.hp <= 0 || f.z > 0) {
    f.vx = dir * Math.max(knockback, 2.2);
    f.vz = 4.2;
    f.bounced = false;
    f.setState('fall');
  } else {
    f.vx = dir * knockback;
    f.setState('hurt', hitstun);
  }
}

export function updateFighter(f: Fighter, events: SimEvent[]): void {
  const input = f.intent;
  if (f.hitstop > 0) {
    f.hitstop--;
    // A press during the freeze still counts, so mashing through a combo drops nothing.
    if (input.attack) f.attackBuffer = ATTACK_BUFFER;
    return;
  }
  if (f.invuln > 0) f.invuln--;
  if (input.attack) f.attackBuffer = ATTACK_BUFFER;
  else if (f.attackBuffer > 0) f.attackBuffer--;
  if (f.state !== 'attack' && f.comboTimer > 0 && --f.comboTimer === 0) f.comboStep = 0;
  f.stateTick++;

  switch (f.state) {
    case 'idle':
    case 'walk': {
      if (input.special && f.def.special) {
        startGroundMove(f, f.def.special);
        events.push({ type: 'special' });
        break;
      }
      if (f.attackBuffer > 0) {
        startGroundAttack(f);
        break;
      }
      const run = input.run && input.mx !== 0 ? RUN_SPEED : 1;
      if (input.jump && f.def.canJump) {
        if (input.mx !== 0) f.facing = input.mx > 0 ? 1 : -1;
        f.vx = input.mx * f.speedX * 1.25 * (run > 1 ? 1.4 : 1);
        f.vz = JUMP_VZ;
        f.running = false;
        f.setState('jump');
        break;
      }
      const len = Math.hypot(input.mx, input.my);
      const k = len > 1 ? 1 / len : 1;
      f.running = run > 1;
      f.x += input.mx * k * f.speedX * run;
      f.y += input.my * k * f.speedY;
      if (input.face) f.facing = input.face;
      else if (input.mx !== 0) f.facing = input.mx > 0 ? 1 : -1;
      const moving = len > 0.01;
      if (moving !== (f.state === 'walk')) f.setState(moving ? 'walk' : 'idle');
      break;
    }
    case 'jump': {
      if (f.attackBuffer > 0 && !f.move) {
        const id = input.my > 0 && f.def.diveKick ? f.def.diveKick : f.def.jumpKick;
        if (id) {
          startMove(f, f.def.moves[id]);
          const dive = f.move!.dive;
          if (dive) {
            f.vx = f.facing * dive.vx;
            f.vz = Math.min(f.vz, dive.vz);
          }
        }
      } else if (f.move) {
        f.moveTick++;
      }
      f.x += f.vx;
      f.z += f.vz;
      f.vz -= GRAVITY;
      if (f.z <= 0) {
        f.z = 0;
        f.vx = 0;
        f.vz = 0;
        if (f.move) endMove(f);
        f.setState('idle');
      }
      break;
    }
    case 'attack': {
      const move = f.move!;
      f.moveTick++;
      if (move.lunge && f.moveTick >= move.lunge.from && f.moveTick < move.lunge.to) f.x += f.facing * move.lunge.speed;
      // A spin shows the kick to both sides in turn.
      if (move.around && f.moveTick % 5 === 0) f.facing = f.facing === 1 ? -1 : 1;
      if (move.throws?.ticks.includes(f.moveTick)) events.push({ type: 'throw', id: f.id, kind: move.throws.kind });
      if (move.leap) f.z = leapHeight(move.leap, f.moveTick);
      if (move.slamAt === f.moveTick) events.push({ type: 'slam', id: f.id, x: f.x, y: f.y });
      const canChain = f.moveConnected && move.cancelFrom !== undefined && f.moveTick >= move.cancelFrom;
      if (input.special && f.def.special && move.id !== f.def.special) {
        // The special also works as a way out of a chain that is going wrong.
        startGroundMove(f, f.def.special);
        events.push({ type: 'special' });
      } else if (f.attackBuffer > 0 && canChain) {
        startGroundAttack(f);
      } else if (f.moveTick >= moveLength(move)) {
        endMove(f);
        f.setState('idle');
      }
      break;
    }
    case 'hurt': {
      f.x += f.vx;
      f.vx *= 0.82;
      if (--f.timer <= 0) {
        f.vx = 0;
        f.setState('idle');
      }
      break;
    }
    case 'fall': {
      f.x += f.vx;
      f.z += f.vz;
      f.vz -= GRAVITY;
      if (f.z <= 0) {
        f.z = 0;
        events.push({ type: 'land', x: f.x, y: f.y, second: f.bounced });
        if (!f.bounced) {
          f.bounced = true;
          f.vz = 2.2;
          f.vx *= 0.5;
        } else {
          f.vx = 0;
          f.vz = 0;
          if (f.hp <= 0) {
            f.setState('dead', 70);
            events.push({ type: 'ko', id: f.id });
          } else {
            f.setState('down', f.team === 'player' ? 36 : 48);
          }
        }
      }
      break;
    }
    case 'down': {
      if (--f.timer <= 0) f.setState('getup', GETUP_TICKS);
      break;
    }
    case 'getup': {
      if (--f.timer <= 0) {
        if (f.team === 'player') f.invuln = 60;
        f.setState('idle');
      }
      break;
    }
    case 'dead': {
      if (f.timer > 0) f.timer--;
      break;
    }
  }
}

/** What the view should draw for this fighter. */
export function poseOf(f: Fighter): Pose {
  const anims = f.def.anims;
  switch (f.state) {
    case 'idle':
      return { anim: 'idle', frame: Math.floor(f.stateTick / 9) % anims.idle };
    case 'walk':
      return { anim: 'walk', frame: Math.floor(f.stateTick / (f.running ? 3 : anims.walk > 6 ? 5 : 9)) % anims.walk };
    case 'jump': {
      if (f.move) return { anim: f.move.anim, frame: frameAt(f.move, f.moveTick)!.frame };
      if (f.stateTick < 4) return { anim: 'jump', frame: 0 };
      if (f.vz > 2) return { anim: 'jump', frame: 1 };
      if (f.vz > -2.5) return { anim: 'jump', frame: 3 };
      return { anim: 'jump', frame: 2 };
    }
    case 'attack': {
      const mf = frameAt(f.move!, f.moveTick) ?? f.move!.frames[f.move!.frames.length - 1];
      return { anim: f.move!.anim, frame: mf.frame };
    }
    case 'hurt':
      return f.def.poses.hurt[f.stateTick < 5 ? 0 : f.def.poses.hurt.length - 1];
    case 'fall': {
      const fall = f.def.poses.fall;
      return fall[Math.min(fall.length - 1, f.bounced ? 2 : f.vz > 0 ? 0 : 1)];
    }
    case 'down':
    case 'dead':
      return f.def.poses.down;
    case 'getup': {
      const getup = f.def.poses.getup;
      return getup[Math.min(getup.length - 1, Math.floor((f.stateTick * getup.length) / GETUP_TICKS))];
    }
  }
}
