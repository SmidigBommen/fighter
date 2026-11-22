import { START_LIVES } from './sim/types';

/** What carries from scene to scene during one play-through. */
export interface RunState {
  /** Index into the stage list. */
  stage: number;
  score: number;
  lives: number;
  hp: number;
  continues: number;
}

export const CONTINUES = 2;

export function newRun(): RunState {
  return { stage: 0, score: 0, lives: START_LIVES, hp: 100, continues: CONTINUES };
}

/** How a run ended, handed to the name entry and the score table. */
export interface Result {
  score: number;
  /** Stage reached, counted from 1. */
  stage: number;
  /** The last boss was beaten. */
  cleared: boolean;
}
