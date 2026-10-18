import Phaser from 'phaser';
import { SECTS, type Seat } from '../../shared/combat.ts';
import { BattleScene } from './battle/BattleScene';

// /1 是武当（座位 0），/2 是界青（座位 1）
const path = location.pathname.replace(/\/+$/, '');
const seat: Seat | null = path === '/1' ? 0 : path === '/2' ? 1 : null;

class LobbyScene extends Phaser.Scene {
  constructor() {
    super('lobby');
  }

  create() {
    this.add.text(640, 220, '选一边进入对战', { fontFamily: 'serif', fontSize: '32px', color: '#3a3328' }).setOrigin(0.5);
    SECTS.forEach((sect, i) => {
      this.add
        .text(640 + (i === 0 ? -160 : 160), 340, `${sect.name}\n/${i + 1}`, {
          fontFamily: 'serif', fontSize: '30px', color: '#' + sect.color.toString(16).padStart(6, '0'), align: 'center',
          backgroundColor: '#f4ecdc', padding: { x: 36, y: 18 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => (location.href = `/${i + 1}`));
    });
  }
}

document.title = seat === null ? '对战' : `${SECTS[seat].name} · 对战`;

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#e7dfd1',
  fps: { target: 60, limit: 60 },
  antialias: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

if (seat === null) game.scene.add('lobby', LobbyScene, true);
else game.scene.add('battle', BattleScene, true, { seat });
