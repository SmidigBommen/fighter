import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Intro } from './scenes/Intro';
import { Stage } from './scenes/Stage';
import { Title } from './scenes/Title';
import { VIEW_H, VIEW_W } from './sim/types';

/** Largest whole-number scale that fits the window, so pixels stay square. */
function integerZoom(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#08080c',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, zoom: integerZoom(), autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Intro, Title, Stage, GameOver],
});

window.addEventListener('resize', () => game.scale.setZoom(integerZoom()));

if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
