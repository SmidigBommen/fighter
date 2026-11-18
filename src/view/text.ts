import Phaser from 'phaser';

export const FONT = 'font';
const GLYPH_W = 7;
const GLYPH_H = 9;

/** Registers the generated pixel font (assets/game/font.png) as a bitmap font. */
export function registerFont(scene: Phaser.Scene): void {
  const chars = scene.cache.text.get('font_chars') as string;
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'font_img',
    width: GLYPH_W,
    height: GLYPH_H,
    chars,
    charsPerRow: chars.length,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 1,
  });
  scene.cache.bitmapFont.add(FONT, data);
}

export type Label = Phaser.GameObjects.BitmapText;

/**
 * Screen-fixed text. align 0 is left, 0.5 centred, 1 right, relative to x.
 * The origin stays at 0 and x is rounded, because a glyph drawn on a half pixel loses columns.
 */
export function label(scene: Phaser.Scene, x: number, y: number, text: string, align = 0, scale = 1): Label {
  const t = scene.add.bitmapText(x, y, FONT, text).setLetterSpacing(-1).setScale(scale).setScrollFactor(0).setDepth(20000);
  t.setData('anchor', x).setData('align', align);
  return place(t);
}

/** Changes a label's text and keeps its alignment. */
export function setLabel(t: Label, text: string): void {
  if (t.text !== text) place(t.setText(text));
}

function place(t: Label): Label {
  t.x = Math.round((t.getData('anchor') as number) - t.width * (t.getData('align') as number));
  return t;
}
