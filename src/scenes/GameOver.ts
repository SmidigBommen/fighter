import Phaser from 'phaser';
import { stages } from '../data/stages';
import { Controls } from '../input';
import type { Result, RunState } from '../run';
import { START_LIVES, VIEW_H, VIEW_W } from '../sim/types';
import { label, setLabel } from '../view/text';
import type { Label } from '../view/text';

const COUNT_FROM = 9;
const COUNT_STEP_MS = 1000;

/** Game over. While credits remain, a countdown offers to continue the stage with the score reset. */
export class GameOver extends Phaser.Scene {
  private run!: RunState;
  private controls!: Controls;
  private count?: Label;
  private left = COUNT_FROM;
  /** Milliseconds since the scene started. The scene clock is not reliable inside create(). */
  private elapsed = 0;
  private nextStep = 0;
  private done = false;

  constructor() {
    super('GameOver');
  }

  init(data: { run: RunState }): void {
    this.run = data.run;
  }

  create(): void {
    this.done = false;
    this.elapsed = 0;
    this.left = COUNT_FROM;
    this.count = undefined;
    const stage = stages[this.run.stage];
    this.add.image(0, 0, stage.id).setOrigin(0).setTint(0x553344);
    label(this, VIEW_W / 2, 36, 'GAME OVER', 0.5, 4);
    label(this, VIEW_W / 2, 84, `SCORE ${this.run.score}`, 0.5, 2);
    this.controls = new Controls(this);
    this.time.delayedCall(300, () => this.controls.clear());
    this.cameras.main.fadeIn(300, 8, 8, 12);

    if (this.run.continues > 0) {
      label(this, VIEW_W / 2, 118, 'CONTINUE?', 0.5, 2);
      this.count = label(this, VIEW_W / 2, 142, String(this.left), 0.5, 4);
      label(this, VIEW_W / 2, 190, `CREDITS ${this.run.continues}`, 0.5);
      label(this, VIEW_W / 2, 204, 'ENTER: CONTINUE THIS STAGE, SCORE BACK TO ZERO', 0.5);
      label(this, VIEW_W / 2, 216, 'ESC: END THE GAME AND KEEP THE SCORE', 0.5);
      this.nextStep = COUNT_STEP_MS + 300;
    } else {
      const prompt = label(this, VIEW_W / 2, VIEW_H - 50, 'PRESS ENTER', 0.5);
      this.tweens.add({ targets: prompt, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
    }
  }

  update(_time: number, delta: number): void {
    this.controls.poll();
    this.elapsed += delta;
    if (this.done) return;
    const confirm = this.controls.take('confirm');
    const back = this.controls.take('back');
    if (!this.count) {
      if (confirm || back) this.end();
      return;
    }
    if (confirm) {
      this.done = true;
      this.sound.play('extralife', { volume: 0.6 });
      const run: RunState = { ...this.run, score: 0, lives: START_LIVES, hp: 100, continues: this.run.continues - 1 };
      this.scene.start('Stage', run);
      return;
    }
    if (back) return this.end();
    if (this.elapsed >= this.nextStep) {
      this.nextStep += COUNT_STEP_MS;
      if (--this.left < 0) return this.end();
      setLabel(this.count, String(this.left));
      this.sound.play('blip', { volume: 0.5 });
    }
  }

  private end(): void {
    this.done = true;
    const result: Result = { score: this.run.score, stage: this.run.stage + 1, cleared: false };
    if (result.score > 0) this.scene.start('NameEntry', result);
    else this.scene.start('Scores', {});
  }
}
