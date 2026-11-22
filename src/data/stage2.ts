import type { StageDef } from '../sim/types';

// Introduces bottle throwers and rolling barrels. Boss: Volt, who charges.
export const stage2: StageDef = {
  id: 'stage2',
  name: 'BACK ALLEYS',
  music: 'music_stage2',
  time: 200,
  width: 2304,
  bandTop: 104,
  bandBottom: 230,
  playerStart: { x: 60, y: 160 },
  props: [
    { key: 'hydrant', x: 520, y: 132 },
    { key: 'hydrant', x: 1700, y: 132 },
  ],
  breakables: [
    { x: 330, y: 114, drop: 'points' },
    { x: 362, y: 114 },
    { x: 820, y: 206, drop: 'food' },
    { x: 1180, y: 114, drop: 'points' },
    { x: 1212, y: 114, drop: 'food' },
    { x: 1620, y: 208, drop: 'points' },
    { x: 1990, y: 114, drop: 'feast' },
    { x: 2260, y: 114, drop: 'points' },
  ],
  waves: [
    {
      camX: 150,
      spawns: [
        { variant: 'punk', side: 1, y: 150, delay: 0 },
        { variant: 'thrower', side: 1, y: 200, delay: 40 },
        { variant: 'runner', side: -1, y: 170, delay: 200 },
      ],
    },
    {
      camX: 600,
      spawns: [
        { variant: 'runner', side: 1, y: 140, delay: 0 },
        { variant: 'runner', side: -1, y: 200, delay: 30 },
        { variant: 'bruiser', side: 1, y: 170, delay: 200 },
        { variant: 'thrower', side: -1, y: 150, delay: 420 },
      ],
      hazards: [{ kind: 'barrel', side: 1, delay: 260, every: 300 }],
    },
    {
      camX: 1050,
      spawns: [
        { variant: 'thrower', side: 1, y: 130, delay: 0 },
        { variant: 'thrower', side: -1, y: 210, delay: 40 },
        { variant: 'punk', side: 1, y: 170, delay: 120 },
        { variant: 'punk', side: -1, y: 150, delay: 380 },
        { variant: 'bruiser', side: 1, y: 190, delay: 560 },
      ],
    },
    {
      camX: 1480,
      spawns: [
        { variant: 'bruiser', side: 1, y: 150, delay: 0 },
        { variant: 'bruiser', side: -1, y: 200, delay: 60 },
        { variant: 'runner', side: 1, y: 170, delay: 300 },
        { variant: 'thrower', side: 1, y: 130, delay: 420 },
        { variant: 'runner', side: -1, y: 210, delay: 560 },
      ],
      hazards: [
        { kind: 'barrel', side: -1, delay: 200, every: 340 },
        { kind: 'barrel', side: 1, y: 180, delay: 370, every: 340 },
      ],
    },
    {
      camX: 1878,
      spawns: [
        { variant: 'volt', side: 1, y: 170, delay: 30 },
        { variant: 'runner', side: -1, y: 140, delay: 400 },
        { variant: 'thrower', side: -1, y: 200, delay: 800 },
        { variant: 'runner', side: 1, y: 210, delay: 1200 },
      ],
    },
  ],
};
