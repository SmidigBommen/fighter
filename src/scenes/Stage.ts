import Phaser from 'phaser';
import { stages } from '../data/stages';
import { Controls } from '../input';
import type { Result, RunState } from '../run';
import { activeHitbox, worldBox } from '../sim/combat';
import { PICKUPS, PICKUP_LIFE } from '../sim/objects';
import { TICK_RATE, VIEW_H, VIEW_W } from '../sim/types';
import type { StageDef } from '../sim/types';
import { World } from '../sim/world';
import { FighterView } from '../view/FighterView';
import { Hud } from '../view/Hud';
import { label } from '../view/text';
import type { Label } from '../view/text';

const STEP_MS = 1000 / TICK_RATE;
/** After a long stall, drop the backlog instead of fast-forwarding the game. */
const MAX_BACKLOG_MS = 100;
/** Points per life left when the last stage is cleared. */
const LIFE_BONUS = 5000;
/** Ticks after the stage ends: when the bonus lines appear, and when the scene moves on by itself. */
const TALLY_AT = 110;
const TALLY_GAP = 40;
const LEAVE_AT = 420;

interface Spark {
  img: Phaser.GameObjects.Image;
  age: number;
}

interface Popup {
  text: Label;
  age: number;
}

export class Stage extends Phaser.Scene {
  private run!: RunState;
  private def!: StageDef;
  private world!: World;
  private views = new Map<number, FighterView>();
  /** Barrel, pickup and projectile images by object id. */
  private objects = new Map<number, Phaser.GameObjects.Image>();
  private hud!: Hud;
  private controls!: Controls;
  private acc = 0;
  private shake = 0;
  private sparks: Spark[] = [];
  private popups: Popup[] = [];
  private endTimer = 0;
  /** Ticks of half-speed play left, after a boss goes down. */
  private slow = 0;
  private paused = false;
  private pauseText!: Label;
  private leaving = false;
  private music?: Phaser.Sound.BaseSound;
  private bonus: { name: string; points: number }[] = [];
  private bonusShown = 0;
  private finalScore = 0;
  private debug?: Phaser.GameObjects.Graphics;

  constructor() {
    super('Stage');
  }

  init(run: RunState): void {
    this.run = run;
  }

