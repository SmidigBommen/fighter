import type { StageDef } from '../sim/types';

// Everything at once, three attackers at a time, Big Red again half way. Boss: the Foreman.
export const stage4: StageDef = {
  id: 'stage4',
  name: 'THE LAST BLOCK',
  music: 'music_stage4',
  time: 300,
  tokens: 3,
  width: 2432,
  bandTop: 104,
  bandBottom: 230,
  playerStart: { x: 60, y: 160 },
  props: [
    { key: 'hydrant', x: 640, y: 132 },
    { key: 'hydrant', x: 1560, y: 132 },
  ],
  breakables: [
    { x: 280, y: 114, drop: 'food' },
    { x: 312, y: 114, drop: 'points' },
    { x: 760, y: 208, drop: 'points' },
    { x: 1150, y: 114, drop: 'feast' },
    { x: 1182, y: 114 },
    { x: 1640, y: 206, drop: 'food' },
    { x: 1960, y: 114, drop: 'life' },
    { x: 2090, y: 114, drop: 'feast' },
    { x: 2380, y: 114, drop: 'points' },
  ],
  waves: [
    {
      camX: 150,
      spawns: [
        { variant: 'runner', side: 1, y: 140, delay: 0 },
        { variant: 'runner', side: -1, y: 200, delay: 20 },
        { variant: 'rusher', side: 1, y: 170, delay: 160 },
        { variant: 'thrower', side: -1, y: 150, delay: 300 },
        { variant: 'bruiser', side: 1, y: 190, delay: 520 },
      ],
    },
    {
      camX: 560,
      spawns: [
        { variant: 'thrower', side: 1, y: 130, delay: 0 },
        { variant: 'thrower', side: -1, y: 210, delay: 30 },
        { variant: 'bruiser', side: 1, y: 170, delay: 120 },
        { variant: 'rusher', side: -1, y: 150, delay: 360 },
        { variant: 'punk', side: 1, y: 200, delay: 520 },
        { variant: 'punk', side: -1, y: 180, delay: 700 },
      ],
      hazards: [{ kind: 'barrel', side: -1, delay: 240, every: 260 }],
    },
    {
      camX: 980,
      spawns: [
        { variant: 'boss', side: 1, y: 170, delay: 30 },
        { variant: 'runner', side: -1, y: 140, delay: 300 },
        { variant: 'thrower', side: 1, y: 210, delay: 600 },
        { variant: 'runner', side: -1, y: 200, delay: 900 },
      ],
    },
    {
      camX: 1400,
      spawns: [
        { variant: 'rusher', side: 1, y: 150, delay: 0 },
        { variant: 'rusher', side: -1, y: 190, delay: 60 },
        { variant: 'bruiser', side: 1, y: 210, delay: 240 },
        { variant: 'thrower', side: -1, y: 130, delay: 300 },
        { variant: 'runner', side: 1, y: 170, delay: 520 },
        { variant: 'bruiser', side: -1, y: 160, delay: 760 },
        { variant: 'runner', side: 1, y: 200, delay: 900 },
      ],
      hazards: [
        { kind: 'barrel', side: 1, delay: 300, every: 320 },
        { kind: 'barrel', side: -1, y: 160, delay: 460, every: 320 },
      ],
    },
    {
      camX: 2006,
      spawns: [
        { variant: 'foreman', side: 1, y: 170, delay: 30 },
        { variant: 'punk', side: -1, y: 140, delay: 420 },
        { variant: 'thrower', side: -1, y: 210, delay: 900 },
        { variant: 'rusher', side: 1, y: 150, delay: 1500 },
        { variant: 'runner', side: -1, y: 200, delay: 2100 },
      ],
    },
  ],
};
