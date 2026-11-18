export type PickupKind = 'food' | 'points';

/** What a pickup gives. Order matches the frames in assets/game/pickups.png. */
export const PICKUPS: Record<PickupKind, { frame: number; heal: number; score: number }> = {
  food: { frame: 0, heal: 40, score: 0 },
  points: { frame: 1, heal: 0, score: 1000 },
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

export const BARREL = { halfW: 11, height: 32, blockX: 15, blockY: 6, score: 100, wreckTicks: 120 };
export const PICKUP_LIFE = 720;
export const PICKUP_REACH = { x: 14, y: 9 };
