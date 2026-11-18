import Phaser from 'phaser';
import { chars } from '../data/characters';
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
    this.load.image('stage1', 'stage1.png');
    this.load.image('stage1_fore', 'stage1_fore.png');
    this.load.image('hydrant', 'hydrant.png');
    this.load.spritesheet('barrel', 'barrel.png', { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('pickups', 'pickups.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('spark', 'spark.png', { frameWidth: 24, frameHeight: 24 });
    this.load.image('font_img', 'font.png');
    this.load.text('font_chars', 'font.txt');
    for (const key of ['hit_light', 'hit_mid', 'hit_heavy', 'thud', 'pickup', 'music_stage1', 'music_title', 'music_end']) {
      this.load.audio(key, `${key}.ogg`);
    }
  }

  create(): void {
    registerFont(this);
    this.scene.start('Title');
  }
}
