import Phaser from 'phaser';
import { VIEW_W } from '../sim/types';
import { label } from '../view/text';

export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.add.image(0, 0, 'stage1').setOrigin(0).setTint(0x8888aa);
    this.add.image(0, 0, 'stage1_fore').setOrigin(0).setTint(0x8888aa);
    this.tweens.add({ targets: this.cameras.main, scrollX: 600, duration: 40000, yoyo: true, repeat: -1 });

    // Working title. The plan leaves setting and names open.
    label(this, VIEW_W / 2, 52, 'NIGHT SHIFT', 0.5, 4);
    label(this, VIEW_W / 2, 100, "A BEAT 'EM UP PROTOTYPE", 0.5);
    const prompt = label(this, VIEW_W / 2, 150, 'PRESS ENTER', 0.5, 2);
    this.tweens.add({ targets: prompt, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
    label(this, VIEW_W / 2, 196, 'MOVE: ARROWS OR WASD', 0.5);
    label(this, VIEW_W / 2, 208, 'ATTACK: Z OR J    JUMP: X, K OR SPACE', 0.5);
    label(this, VIEW_W / 2, 220, 'IN THE AIR: ATTACK, OR DOWN + ATTACK', 0.5);

    const music = this.sound.add('music_title', { loop: true, volume: 0.4 });
    music.play();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => music.destroy());

    const start = () => this.scene.start('Stage');
    this.input.keyboard!.once('keydown-ENTER', start);
    this.input.keyboard!.once('keydown-Z', start);
    this.input.keyboard!.once('keydown-J', start);
  }
}
