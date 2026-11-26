import Phaser from 'phaser';
import { Controls } from '../input';
import type { Result } from '../run';
import { VIEW_H, VIEW_W } from '../sim/types';
import { Crawl } from '../view/crawl';
import { label } from '../view/text';
import type { Label } from '../view/text';

const LINES = [
  'SIX IN THE MORNING.',
  '',
  'THE OVERSEER IS DOWN.',
  'THE YARD IS EMPTY.',
  '',
  'THE DAY SHIFT WALKS IN',
  'AND NOTICES NOTHING.',
  '',
  'YOU CLOCK OUT.',
  '',
  'THE BLOCK IS YOURS AGAIN.',
  'UNTIL TONIGHT.',
  '',
  '',
  '',
  'NIGHT SHIFT',
  '',
  'ART: ANSIMUZ',
  'MUSIC: JUHANI JUNKALA',
  'SOUND: QUBODUP',
  '',
  'THANK YOU FOR PLAYING',
];

/** Shown after the last boss: the closing story and credits, then the final score. */
export class Ending extends Phaser.Scene {
  private result!: Result;
  private crawl!: Crawl;
  private controls!: Controls;
  private skipHint!: Label;
  private finished = false;
  private leaving = false;

  constructor() {
    super('Ending');
  }

  init(result: Result): void {
    this.result = result;
  }

  create(): void {
    this.finished = false;
    this.leaving = false;
    // The last block again, in daylight.
    this.add.image(-1900, 0, 'stage4').setOrigin(0).setTint(0xffe0c0);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x08080c, 0.45).setOrigin(0);
    this.crawl = new Crawl(this, LINES);
    this.controls = new Controls(this);
    this.time.delayedCall(400, () => this.controls.clear());
    this.skipHint = label(this, VIEW_W - 6, VIEW_H - 13, 'ENTER: SKIP', 1).setAlpha(0.5).setDepth(300);
    this.cameras.main.fadeIn(800, 8, 8, 12);

    const music = this.sound.add('music_end', { loop: true, volume: 0.2 });
    music.play();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => music.destroy());
  }

  update(_time: number, delta: number): void {
    this.controls.poll();
    const confirm = this.controls.take('confirm');
    if (this.finished) {
      if (confirm) this.leave();
      return;
    }
    if (this.crawl.update(delta) || confirm) {
      this.finished = true;
      this.controls.clear();
      this.skipHint.destroy();
      this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x08080c, 1).setOrigin(0).setDepth(250);
      label(this, VIEW_W / 2, 60, 'THE END', 0.5, 4).setDepth(300);
      label(this, VIEW_W / 2, 120, `FINAL SCORE ${this.result.score}`, 0.5, 2).setDepth(300);
      const prompt = label(this, VIEW_W / 2, VIEW_H - 50, 'PRESS ENTER', 0.5).setDepth(300);
      this.tweens.add({ targets: prompt, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
      this.time.delayedCall(20000, () => this.leave());
    }
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('NameEntry', this.result);
  }
}
