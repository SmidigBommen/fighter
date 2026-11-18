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
}

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
}

export interface Spawn {
  variant: string;
  /** -1 enters from the left screen edge, 1 from the right. */
  side: -1 | 1;
  y: number;
  /** Ticks after the wave starts. */
  delay: number;
}

export interface Wave {
  /** Camera x at which the screen locks and the wave starts. */
  camX: number;
  spawns: Spawn[];
}

export interface StageDef {
  id: string;
  width: number;
  /** Walkable depth band (screen y of the feet). */
  bandTop: number;
  bandBottom: number;
  playerStart: { x: number; y: number };
  waves: Wave[];
  props: { key: string; x: number; y: number }[];
  /** Barrels. drop is 'food' or 'points'; none means empty. */
  breakables: { x: number; y: number; drop?: 'food' | 'points' }[];
}

export interface Intent {
  mx: number;
  my: number;
  /** Pressed this tick (edge, not held). */
  attack: boolean;
  jump: boolean;
  /** Forces facing, used by AI to keep looking at the target. */
  face?: 1 | -1;
}

export type SimEvent =
  | { type: 'hit'; x: number; y: number; z: number; heavy: boolean; targetId: number; byPlayer: boolean }
  /** A knocked-down fighter hits the ground twice: the impact, then a small bounce (second: true). */
  | { type: 'land'; x: number; y: number; second: boolean }
  | { type: 'ko'; id: number }
  | { type: 'break'; x: number; y: number }
  | { type: 'pickup'; kind: 'food' | 'points'; x: number; y: number }
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
