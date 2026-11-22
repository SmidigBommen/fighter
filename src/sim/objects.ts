import type { PickupKind, ProjectileKind } from './types';

export type { PickupKind };

/** What a pickup gives. Order matches the frames in assets/game/pickups.png. */
export const PICKUPS: Record<PickupKind, { frame: number; heal: number; score: number; lives: number }> = {
  food: { frame: 0, heal: 40, score: 0, lives: 0 },
  points: { frame: 1, heal: 0, score: 1000, lives: 0 },
  feast: { frame: 2, heal: 1000, score: 0, lives: 0 },
  life: { frame: 3, heal: 0, score: 0, lives: 1 },
};

/** A barrel: blocks walking, breaks on one player hit, may drop a pickup. */
export interface Breakable {
  id: number;
  x: number;
  y: number;
  drop?: PickupKind;
  broken: boolean;
  /** Ticks the wreck stays after breaking. */
  timer: number;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  z: number;
  vz: number;
  age: number;
}

/** A thrown bottle or a rolling barrel. */
export interface Projectile {
  id: number;
  kind: ProjectileKind;
  /** Bottles spare the thrower's team. Barrels hit everyone. */
  team: 'player' | 'enemy' | 'none';
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  knockdown: boolean;
  age: number;
}

/** Per kind: half width, height, gravity, and points for knocking it out of the way. */
export const PROJECTILES: Record<ProjectileKind, { halfW: number; height: number; gravity: number; score: number }> = {
  bottle: { halfW: 5, height: 10, gravity: 0.06, score: 200 },
  barrel: { halfW: 11, height: 24, gravity: 0, score: 300 },
};
export const BOTTLE = { speed: 3.2, vz: 0.9, damage: 8, hitstun: 18, knockback: 1.4 };
export const ROLLING_BARREL = { speed: 2.3, damage: 12 };

export const BARREL = { halfW: 11, height: 32, blockX: 15, blockY: 6, score: 100, wreckTicks: 120 };
export const PICKUP_LIFE = 720;
export const PICKUP_REACH = { x: 14, y: 9 };
