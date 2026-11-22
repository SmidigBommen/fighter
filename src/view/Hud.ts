import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../sim/types';
import { comboMultiplier } from '../sim/world';
import type { World } from '../sim/world';
import { label, setLabel } from './text';
import type { Label } from './text';

const BAR_W = 100;

function bar(scene: Phaser.Scene, x: number, y: number, color: number): Phaser.GameObjects.Rectangle {
  scene.add.rectangle(x - 1, y - 1, BAR_W + 2, 7, 0x100c1c).setOrigin(0).setScrollFactor(0).setDepth(20000);
  scene.add.rectangle(x, y, BAR_W, 5, 0x5a1d2e).setOrigin(0).setScrollFactor(0).setDepth(20000);
  return scene.add.rectangle(x, y, BAR_W, 5, color).setOrigin(0).setScrollFactor(0).setDepth(20001);
}

export class Hud {
  private hp: Phaser.GameObjects.Rectangle;
  private enemyHp: Phaser.GameObjects.Rectangle;
  private enemyName: Label;
  private score: Label;
  private lives: Label;
  private time: Label;
  private combo: Label;
  private go: Label;
  private banner: Label;
  private sub: Label;
  private bannerTicks = 0;
  private bannerBlink = false;

  constructor(scene: Phaser.Scene) {
    label(scene, 8, 5, 'P1');
    this.hp = bar(scene, 24, 7, 0xf2d53c);
    this.score = label(scene, 8, 16, '');
    this.lives = label(scene, 124, 16, '', 1);
    label(scene, VIEW_W / 2, 5, 'TIME', 0.5);
    this.time = label(scene, VIEW_W / 2, 15, '', 0.5, 2);
    this.enemyName = label(scene, VIEW_W - 8, 16, '', 1);
    this.enemyHp = bar(scene, VIEW_W - 8 - BAR_W, 7, 0xe8563c);
    this.combo = label(scene, 8, 32, '', 0, 2);
    this.go = label(scene, VIEW_W - 12, 84, 'GO >', 1, 2);
    this.banner = label(scene, VIEW_W / 2, VIEW_H / 2 - 44, '', 0.5, 3);
    this.sub = label(scene, VIEW_W / 2, VIEW_H / 2 - 12, '', 0.5, 2);
  }

  /** Shows a large line and a smaller one under it for a number of ticks. */
  announce(text: string, sub = '', ticks = 150, blink = false): void {
    setLabel(this.banner, text);
    setLabel(this.sub, sub);
    this.bannerTicks = ticks;
    this.bannerBlink = blink;
  }

  /** Call once per simulation tick. */
  tick(): void {
    if (this.bannerTicks > 0 && --this.bannerTicks === 0) this.announce('', '', 0);
  }

  sync(w: World): void {
    this.hp.width = Math.round((BAR_W * w.player.hp) / w.player.maxHp);
    setLabel(this.score, String(w.score).padStart(7, '0'));
    setLabel(this.lives, `x${w.lives}`);
    setLabel(this.time, String(w.seconds));
    // The last ten seconds blink.
    this.time.setVisible(w.seconds > 10 || w.tick % 30 < 20);
    // The boss keeps the bar while one is on screen. Otherwise it shows the enemy hit last.
    const t = w.fighters.find((f) => f.variant?.boss && f.alive) ?? w.lastTarget;
    this.enemyHp.width = t ? Math.round((BAR_W * t.hp) / t.maxHp) : 0;
    setLabel(this.enemyName, t?.variant?.name ?? '');
    const mult = comboMultiplier(w.combo);
    setLabel(this.combo, w.combo >= 2 ? `${w.combo} HITS${mult > 1 ? ` x${mult}` : ''}` : '');
    this.go.setVisible(w.go && w.tick % 40 < 26);
    const visible = !this.bannerBlink || this.bannerTicks % 20 < 12;
    this.banner.setVisible(visible);
    this.sub.setVisible(visible);
  }
}
