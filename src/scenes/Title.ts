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

    // The intro may have started this track already.
    const music = this.sound.get('music_title') ?? this.sound.add('music_title', { loop: true, volume: 0.2 });
    if (!music.isPlaying) music.play();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => music.destroy());

    this.cameras.main.fadeIn(300, 8, 8, 12);

    // Key repeat is ignored, so holding the key that skipped the intro does not also start the game.
    const start = (e: KeyboardEvent) => {
      if (!e.repeat) this.scene.start('Stage');
    };
    for (const key of ['ENTER', 'Z', 'J']) this.input.keyboard!.on(`keydown-${key}`, start);
  }
}
