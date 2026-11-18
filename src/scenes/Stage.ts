import Phaser from 'phaser';
import { stage1 } from '../data/stage1';
import { activeHitbox, worldBox } from '../sim/combat';
import { PICKUPS, PICKUP_LIFE } from '../sim/objects';
import { TICK_RATE } from '../sim/types';
import type { Intent } from '../sim/types';
import { World } from '../sim/world';
import { FighterView } from '../view/FighterView';
import { Hud } from '../view/Hud';

const STEP_MS = 1000 / TICK_RATE;
/** After a long stall, drop the backlog instead of fast-forwarding the game. */
const MAX_BACKLOG_MS = 100;

interface Spark {
  img: Phaser.GameObjects.Image;
  age: number;
}

export class Stage extends Phaser.Scene {
  private world!: World;
  private views = new Map<number, FighterView>();
  /** Barrel and pickup images by object id. */
  private objects = new Map<number, Phaser.GameObjects.Image>();
  private hud!: Hud;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private acc = 0;
  private attackPressed = false;
  private jumpPressed = false;
  private shake = 0;
  private sparks: Spark[] = [];
  private endTimer = 0;
  private debug?: Phaser.GameObjects.Graphics;

  constructor() {
    super('Stage');
  }

  create(): void {
    this.world = new World(stage1, Date.now() & 0xffff);
    this.views.clear();
    this.objects.clear();
    this.sparks = [];
    this.acc = 0;
    this.shake = 0;
    this.endTimer = 0;
    this.attackPressed = this.jumpPressed = false;

    this.add.image(0, 0, 'stage1').setOrigin(0).setDepth(-10);
    this.add.image(0, 0, 'stage1_fore').setOrigin(0).setDepth(10000);
    for (const p of stage1.props) this.add.image(p.x, p.y, p.key).setOrigin(0.5, 1).setDepth(p.y);
    this.hud = new Hud(this);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,Z,X,J,K,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    for (const k of ['Z', 'J']) this.keys[k].on('down', () => (this.attackPressed = true));
    for (const k of ['X', 'K', 'SPACE']) this.keys[k].on('down', () => (this.jumpPressed = true));
    // H toggles hitbox and hurtbox outlines for tuning frame data.
    kb.on('keydown-H', () => {
      if (this.debug) {
        this.debug.destroy();
        this.debug = undefined;
      } else {
        this.debug = this.add.graphics().setDepth(15000);
      }
    });

    const music = this.sound.add('music_stage1', { loop: true, volume: 0.35 });
    music.play();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      music.destroy();
      this.debug = undefined;
    });

    if (import.meta.env.DEV) (window as unknown as { world: World }).world = this.world;
  }

  private readInput(): Intent {
    const k = this.keys;
    const intent: Intent = {
      mx: (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0),
      my: (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0),
      attack: this.attackPressed,
      jump: this.jumpPressed,
    };
    // A press is an edge: it is handed to exactly one simulation tick.
    this.attackPressed = this.jumpPressed = false;
    return intent;
  }

  update(_time: number, delta: number): void {
    this.acc = Math.min(this.acc + delta, MAX_BACKLOG_MS);
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      this.world.step(this.readInput());
      this.handleEvents();
      this.tickEffects();
    }
    this.render();
  }

  private handleEvents(): void {
    for (const e of this.world.events) {
      if (e.type === 'hit') {
        const key = e.heavy ? 'hit_heavy' : this.world.tick % 2 ? 'hit_light' : 'hit_mid';
        this.sound.play(key, { volume: e.heavy ? 0.9 : 0.6 });
        this.shake = Math.max(this.shake, e.heavy ? 8 : 3);
        const img = this.add
          .image(Math.round(e.x), Math.round(e.y - e.z), 'spark', 0)
          .setDepth(e.y + 1)
          .setScale(e.heavy ? 1.5 : 1);
        this.sparks.push({ img, age: 0 });
      } else if (e.type === 'break') {
        this.sound.play('thud', { volume: 0.8 });
        this.shake = Math.max(this.shake, 5);
      } else if (e.type === 'pickup') {
        this.sound.play('pickup', { volume: 0.6 });
      } else if (e.type === 'land') {
        this.sound.play('thud', { volume: 0.5 });
        this.shake = Math.max(this.shake, 4);
      }
    }
  }

  private tickEffects(): void {
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
    const w = this.world;
    if (w.status !== 'playing' && ++this.endTimer > 150) {
      this.scene.start('GameOver', { cleared: w.status === 'cleared', score: w.score });
    }
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
    const image = (id: number, key: string) => {
      live.add(id);
      let img = this.objects.get(id);
      if (!img) this.objects.set(id, (img = this.add.image(0, 0, key).setOrigin(0.5, 1)));
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