  create(): void {
    this.def = stages[this.run.stage];
    this.world = new World(this.def, Date.now() & 0xffff, this.run);
    this.views.clear();
    this.objects.clear();
    this.sparks = [];
    this.popups = [];
    this.bonus = [];
    this.bonusShown = 0;
    this.acc = 0;
    this.shake = 0;
    this.endTimer = 0;
    this.slow = 0;
    this.paused = false;
    this.leaving = false;

    this.add.image(0, 0, this.def.id).setOrigin(0).setDepth(-10);
    this.add.image(0, 0, `${this.def.id}_fore`).setOrigin(0).setDepth(10000);
    for (const p of this.def.props) this.add.image(p.x, p.y, p.key).setOrigin(0.5, 1).setDepth(p.y);
    this.hud = new Hud(this);
    this.hud.announce(`STAGE ${this.run.stage + 1}`, this.def.name, 150);
    this.pauseText = label(this, VIEW_W / 2, VIEW_H / 2 + 24, 'PAUSED', 0.5, 3).setDepth(30000).setVisible(false);

    this.controls = new Controls(this);
    // H toggles hitbox and hurtbox outlines for tuning frame data.
    this.input.keyboard!.on('keydown-H', () => {
      if (this.debug) {
        this.debug.destroy();
        this.debug = undefined;
      } else {
        this.debug = this.add.graphics().setDepth(15000);
      }
    });

    this.playMusic(this.def.music);
    this.cameras.main.fadeIn(300, 8, 8, 12);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.music?.destroy();
      this.music = undefined;
      this.debug = undefined;
    });

    if (import.meta.env.DEV) (window as unknown as { world: World }).world = this.world;
  }

  private playMusic(key: string): void {
    this.music?.destroy();
    this.music = this.sound.add(key, { loop: true, volume: 0.175 });
    this.music.play();
  }

  update(_time: number, delta: number): void {
    this.controls.poll();
    if (this.controls.take('pause') && this.world.status === 'playing') {
      this.paused = !this.paused;
      this.pauseText.setVisible(this.paused);
      if (this.paused) this.music?.pause();
      else this.music?.resume();
      this.controls.clear();
    }
    if (this.paused) return;

    this.acc = Math.min(this.acc + delta, MAX_BACKLOG_MS);
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      // Slow motion: the simulation takes every other tick.
      if (this.slow > 0 && this.slow-- % 2 === 0) continue;
      const input = this.controls.intent();
      if (this.world.status === 'playing') {
        this.world.step(input);
        this.handleEvents();
      } else {
        this.tickEnd(input.attack || input.jump);
      }
      this.tickEffects();
    }
    this.render();
  }

  private handleEvents(): void {
    const w = this.world;
    for (const e of w.events) {
      if (e.type === 'hit') {
        const key = e.heavy ? 'hit_heavy' : w.tick % 2 ? 'hit_light' : 'hit_mid';
        this.sound.play(key, { volume: e.heavy ? 0.9 : 0.6 });
        this.shake = Math.max(this.shake, e.heavy ? 8 : 3);
        this.spark(e.x, e.y, e.z, e.heavy ? 1.5 : 1);
      } else if (e.type === 'break') {
        this.sound.play('thud', { volume: 0.8 });
        this.shake = Math.max(this.shake, 5);
      } else if (e.type === 'shatter') {
        this.sound.play('glass', { volume: 0.5 });
        this.spark(e.x, e.y, e.z, 0.7);
      } else if (e.type === 'special') {
        this.sound.play('swish', { volume: 0.7 });
      } else if (e.type === 'pickup') {
        this.sound.play(e.kind === 'life' ? 'extralife' : 'pickup', { volume: 0.6 });
        if (e.kind === 'life') this.popup('1UP', e.x, e.y, 24);
      } else if (e.type === 'extralife') {
        this.sound.play('extralife', { volume: 0.6 });
        this.popup('1UP', w.player.x, w.player.y, 60);
      } else if (e.type === 'score') {
        if (e.amount > 0) this.popup(String(e.amount), e.x, e.y, e.z);
      } else if (e.type === 'land') {
        // Only the first impact is audible. The bounce that follows gets a light shake and no sound.
        if (!e.second) this.sound.play('thud', { volume: 0.5 });
        this.shake = Math.max(this.shake, e.second ? 2 : 4);
      } else if (e.type === 'boss') {
        this.hud.announce('WARNING', e.name, 150, true);
        this.playMusic('music_boss');
      } else if (e.type === 'unlock') {
        // A boss in the middle of a stage: back to the stage music once it is beaten.
        if (this.music?.key === 'music_boss') this.playMusic(this.def.music);
      } else if (e.type === 'timeout') {
        this.hud.announce('TIME OVER', '', 120);
      } else if (e.type === 'ko') {
        if (w.fighters.find((f) => f.id === e.id)?.variant?.boss) {
          this.slow = 100;
          this.cameras.main.flash(250, 255, 255, 255);
        }
      }
    }
    if (w.status === 'gameover') {
      this.hud.announce('GAME OVER', '', 1e6);
      this.music?.stop();
    } else if (w.status === 'cleared') {
      this.hud.announce('STAGE CLEAR', '', 1e6);
      this.music?.stop();
      this.sound.play('extralife', { volume: 0.6 });
      const t = w.tally();
      this.bonus = [
        { name: 'TIME BONUS', points: t.time },
        { name: 'HEALTH BONUS', points: t.health },
      ];
      if (this.run.stage === stages.length - 1) this.bonus.push({ name: 'LIFE BONUS', points: w.lives * LIFE_BONUS });
      this.finalScore = w.score + this.bonus.reduce((n, b) => n + b.points, 0);
    }
  }

  /** After the stage has ended: bonus lines appear one by one, then the scene moves on. */
  private tickEnd(skip: boolean): void {
    const w = this.world;
    this.endTimer++;
    if (w.status === 'gameover') {
      if (this.endTimer > 150) this.leave('GameOver', { run: { ...this.run, score: w.score, lives: 0 } });
      return;
    }
    const due = Math.min(this.bonus.length + 1, Math.floor((this.endTimer - TALLY_AT) / TALLY_GAP) + 1);
    while (this.bonusShown < due) {
      const i = this.bonusShown++;
      const y = VIEW_H / 2 - 4 + i * 14;
      if (i < this.bonus.length) {
        label(this, VIEW_W / 2 - 70, y, this.bonus[i].name);
        label(this, VIEW_W / 2 + 70, y, String(this.bonus[i].points), 1);
      } else {
        label(this, VIEW_W / 2 - 70, y + 6, 'SCORE');
        label(this, VIEW_W / 2 + 70, y + 6, String(this.finalScore), 1);
      }
      this.sound.play('blip', { volume: 0.5 });
    }
    const allShown = this.bonusShown > this.bonus.length;
    if (this.endTimer > LEAVE_AT || (allShown && skip)) {
      const next = this.run.stage + 1;
      if (next < stages.length) {
        this.leave('Stage', { ...this.run, stage: next, score: this.finalScore, lives: w.lives, hp: w.player.hp });
      } else {
        const result: Result = { score: this.finalScore, stage: stages.length, cleared: true };
        this.leave('Ending', result);
      }
    }
  }

  private leave(scene: string, data: object): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(350, 8, 8, 12);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }

  private spark(x: number, y: number, z: number, scale: number): void {
    const img = this.add
      .image(Math.round(x), Math.round(y - z), 'spark', 0)
      .setDepth(y + 1)
      .setScale(scale);
    this.sparks.push({ img, age: 0 });
  }

  /** Text that floats up from a place in the world and fades. */
  private popup(text: string, x: number, y: number, z: number): void {
    const sx = Math.min(VIEW_W - 20, Math.max(20, x - this.world.camX));
    this.popups.push({ text: label(this, sx, y - z - 12, text, 0.5), age: 0 });
  }

  private tickEffects(): void {
    this.hud.tick();
    if (this.shake > 0) this.shake--;
    this.sparks = this.sparks.filter((s) => {
      s.age++;
      if (s.age >= 12) {
        s.img.destroy();
        return false;
      }
      s.img.setFrame(Math.floor(s.age / 3));
      return true;
    });
    this.popups = this.popups.filter((p) => {
      p.age++;
      if (p.age >= 50) {
        p.text.destroy();
        return false;
      }
      if (p.age % 2 === 0) p.text.y -= 1;
      p.text.setAlpha(p.age < 35 ? 1 : 1 - (p.age - 35) / 15);
      return true;
    });
  }

  private render(): void {
    const w = this.world;
    const seen = new Set<number>();
    for (const f of w.fighters) {
      seen.add(f.id);
      let view = this.views.get(f.id);
      if (!view) this.views.set(f.id, (view = new FighterView(this, f)));
      view.sync(f, w.tick);
    }
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
    }
    const live = new Set<number>();
    const image = (id: number, key: string, originY = 1) => {
      live.add(id);
      let img = this.objects.get(id);
      if (!img) this.objects.set(id, (img = this.add.image(0, 0, key).setOrigin(0.5, originY)));
      return img;
    };
    for (const b of w.breakables) {
      image(b.id, 'barrel')
        .setFrame(b.broken ? 1 : 0)
        .setPosition(b.x, b.y + 2)
        .setDepth(b.y)
        .setVisible(!b.broken || b.timer > 40 || w.tick % 6 < 3);
    }
    for (const k of w.pickups) {
      image(k.id, 'pickups')
        .setFrame(PICKUPS[k.kind].frame)
        .setPosition(Math.round(k.x), Math.round(k.y - k.z))
        .setDepth(k.y + 0.1)
        .setVisible(k.age < PICKUP_LIFE - 150 || w.tick % 6 < 3);
    }
    for (const pr of w.projectiles) {
      // Each has a shadow on the ground under it, which shows its lane.
      image(-pr.id, 'shadow')
        .setPosition(Math.round(pr.x), Math.round(pr.y) + 3)
        .setScale(pr.kind === 'barrel' ? 0.9 : 0.35)
        .setAlpha(0.6)
        .setDepth(pr.y - 0.5);
      if (pr.kind === 'barrel') {
        // The barrel fills the lower two thirds of its frame; it turns around its middle.
        image(pr.id, 'barrel', 0.66)
          .setPosition(Math.round(pr.x), Math.round(pr.y) - 14)
          .setAngle(pr.age * 9 * Math.sign(pr.vx))
          .setDepth(pr.y);
      } else {
        image(pr.id, 'bottle')
          .setFrame(Math.floor(pr.age / 4) % 4)
          .setFlipX(pr.vx < 0)
          .setPosition(Math.round(pr.x), Math.round(pr.y - pr.z))
          .setDepth(pr.y);
      }
    }
    for (const [id, img] of this.objects) {
      if (!live.has(id)) {
        img.destroy();
        this.objects.delete(id);
      }
    }
    const amp = this.shake > 4 ? 2 : this.shake > 0 ? 1 : 0;
    const cam = this.cameras.main;
    cam.scrollX = Math.round(w.camX) + (this.shake % 2 ? amp : -amp);
    cam.scrollY = this.shake % 4 < 2 ? 0 : amp;
    this.hud.sync(w);
    if (this.debug) this.drawDebug();
  }

  private drawDebug(): void {
    const g = this.debug!;
    g.clear();
    for (const f of this.world.fighters) {
      const hurt = worldBox(f, f.def.hurtbox);
      g.lineStyle(1, f.hittable ? 0x40ff80 : 0x808080);
      g.strokeRect(hurt.x0, f.y - hurt.z1, hurt.x1 - hurt.x0, hurt.z1 - hurt.z0);
      const box = activeHitbox(f);
      if (box) {
        const hit = worldBox(f, box);
        g.lineStyle(1, 0xff3030);
        g.strokeRect(hit.x0, f.y - hit.z1, hit.x1 - hit.x0, hit.z1 - hit.z0);
      }
    }
  }
}

