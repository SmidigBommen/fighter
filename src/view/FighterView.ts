import Phaser from 'phaser';
import { Fighter, poseOf } from '../sim/fighter';

/** Draws one fighter and its shadow from simulation state. Holds no game logic. */
export class FighterView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, f: Fighter) {
    this.shadow = scene.add.image(0, 0, 'shadow').setScale(f.scale);
    this.sprite = scene.add.image(0, 0, `${f.def.id}_idle`, 0).setOrigin(0.5, 1).setScale(f.scale);
    if (f.variant && f.variant.tint !== 0xffffff) this.sprite.setTint(f.variant.tint);
  }

  sync(f: Fighter, tick: number): void {
    const pose = poseOf(f);
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    this.sprite
      .setTexture(`${f.def.id}_${pose.anim}`, pose.frame)
      .setFlipX(f.facing < 0)
      .setPosition(x, y - Math.round(f.z))
      .setDepth(y);
    const blink = (f.invuln > 0 && f.state !== 'getup') || (f.state === 'dead' && f.timer < 45);
    this.sprite.setVisible(!blink || tick % 6 < 3);
    const shrink = Math.max(0.5, 1 - f.z / 110);
    this.shadow
      .setPosition(x, y)
      // A lying body is about twice as wide as a standing one.
      .setScale(f.scale * shrink * (f.state === 'down' || f.state === 'dead' ? 1.9 : 1), f.scale * shrink)
      .setDepth(y - 0.5)
      .setAlpha(0.6);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
