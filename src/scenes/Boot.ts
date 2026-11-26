import Phaser from 'phaser';
import { chars } from '../data/characters';
import { stages } from '../data/stages';
import { VIEW_H, VIEW_W } from '../sim/types';
import { registerFont } from '../view/text';

export const FRAME_W = 96;
export const FRAME_H = 63;

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const def of Object.values(chars)) {
      for (const anim of Object.keys(def.anims)) {
        this.load.spritesheet(`${def.id}_${anim}`, `${def.id}_${anim}.png`, { frameWidth: FRAME_W, frameHeight: FRAME_H });
      }
    }
    this.load.image('shadow', 'shadow.png');
    const music = new Set(['music_title', 'music_end', 'music_boss']);
    for (const stage of stages) {
      this.load.image(stage.id, `${stage.id}.png`);
      this.load.image(`${stage.id}_fore`, `${stage.id}_fore.png`);
      music.add(stage.music);
    }
    this.load.spritesheet('bottle', 'bottle.png', { frameWidth: 12, frameHeight: 12 });
    this.load.image('hydrant', 'hydrant.png');
    this.load.spritesheet('barrel', 'barrel.png', { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('pickups', 'pickups.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('spark', 'spark.png', { frameWidth: 24, frameHeight: 24 });
    this.load.spritesheet('shockwave', 'shockwave.png', { frameWidth: 32, frameHeight: 16 });
    this.load.image('font_img', 'font.png');
    this.load.text('font_chars', 'font.txt');
    for (const key of ['hit_light', 'hit_mid', 'hit_heavy', 'thud', 'pickup', 'extralife', 'blip', 'glass', 'swish', ...music]) {
      this.load.audio(key, `${key}.ogg`);
    }

    // Loading bar: the music is a few megabytes.
    const w = 160;
    const x = (VIEW_W - w) / 2;
    const y = VIEW_H / 2;
    this.add.rectangle(x - 1, y - 1, w + 2, 8, 0x5a1d2e).setOrigin(0);
    const fill = this.add.rectangle(x, y, 0, 6, 0xf2d53c).setOrigin(0);
    this.load.on('progress', (p: number) => (fill.width = Math.round(w * p)));
  }

  create(): void {
    registerFont(this);
    this.scene.start('Intro');
  }
}
