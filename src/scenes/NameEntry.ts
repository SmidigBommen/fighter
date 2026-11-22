import Phaser from 'phaser';
import { Controls } from '../input';
import type { Result } from '../run';
import { lastName, submitScore } from '../scores';
import { VIEW_W } from '../sim/types';
import { label, setLabel } from '../view/text';
import type { Label } from '../view/text';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const SLOT_X = [VIEW_W / 2 - 40, VIEW_W / 2, VIEW_W / 2 + 40];
const SLOT_Y = 110;

/** Three initials for the score table, arcade style: up and down pick a letter, or just type. */
export class NameEntry extends Phaser.Scene {
  private result!: Result;
  private controls!: Controls;
  private name: string[] = [];
  private slot = 0;
  private letters: Label[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  private sending = false;

  constructor() {
    super('NameEntry');
  }

  init(result: Result): void {
    this.result = result;
  }

  create(): void {
    this.sending = false;
    this.slot = 0;
    this.name = lastName().split('');
    label(this, VIEW_W / 2, 24, 'ENTER YOUR INITIALS', 0.5, 2);
    label(this, VIEW_W / 2, 56, `SCORE ${this.result.score}`, 0.5, 2);
    this.letters = SLOT_X.map((x, i) => label(this, x, SLOT_Y, this.name[i], 0.5, 4));
    this.cursor = this.add.rectangle(0, SLOT_Y + 42, 30, 3, 0xf2d53c).setOrigin(0.5, 0);
    this.tweens.add({ targets: this.cursor, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
    label(this, VIEW_W / 2, 186, 'UP AND DOWN: LETTER    LEFT AND RIGHT: MOVE', 0.5);
    label(this, VIEW_W / 2, 198, 'OR TYPE THEM.    ENTER: OK', 0.5);

    // The gamepad comes through Controls. Keys are read here, because letters are text in this scene.
    this.controls = new Controls(this, false);
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.key(e));
    this.cameras.main.fadeIn(300, 8, 8, 12);
    this.show();
  }

  private key(e: KeyboardEvent): void {
    if (this.sending || e.repeat) return;
    const ch = e.key.toUpperCase();
    if (e.key === 'Enter') this.ok();
    else if (e.key === 'Backspace' || e.key === 'ArrowLeft') this.move(-1);
    else if (e.key === 'ArrowRight') this.move(1);
    else if (e.key === 'ArrowUp') this.spin(-1);
    else if (e.key === 'ArrowDown') this.spin(1);
    else if (ch.length === 1 && CHARS.includes(ch)) {
      this.name[this.slot] = ch;
      this.move(1);
    } else return;
    e.preventDefault();
  }

  private move(by: number): void {
    this.slot = Math.min(2, Math.max(0, this.slot + by));
    this.sound.play('blip', { volume: 0.4 });
    this.show();
  }

  private spin(by: number): void {
    const i = CHARS.indexOf(this.name[this.slot]);
    this.name[this.slot] = CHARS[(i + by + CHARS.length) % CHARS.length];
    this.sound.play('blip', { volume: 0.4 });
    this.show();
  }

  /** Enter moves on to the next letter, and sends the score from the last one. */
  private ok(): void {
    if (this.slot < 2) return this.move(1);
    this.sending = true;
    this.cursor.setVisible(false);
    this.sound.play('pickup', { volume: 0.6 });
    label(this, VIEW_W / 2, 164, 'SAVING', 0.5);
    submitScore(this.name.join(''), this.result).then((board) => this.scene.start('Scores', { board, result: this.result }));
  }

  private show(): void {
    this.letters.forEach((t, i) => setLabel(t, this.name[i] === ' ' ? '-' : this.name[i]));
    this.cursor.x = SLOT_X[this.slot];
  }

  update(): void {
    this.controls.poll();
    if (this.sending) return;
    if (this.controls.take('up')) this.spin(-1);
    if (this.controls.take('down')) this.spin(1);
    if (this.controls.take('left')) this.move(-1);
    if (this.controls.take('right')) this.move(1);
    if (this.controls.take('confirm')) this.ok();
  }
}
