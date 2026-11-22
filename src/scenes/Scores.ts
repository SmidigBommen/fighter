import Phaser from 'phaser';
import { stages } from '../data/stages';
import { Controls } from '../input';
import type { Result } from '../run';
import { BOARD_SIZE, loadBoard } from '../scores';
import type { Board } from '../scores';
import { VIEW_H, VIEW_W } from '../sim/types';
import { label } from '../view/text';

/** In attract mode the table goes back to the title by itself. */
const ATTRACT_MS = 9000;
const ROW_Y = 50;
const ROW_H = 14;

/** The score table. Comes after name entry with the new entry marked, or from the title as attract screen. */
export class Scores extends Phaser.Scene {
  private controls!: Controls;
  /** Milliseconds since the scene started. The scene clock is not reliable inside create(). */
  private elapsed = 0;
  private attract = false;
  private left = false;

  constructor() {
    super('Scores');
  }

  create(data: { board?: Board; result?: Result; attract?: boolean }): void {
    this.attract = !!data.attract;
    this.left = false;
    this.elapsed = 0;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (this.left = true));
    this.add.image(-300, 0, 'stage1').setOrigin(0).setTint(0x333350);
    label(this, VIEW_W / 2, 10, 'BEST OF THE NIGHT SHIFT', 0.5, 2);
    const status = label(this, VIEW_W / 2, 32, 'LOADING', 0.5).setAlpha(0.7);
    const prompt = label(this, VIEW_W / 2, VIEW_H - 16, 'PRESS ENTER', 0.5);
    this.tweens.add({ targets: prompt, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
    this.controls = new Controls(this);
    this.time.delayedCall(300, () => this.controls.clear());
    this.cameras.main.fadeIn(300, 8, 8, 12);

    // After a game the title music is gone; in attract mode it is still playing.
    const music = this.sound.get('music_title') ?? this.sound.add('music_title', { loop: true, volume: 0.2 });
    if (!music.isPlaying) music.play();

    const show = (board: Board) => {
      // The reply may arrive after the scene has been left.
      if (this.left) return;
      status.destroy();
      label(this, VIEW_W / 2, 32, board.online ? 'ALL PLAYERS' : 'THIS BROWSER ONLY', 0.5).setAlpha(0.7);
      if (board.entries.length === 0) label(this, VIEW_W / 2, 100, 'NO SCORES YET. BE THE FIRST.', 0.5);
      board.entries.slice(0, BOARD_SIZE).forEach((e, i) => {
        const y = ROW_Y + i * ROW_H;
        const row = [
          label(this, 96, y, `${i + 1}.`, 1),
          label(this, 110, y, e.name),
          label(this, 232, y, String(e.score), 1),
          label(this, 256, y, e.cleared ? 'ALL CLEAR' : `STAGE ${Math.min(e.stage, stages.length)}`),
        ];
        if (i === board.rank) {
          row.forEach((t) => t.setTint(0xf2d53c));
          this.tweens.add({ targets: row, alpha: 0.35, duration: 350, yoyo: true, repeat: -1 });
        }
      });
      if (data.result && board.rank < 0) {
        label(this, VIEW_W / 2, ROW_Y + BOARD_SIZE * ROW_H + 4, `YOUR SCORE ${data.result.score}`, 0.5).setTint(0xf2d53c);
      }
    };
    if (data.board) show(data.board);
    else loadBoard().then(show);
  }

  update(_time: number, delta: number): void {
    this.controls.poll();
    this.elapsed += delta;
    if (this.left) return;
    const key = this.elapsed > 300 && (this.controls.take('confirm') || this.controls.take('back'));
    if (key || (this.attract && this.elapsed > ATTRACT_MS)) {
      this.left = true;
      this.scene.start('Title');
    }
  }
}
