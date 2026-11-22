/** Box relative to a fighter's feet. x runs forward (facing direction), z runs up. */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface MoveFrame {
  /** Frame index in the move's animation strip. */
  frame: number;
  /** How many simulation ticks this frame is held. */
  ticks: number;
  /** Hitbox while this frame is shown. No box means startup or recovery. */
  hit?: Box;
}

export interface MoveDef {
  id: string;
  anim: string;
  frames: MoveFrame[];
  damage: number;
  /** Ticks both fighters freeze on hit. */
  hitstop: number;
  /** Ticks the target stays in the hurt state. */
  hitstun: number;
  /** Horizontal speed given to the target, px per tick. */
  knockback: number;
  knockdown: boolean;
  /** Earliest tick at which a buffered attack may start the next chain move, if this one connected. */
  cancelFrom?: number;
  /** Air moves: the last frame is held until landing. */
  air?: boolean;
  /** Air moves: velocity set when the move starts (x is multiplied by facing). */
  dive?: { vx: number; vz: number };
  /** Forward speed in px per tick while the move tick is in [from, to). */
  lunge?: { from: number; to: number; speed: number };
  /** Hits on both sides. Targets are knocked away from the attacker. */
  around?: boolean;
  /** The attacker cannot be hit during the move. */
  invuln?: boolean;
  /** Health the attacker pays when the move first connects. It never takes the last point. */
  cost?: number;
  /** Releases a projectile at each of these move ticks. */
  throws?: { ticks: number[]; kind: ProjectileKind };
}

export type ProjectileKind = 'bottle' | 'barrel';
export type PickupKind = 'food' | 'points' | 'feast' | 'life';

export interface Pose {
  anim: string;
  frame: number;
}

export interface CharDef {
  id: string;
  /** Frame count per animation strip. */
  anims: Record<string, number>;
  hurtbox: Box;
  speedX: number;
  speedY: number;
  hp: number;
  moves: Record<string, MoveDef>;
  /** Ground attack chain, by move id. */
  chain: string[];
  jumpKick?: string;
  diveKick?: string;
  /** Ground attack out of a run. */
  runAttack?: string;
  /** Crowd-clearing move on the special button. */
  special?: string;
  canJump: boolean;
  poses: {
    hurt: Pose[];
    /** Launched, dropping, after the bounce. Shorter lists repeat their last pose. */
    fall: Pose[];
    down: Pose;
    /** Played in order over the get-up time. */
    getup: Pose[];
  };
}

export interface VariantDef {
  id: string;
  char: string;
  name: string;
  tint: number;
  scale: number;
  hp: number;
  speed: number;
  damage: number;
  /** Every hit from this variant knocks down. */
  heavy: boolean;
  score: number;
  /** Move thrown from a distance, once lined up with the player. */
  ranged?: string;
  /** Lunging move started from a distance, once lined up with the player. */
  charge?: string;
  /** Shown with a warning and the boss music; gets faster below half health. */
  boss?: boolean;
}

export interface Spawn {
  variant: string;
  /** -1 enters from the left screen edge, 1 from the right. */
  side: -1 | 1;
  y: number;
  /** Ticks after the wave starts. */
  delay: number;
}

/** A barrel that rolls across the screen during a wave and knocks down whoever it meets. */
export interface Hazard {
  kind: 'barrel';
  /** The screen edge it enters from: -1 left, 1 right. */
  side: -1 | 1;
  /** Lane. Left out, it takes the player's lane at the moment it enters. */
  y?: number;
  /** Ticks after the wave starts. */
  delay: number;
  /** Repeats at this interval while the wave lasts. */
  every?: number;
}

export interface Wave {
  /** Camera x at which the screen locks and the wave starts. */
  camX: number;
  spawns: Spawn[];
  hazards?: Hazard[];
}

export interface StageDef {
  /** Also the texture key of the background; the foreground is `${id}_fore`. */
  id: string;
  name: string;
  music: string;
  /** Time limit in seconds. */
  time: number;
  /** Enemies allowed to attack at once. Default MAX_ATTACK_TOKENS. */
  tokens?: number;
  width: number;
  /** Walkable depth band (screen y of the feet). */
  bandTop: number;
  bandBottom: number;
  playerStart: { x: number; y: number };
  waves: Wave[];
  props: { key: string; x: number; y: number }[];
  /** Barrels. No drop means empty. */
  breakables: { x: number; y: number; drop?: PickupKind }[];
}

export interface Intent {
  mx: number;
  my: number;
  /** Pressed this tick (edge, not held). */
  attack: boolean;
  jump: boolean;
  /** Pressed this tick: the special move. */
  special?: boolean;
  /** Held: run instead of walk. */
  run?: boolean;
  /** Forces facing, used by AI to keep looking at the target. */
  face?: 1 | -1;
  /** AI: the move to start on attack instead of the chain. */
  move?: string;
}

export type SimEvent =
  | { type: 'hit'; x: number; y: number; z: number; heavy: boolean; targetId: number; byPlayer: boolean }
  /** A knocked-down fighter hits the ground twice: the impact, then a small bounce (second: true). */
  | { type: 'land'; x: number; y: number; second: boolean }
  | { type: 'ko'; id: number }
  | { type: 'break'; x: number; y: number }
  | { type: 'pickup'; kind: PickupKind; x: number; y: number }
  /** A fighter's move reached a throw tick. */
  | { type: 'throw'; id: number; kind: ProjectileKind }
  | { type: 'shatter'; x: number; y: number; z: number }
  | { type: 'special' }
  /** Points to show floating at a place. */
  | { type: 'score'; amount: number; x: number; y: number; z: number }
  | { type: 'boss'; name: string }
  | { type: 'extralife' }
  | { type: 'timeout' }
  | { type: 'wave'; index: number }
  | { type: 'unlock' };

export const VIEW_W = 426;
export const VIEW_H = 240;
export const TICK_RATE = 60;
/** Attacks only connect when the feet are this close in depth. */
export const DEPTH_TOLERANCE = 8;
export const GRAVITY = 0.32;
export const JUMP_VZ = 5.4;
export const MAX_ATTACK_TOKENS = 2;
export const RUN_SPEED = 1.75;
/** A new life is awarded each time the score passes a multiple of this. */
export const EXTRA_LIFE_EVERY = 100000;
export const START_LIVES = 2;
