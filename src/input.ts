import Phaser from 'phaser';
import type { Intent } from './sim/types';

type Action = 'attack' | 'jump' | 'special' | 'confirm' | 'back' | 'pause' | 'up' | 'down' | 'left' | 'right';

/** Two presses of the same direction within this time start a run. */
const DOUBLE_TAP_MS = 280;
const STICK_DEADZONE = 0.45;

const KEY_ACTIONS: Record<string, Action[]> = {
  Z: ['attack', 'confirm'],
  J: ['attack', 'confirm'],
  X: ['jump'],
  K: ['jump'],
  SPACE: ['jump'],
  C: ['special'],
  L: ['special'],
  ENTER: ['confirm', 'pause'],
  ESC: ['back', 'pause'],
  P: ['pause'],
  UP: ['up'],
  W: ['up'],
  DOWN: ['down'],
  S: ['down'],
  LEFT: ['left'],
  A: ['left'],
  RIGHT: ['right'],
  D: ['right'],
};

/** Standard-mapping gamepad buttons. */
const PAD_ACTIONS: Record<number, Action[]> = {
  0: ['jump', 'confirm'],
  2: ['attack', 'confirm'],
  1: ['special', 'back'],
  3: ['special'],
  9: ['pause', 'confirm'],
};
const PAD_RUN = [5, 7];

/**
 * Keyboard and gamepad as one input. Presses are edges: each is handed out once,
 * by take() in menus or by intent() to exactly one simulation tick.
 */
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private pressed = new Set<Action>();
  private padDown = new Set<string>();
  private padX = 0;
  private padY = 0;
  private padRun = false;
  private lastTap = { dir: 0, time: -1e9 };
  private runDir = 0;

  /** keyboard false: gamepad only, for a scene that reads the keys as text itself. */
  constructor(scene: Phaser.Scene, keyboard = true) {
    const kb = scene.input.keyboard!;
    // enableCapture false: the browser keeps its own handling of these keys.
    this.keys = kb.addKeys([...Object.keys(KEY_ACTIONS), 'SHIFT'].join(','), keyboard) as Record<string, Phaser.Input.Keyboard.Key>;
    if (!keyboard) return;
    for (const [name, actions] of Object.entries(KEY_ACTIONS)) {
      this.keys[name].on('down', () => actions.forEach((a) => this.press(a)));
    }
  }

  private press(action: Action): void {
    this.pressed.add(action);
    if (action !== 'left' && action !== 'right') return;
    const dir = action === 'left' ? -1 : 1;
    const now = performance.now();
    if (this.lastTap.dir === dir && now - this.lastTap.time < DOUBLE_TAP_MS) this.runDir = dir;
    this.lastTap = { dir, time: now };
  }

  /** Reads the gamepads. Call once per frame, before take() or intent(). */
  poll(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const down = new Set<string>();
    let x = 0;
    let y = 0;
    let run = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      pad.buttons.forEach((b, i) => {
        if (!b.pressed) return;
        down.add(`b${i}`);
        if (PAD_RUN.includes(i)) run = true;
      });
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (ax < -STICK_DEADZONE || pad.buttons[14]?.pressed) x = -1;
      if (ax > STICK_DEADZONE || pad.buttons[15]?.pressed) x = 1;
      if (ay < -STICK_DEADZONE || pad.buttons[12]?.pressed) y = -1;
      if (ay > STICK_DEADZONE || pad.buttons[13]?.pressed) y = 1;
    }
    // The stick counts as direction presses too, for menus and the double tap.
    if (x < 0) down.add('left');
    if (x > 0) down.add('right');
    if (y < 0) down.add('up');
    if (y > 0) down.add('down');
    for (const id of down) {
      if (this.padDown.has(id)) continue;
      if (id.startsWith('b')) (PAD_ACTIONS[Number(id.slice(1))] ?? []).forEach((a) => this.press(a));
      else this.press(id as Action);
    }
    this.padDown = down;
    this.padX = x;
    this.padY = y;
    this.padRun = run;
  }

  /** True once per press. */
  take(action: Action): boolean {
    return this.pressed.delete(action);
  }

  /** Forgets presses made so far, so a key held over from the last scene does nothing here. */
  clear(): void {
    this.pressed.clear();
  }

  /** The player's intent for one simulation tick. */
  intent(): Intent {
    const k = this.keys;
    const mx = Math.sign((k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0) + this.padX);
    const my = Math.sign((k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0) + this.padY);
    if (mx !== this.runDir) this.runDir = 0;
    const attack = this.take('attack');
    const jump = this.take('jump');
    // Attack and jump together also give the special, as on a two-button cabinet.
    const special = this.take('special') || (attack && jump);
    for (const a of ['up', 'down', 'left', 'right', 'confirm', 'back'] as const) this.pressed.delete(a);
    return { mx, my, attack: attack && !special, jump: jump && !special, special, run: mx !== 0 && (this.runDir === mx || k.SHIFT.isDown || this.padRun) };
  }
}
