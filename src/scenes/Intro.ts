import Phaser from 'phaser';
import { Controls } from '../input';
import { VIEW_H, VIEW_W } from '../sim/types';
import { Crawl } from '../view/crawl';
import { label } from '../view/text';

const LINES = [
  'IN THIS CITY THE DAY SHIFT',
  'GOES HOME AT SIX.',
  '',
  'THE NIGHT SHIFT',
  'NEVER CLOCKS OUT.',
  '',
  'THE PUNKS RUN THE STREETS NOW.',
  'NOBODY CALLS THE COPS.',
  'NOBODY PICKS UP ANYWAY.',
  '',
  'TONIGHT THEY PICKED',
  'THE WRONG BLOCK.',
  '',
  'YOURS.',
];

/**
 * Story text that crawls up the screen once after boot, then hands over to the title.
 * Browsers keep audio muted until the first key press or click, so when the sound manager
 * is locked the scene waits on a prompt first. That way the music plays under the story.
 */
export class Intro extends Phaser.Scene {
  private crawl!: Crawl;
  private controls!: Controls;
  private leaving = false;
  private running = false;

  constructor() {
    super('Intro');
  }

  create(): void {
    this.leaving = false;
    this.running = false;

    this.add.image(0, 0, 'stage1').setOrigin(0).setTint(0x333350);
    this.add.image(0, 0, 'stage1_fore').setOrigin(0).setTint(0x333350);
    this.crawl = new Crawl(this, LINES);
    this.controls = new Controls(this);
    this.cameras.main.fadeIn(600, 8, 8, 12);

    if (this.sound.locked) {
      const prompt = label(this, VIEW_W / 2, VIEW_H / 2 - 8, 'PRESS ANY KEY', 0.5, 2).setDepth(300);
      this.tweens.add({ targets: prompt, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
        prompt.destroy();
        this.begin();
      });
    } else {
      this.begin();
    }
  }

  private begin(): void {
    this.running = true;
    // The press that unlocked the audio must not also skip the story.
    this.time.delayedCall(250, () => this.controls.clear());
    label(this, VIEW_W - 6, VIEW_H - 13, 'ENTER: SKIP', 1).setAlpha(0.5).setDepth(300);
    // The title scene picks this track up, so it keeps playing across the scene change.
    if (!this.sound.get('music_title')) this.sound.add('music_title', { loop: true, volume: 0.2 }).play();
  }

  update(_time: number, delta: number): void {
    this.controls.poll();
    if (!this.running) return;
    const skip = this.controls.take('confirm') || this.controls.take('back') || this.controls.take('jump');
    if (skip) this.leave(150);
    if (this.crawl.update(delta)) this.leave(400);
  }

  private leave(fadeMs: number): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(fadeMs, 8, 8, 12);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Title'));
  }
}
