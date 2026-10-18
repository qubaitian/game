import Phaser from 'phaser';

class MainScene extends Phaser.Scene {
  constructor() {
    super('main');
  }

  create() {
    this.add
      .text(640, 360, '空场景', { fontFamily: 'serif', fontSize: '28px', color: '#3a3328' })
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#e7dfd1',
  fps: { target: 60, limit: 60 },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MainScene],
});
