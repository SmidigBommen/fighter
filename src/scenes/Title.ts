import Phaser from 'phaser';
import { Controls } from '../input';
import { newRun } from '../run';
import { VIEW_W } from '../sim/types';
import { label } from '../view/text';

/** With no input for this long, the title gives way to the score table. */
const ATTRACT_MS = 12000;

export class Title extends Phaser.Scene {
  private controls!: Controls;
  /** Milliseconds since the scene started. The scene clock is not reliable inside create(). */
  private elapsed = 0;
  private leaving = false;
  private toScores = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.leaving = false;
    this.elapsed = 0;
    this.add.image(0, 0, 'stage1').setOrigin(0).setTint(0x8888aa);
    this.add.image(0, 0, 'stage1_fore').setOrigin(0).setTint(0x8888aa);
    this.cameras.main.scrollX = 0;
    this.tweens.add({ targets: this.cameras.main, scrollX: 600, duration: 40000, yoyo: true, repeat: -1 });

    label(this, VIEW_W / 2, 40, 'NIGHT SHIFT', 0.5, 4);
    label(this, VIEW_W / 2, 86, 'FOUR BLOCKS. ONE NIGHT.', 0.5);
    const prompt = label(this, VIEW_W / 2, 122, 'PRESS ENTER', 0.5, 2);
    this.tweens.add({ targets: prompt, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
    const help = [
      'MOVE: ARROWS OR WASD    RUN: DOUBLE TAP OR SHIFT',
      'ATTACK: Z OR J    JUMP: X OR K    SPECIAL: C OR L',
      'IN THE AIR: ATTACK, OR DOWN + ATTACK',
      'SPECIAL CLEARS BOTH SIDES AND COSTS HEALTH',
      'PAUSE: P    GAMEPAD WORKS TOO',
    ];
    help.forEach((text, i) => label(this, VIEW_W / 2, 168 + i * 12, text, 0.5));

    // The intro may have started this track already.
    const music = this.sound.get('music_title') ?? this.sound.add('music_title', { loop: true, volume: 0.2 });
    if (!music.isPlaying) music.play();
    this.toScores = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // The score table keeps the title music; a new game stops it.
      if (!this.toScores) music.destroy();
    });

    this.cameras.main.fadeIn(300, 8, 8, 12);
    this.controls = new Controls(this);
    // A key held over from the scene before must not start the game.
    this.time.delayedCall(200, () => this.controls.clear());
  }

  update(_time: number, delta: number): void {
    this.controls.poll();
    this.elapsed += delta;
    if (this.leaving) return;
    if (this.elapsed > 250 && this.controls.take('confirm')) {
      this.leaving = true;
      this.sound.play('blip', { volume: 0.5 });
      this.scene.start('Stage', newRun());
    } else if (this.elapsed > ATTRACT_MS) {
      this.leaving = true;
      this.toScores = true;
      this.scene.start('Scores', { attract: true });
    }
  }
}
