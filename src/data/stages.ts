import type { StageDef } from '../sim/types';
import { stage1 } from './stage1';
import { stage2 } from './stage2';
import { stage3 } from './stage3';
import { stage4 } from './stage4';

/** The stages in play order. */
export const stages: StageDef[] = [stage1, stage2, stage3, stage4];
