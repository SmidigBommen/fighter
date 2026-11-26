import type { StageDef } from '../sim/types';

// The crew's yard at first light. Two short waves of everything, then the Overseer alone.
export const stage5: StageDef = {
  id: 'stage5',
  name: 'THE YARD',
  music: 'music_stage4',
  time: 360,
  tokens: 3,
  width: 1536,
  bandTop: 104,
  bandBottom: 230,
  playerStart: { x: 60, y: 160 },
  props: [{ key: 'hydrant', x: 520, y: 132 }],
  breakables: [
    { x: 300, y: 114, drop: 'points' },
    { x: 332, y: 114, drop: 'food' },
    { x: 700, y: 208, drop: 'points' },
    { x: 1020, y: 114, drop: 'feast' },
    { x: 1052, y: 114, drop: 'life' },
    { x: 1500, y: 114, drop: 'food' },
  ],
  waves: [
    {
      camX: 150,
      spawns: [
        { variant: 'rusher', side: 1, y: 150, delay: 0 },
        { variant: 'runner', side: -1, y: 200, delay: 30 },
        { variant: 'thrower', side: 1, y: 130, delay: 200 },
        { variant: 'bruiser', side: -1, y: 170, delay: 380 },
        { variant: 'punk', side: 1, y: 190, delay: 560 },
      ],
    },
    {
      camX: 620,
      spawns: [
        { variant: 'bruiser', side: 1, y: 160, delay: 0 },
        { variant: 'thrower', side: -1, y: 210, delay: 40 },
        { variant: 'rusher', side: 1, y: 190, delay: 240 },
        { variant: 'runner', side: -1, y: 140, delay: 420 },
        { variant: 'runner', side: 1, y: 200, delay: 600 },
        { variant: 'bruiser', side: -1, y: 170, delay: 800 },
      ],
      hazards: [{ kind: 'barrel', side: 1, delay: 300, every: 340 }],
    },
    {
      camX: 1110,
      spawns: [{ variant: 'overseer', side: 1, y: 170, delay: 30 }],
    },
  ],
};
