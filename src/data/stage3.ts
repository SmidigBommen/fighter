import type { StageDef } from '../sim/types';

// Introduces the charging Ram. Boss: the Chemist, who keeps away and throws in volleys.
export const stage3: StageDef = {
  id: 'stage3',
  name: 'NEON MILE',
  music: 'music_stage3',
  time: 220,
  width: 2304,
  bandTop: 104,
  bandBottom: 230,
  playerStart: { x: 60, y: 160 },
  props: [
    { key: 'hydrant', x: 380, y: 132 },
    { key: 'hydrant', x: 1240, y: 132 },
    { key: 'hydrant', x: 2140, y: 132 },
  ],
  breakables: [
    { x: 300, y: 206, drop: 'points' },
    { x: 700, y: 114, drop: 'food' },
    { x: 732, y: 114 },
    { x: 1110, y: 114, drop: 'points' },
    { x: 1500, y: 208, drop: 'food' },
    { x: 1532, y: 208, drop: 'points' },
    { x: 1830, y: 114, drop: 'life' },
    { x: 2250, y: 114, drop: 'feast' },
  ],
  waves: [
    {
      camX: 140,
      spawns: [
        { variant: 'rusher', side: 1, y: 170, delay: 0 },
        { variant: 'punk', side: -1, y: 140, delay: 60 },
        { variant: 'punk', side: 1, y: 200, delay: 240 },
      ],
    },
    {
      camX: 560,
      spawns: [
        { variant: 'thrower', side: 1, y: 130, delay: 0 },
        { variant: 'rusher', side: -1, y: 190, delay: 40 },
        { variant: 'runner', side: 1, y: 210, delay: 200 },
        { variant: 'runner', side: -1, y: 150, delay: 360 },
        { variant: 'bruiser', side: 1, y: 170, delay: 600 },
      ],
    },
    {
      camX: 980,
      spawns: [
        { variant: 'bruiser', side: 1, y: 150, delay: 0 },
        { variant: 'bruiser', side: -1, y: 200, delay: 30 },
        { variant: 'thrower', side: 1, y: 210, delay: 240 },
        { variant: 'rusher', side: -1, y: 130, delay: 420 },
        { variant: 'runner', side: 1, y: 170, delay: 640 },
      ],
      hazards: [{ kind: 'barrel', side: 1, delay: 300, every: 280 }],
    },
    {
      camX: 1400,
      spawns: [
        { variant: 'rusher', side: 1, y: 140, delay: 0 },
        { variant: 'rusher', side: -1, y: 200, delay: 90 },
        { variant: 'thrower', side: 1, y: 170, delay: 260 },
        { variant: 'thrower', side: -1, y: 150, delay: 300 },
        { variant: 'punk', side: 1, y: 210, delay: 520 },
        { variant: 'bruiser', side: -1, y: 180, delay: 760 },
      ],
    },
    {
      camX: 1878,
      spawns: [
        { variant: 'chemist', side: 1, y: 170, delay: 30 },
        { variant: 'punk', side: -1, y: 140, delay: 300 },
        { variant: 'rusher', side: 1, y: 200, delay: 760 },
        { variant: 'runner', side: -1, y: 210, delay: 1200 },
      ],
    },
  ],
};
