import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../sim/types';
import { label } from '../view/text';

/** Working story text. The plan leaves setting and names open. An empty string is a paragraph gap. */
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

const LINE_H = 16;
/** Crawl speed in pixels per second. */
const SPEED = 22;
/** Height of the stepped fade at the top and bottom edge. */
const FADE_H = 40;
const FADE_STEPS = 5;

/**
 * Story text that crawls up the screen once after boot, then hands over to the title.
 * Browsers keep audio muted until the first key press or click, so when the sound manager
 * is locked the scene waits on a prompt first. That way the music plays under the story.
 */
export class Intro extends Phaser.Scene {
  private crawl!: Phaser.GameObjects.Container;
  private offset = 0;
  private leaving = false;
  private running = false;

  constructor() {
    super('Intro');
  }

  create(): void {
    this.offset = 0;
    this.leaving = false;
    this.running = false;

    this.add.image(0, 0, 'stage1').setOrigin(0).setTint(0x333350);
    this.add.image(0, 0, 'stage1_fore').setOrigin(0).setTint(0x333350);

    this.crawl = this.add.container(0, VIEW_H).setDepth(100);
    LINES.forEach((text, i) => {
      if (text) this.crawl.add(label(this, VIEW_W / 2, i * LINE_H, text, 0.5));
    });

    // Bands of rising opacity, so lines appear and vanish in steps like on an 8-bit console.
    const bandH = FADE_H / FADE_STEPS;
    for (let i = 0; i < FADE_STEPS; i++) {
      const alpha = 1 - i / FADE_STEPS;
      for (const y of [i * bandH, VIEW_H - (i + 1) * bandH]) {
        this.add.rectangle(0, y, VIEW_W, bandH, 0x08080c, alpha).setOrigin(0).setDepth(200);
      }
    }

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
    label(this, VIEW_W - 6, VIEW_H - 13, 'ENTER: SKIP', 1).setAlpha(0.5).setDepth(300);

    // The title scene picks this track up, so it keeps playing across the scene change.
    if (!this.sound.get('music_title')) this.sound.add('music_title', { loop: true, volume: 0.2 }).play();

    // Key repeat is ignored, so holding the key that unlocked the audio does not skip the story.
    const skip = (e: KeyboardEvent) => {
      if (!e.repeat) this.leave(150);
    };
    for (const key of ['ENTER', 'Z', 'J', 'SPACE', 'ESC']) this.input.keyboard!.on(`keydown-${key}`, skip);
  }

  update(_time: number, delta: number): void {
    if (!this.running) return;
    this.offset += (SPEED * delta) / 1000;
    this.crawl.y = Math.round(VIEW_H - this.offset);
    if (this.crawl.y + LINES.length * LINE_H < 0) this.leave(400);
  }

  private leave(fadeMs: number): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(fadeMs, 8, 8, 12);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Title'));
  }
}
