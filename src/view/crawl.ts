import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../sim/types';
import { label } from './text';

const LINE_H = 16;
/** Crawl speed in pixels per second. */
const SPEED = 22;
/** Height of the stepped fade at the top and bottom edge. */
const FADE_H = 40;
const FADE_STEPS = 5;

/** Text that crawls up the screen once. An empty string is a paragraph gap. */
export class Crawl {
  private box: Phaser.GameObjects.Container;
  private offset = 0;

  constructor(
    scene: Phaser.Scene,
    private lines: string[],
  ) {
    this.box = scene.add.container(0, VIEW_H).setDepth(100);
    lines.forEach((text, i) => {
      if (text) this.box.add(label(scene, VIEW_W / 2, i * LINE_H, text, 0.5));
    });
    // Bands of rising opacity, so lines appear and vanish in steps like on an 8-bit console.
    const bandH = FADE_H / FADE_STEPS;
    for (let i = 0; i < FADE_STEPS; i++) {
      const alpha = 1 - i / FADE_STEPS;
      for (const y of [i * bandH, VIEW_H - (i + 1) * bandH]) {
        scene.add.rectangle(0, y, VIEW_W, bandH, 0x08080c, alpha).setOrigin(0).setDepth(200);
      }
    }
  }

  /** Moves the text. Returns true once the last line has left the screen. */
  update(deltaMs: number): boolean {
    this.offset += (SPEED * deltaMs) / 1000;
    this.box.y = Math.round(VIEW_H - this.offset);
    return this.box.y + this.lines.length * LINE_H < 0;
  }
}
