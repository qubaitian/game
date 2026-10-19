import Phaser from 'phaser';
import { SECTS, type Seat } from '../../shared/combat.ts';
import { FOES, storySetup } from '../../shared/kits.ts';
import { BattleScene } from './battle/BattleScene';
import { LocalDriver } from './battle/LocalDriver';
import { StoryView } from './story/StoryView';

// /1 是武当（座位 0），/2 是界青（座位 1），/story 是单人的故事模式
const path = location.pathname.replace(/\/+$/, '');
const seat: Seat | null = path === '/1' ? 0 : path === '/2' ? 1 : null;
const story = path === '/story';

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
    this.add
      .text(640, 500, '故事：雁口县登记令\n/story', {
        fontFamily: 'serif', fontSize: '24px', color: '#3a3328', align: 'center',
        backgroundColor: '#f4ecdc', padding: { x: 36, y: 14 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => (location.href = '/story'));
  }
}

document.title = story ? '雁口县登记令' : seat === null ? '对战' : `${SECTS[seat].name} · 对战`;

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

if (story) {
  // 每场战斗新建一个对战场景，打赢后删掉，回到故事
  new StoryView(document.body, (foe, skills) => new Promise((resolve) => {
    const driver = new LocalDriver(storySetup(skills, foe), FOES[foe].intro, () => {
      setTimeout(() => {
        game.scene.remove('battle');
        resolve();
      });
    });
    game.scene.add('battle', BattleScene, true, { seat: 0, driver });
  }));
} else if (seat === null) game.scene.add('lobby', LobbyScene, true);
else game.scene.add('battle', BattleScene, true, { seat });
