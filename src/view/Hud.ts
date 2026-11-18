import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../sim/types';
import type { World } from '../sim/world';
import { label, setLabel } from './text';

const BAR_W = 100;

function bar(scene: Phaser.Scene, x: number, y: number, color: number): Phaser.GameObjects.Rectangle {
  scene.add.rectangle(x - 1, y - 1, BAR_W + 2, 7, 0x100c1c).setOrigin(0).setScrollFactor(0).setDepth(20000);
  scene.add.rectangle(x, y, BAR_W, 5, 0x5a1d2e).setOrigin(0).setScrollFactor(0).setDepth(20000);
  return scene.add.rectangle(x, y, BAR_W, 5, color).setOrigin(0).setScrollFactor(0).setDepth(20001);
}

export class Hud {
  private hp: Phaser.GameObjects.Rectangle;
  private enemyHp: Phaser.GameObjects.Rectangle;
  private enemyName: Phaser.GameObjects.BitmapText;
  private score: Phaser.GameObjects.BitmapText;
  private lives: Phaser.GameObjects.BitmapText;
  private go: Phaser.GameObjects.BitmapText;
  private banner: Phaser.GameObjects.BitmapText;

  constructor(scene: Phaser.Scene) {
    label(scene, 8, 5, 'P1');
    this.hp = bar(scene, 24, 7, 0xf2d53c);
    this.lives = label(scene, 8, 16, '');
    this.score = label(scene, VIEW_W / 2, 5, '0', 0.5);
    this.enemyName = label(scene, VIEW_W - 8, 16, '', 1);
    this.enemyHp = bar(scene, VIEW_W - 8 - BAR_W, 7, 0xe8563c);
    this.go = label(scene, VIEW_W - 12, 84, 'GO >', 1, 2);
    this.banner = label(scene, VIEW_W / 2, VIEW_H / 2 - 30, '', 0.5, 3);
  }

  sync(w: World): void {
    this.hp.width = Math.round((BAR_W * w.player.hp) / w.player.maxHp);
    setLabel(this.lives, `LIVES x${w.lives}`);
    setLabel(this.score, String(w.score).padStart(6, '0'));
    const t = w.lastTarget;
    this.enemyHp.width = t ? Math.round((BAR_W * t.hp) / t.maxHp) : 0;
    setLabel(this.enemyName, t?.variant?.name ?? '');
    this.go.setVisible(w.go && w.tick % 40 < 26);
    setLabel(this.banner, w.status === 'cleared' ? 'STAGE CLEAR' : w.status === 'gameover' ? 'GAME OVER' : '');
  }
}
