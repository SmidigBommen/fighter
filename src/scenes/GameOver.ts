import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../sim/types';
import { label } from '../view/text';

export class GameOver extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: { cleared: boolean; score: number }): void {
    this.add.image(0, 0, 'stage1').setOrigin(0).setTint(data.cleared ? 0x9999bb : 0x553344);
    label(this, VIEW_W / 2, 70, data.cleared ? 'STAGE CLEAR' : 'GAME OVER', 0.5, 4);
    label(this, VIEW_W / 2, 124, `SCORE ${data.score}`, 0.5, 2);
    const prompt = label(this, VIEW_W / 2, VIEW_H - 50, 'PRESS ENTER', 0.5);
    this.tweens.add({ targets: prompt, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });

    const music = this.sound.add('music_end', { loop: false, volume: 0.2 });
    if (data.cleared) music.play();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => music.destroy());
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('Title'));
  }
}
