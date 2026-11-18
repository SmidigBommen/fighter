import type { StageDef } from '../sim/types';

// Stage art is built by execution/build_assets.py (STAGE1_* constants).
export const stage1: StageDef = {
  id: 'stage1',
  width: 1920,
  bandTop: 104,
  bandBottom: 230,
  playerStart: { x: 60, y: 160 },
  props: [
    { key: 'hydrant', x: 300, y: 132 },
    { key: 'hydrant', x: 1180, y: 132 },
  ],
  breakables: [
    { x: 470, y: 114, drop: 'points' },
    { x: 770, y: 116, drop: 'food' },
    { x: 802, y: 116, drop: 'points' },
    { x: 1240, y: 204, drop: 'food' },
    { x: 1404, y: 114 },
    { x: 1700, y: 114, drop: 'food' },
    { x: 1732, y: 114, drop: 'points' },
  ],
  waves: [
    {
      camX: 120,
      spawns: [
        { variant: 'punk', side: 1, y: 150, delay: 0 },
        { variant: 'punk', side: 1, y: 200, delay: 50 },
      ],
    },
    {
      camX: 560,
      spawns: [
        { variant: 'punk', side: 1, y: 140, delay: 0 },
        { variant: 'runner', side: -1, y: 190, delay: 40 },
        { variant: 'punk', side: 1, y: 210, delay: 150 },
        { variant: 'runner', side: 1, y: 160, delay: 360 },
      ],
    },
    {
      camX: 1020,
      spawns: [
        { variant: 'bruiser', side: 1, y: 170, delay: 0 },
        { variant: 'punk', side: -1, y: 130, delay: 60 },
        { variant: 'runner', side: 1, y: 210, delay: 120 },
        { variant: 'punk', side: 1, y: 150, delay: 420 },
        { variant: 'bruiser', side: -1, y: 190, delay: 540 },
      ],
    },
    {
      camX: 1494,
      spawns: [
        { variant: 'boss', side: 1, y: 170, delay: 30 },
        { variant: 'punk', side: -1, y: 140, delay: 240 },
        { variant: 'runner', side: 1, y: 210, delay: 600 },
        { variant: 'punk', side: -1, y: 200, delay: 900 },
      ],
    },
  ],
};
