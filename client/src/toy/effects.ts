import Phaser from 'phaser';
import { INK } from './Toy';

const { Between, FloatBetween } = Phaser.Math;
const PUFF = 0xfffaf0;
const GOLD = 0xf2c14e;

/** 拳掌命中：中间一个白色炸点，周围几团噗噗冒出来的小烟，加三道短线 */
export function pupu(scene: Phaser.Scene, x: number, y: number, dir: number, size = 1) {
  const burst = scene.add.star(x, y, 8, 7 * size, 18 * size, 0xffffff).setStrokeStyle(2.5, INK).setDepth(12).setScale(0.5);
  scene.tweens.add({ targets: burst, scale: 1.3, alpha: 0, angle: 20, duration: 160, ease: 'Quad.easeOut', onComplete: () => burst.destroy() });
  for (let i = 0; i < 5; i++) {
    const dur = Between(300, 420);
    const c = scene.add
      .circle(x + Between(-6, 6) * size, y + Between(-12, 12) * size, Between(9, 14) * size, PUFF)
      .setStrokeStyle(3, INK)
      .setScale(0.4)
      .setDepth(10);
    scene.tweens.add({
      targets: c,
      scale: FloatBetween(1.4, 2),
      x: c.x + dir * Between(10, 30) * size,
      y: c.y + Between(-20, 4) * size,
      duration: dur,
      ease: 'Cubic.easeOut',
    });
    scene.tweens.add({ targets: c, alpha: 0, delay: dur * 0.45, duration: dur * 0.55, onComplete: () => c.destroy() });
  }
  const g = scene.add.graphics({ x, y }).setDepth(11);
  g.lineStyle(3, INK, 1);
  for (const a of [-0.7, 0, 0.7]) {
    const ang = (dir > 0 ? 0 : Math.PI) + a; // 顺着出拳方向往前炸开
    g.lineBetween(Math.cos(ang) * 16 * size, Math.sin(ang) * 16 * size, Math.cos(ang) * 28 * size, Math.sin(ang) * 28 * size);
  }
  scene.tweens.add({ targets: g, scale: 1.4, alpha: 0, duration: 200, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
}

/** 刀剑命中：一道月牙闪光，一条横贯的亮线，几粒金星 */
export function slashFlash(scene: Phaser.Scene, x: number, y: number, dir: number, tilt: number) {
  const g = scene.add.graphics({ x, y }).setDepth(10);
  const R = 78;
  const outer: Phaser.Math.Vector2[] = [];
  const inner: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const a = -1.1 + 2.2 * u;
    const thick = 18 * Math.sin(Math.PI * u);
    outer.push(new Phaser.Math.Vector2(Math.cos(a) * R, Math.sin(a) * R));
    inner.unshift(new Phaser.Math.Vector2(Math.cos(a) * (R - thick), Math.sin(a) * (R - thick)));
  }
  const crescent = outer.concat(inner);
  // 外圈一层淡金色光晕，月牙本体白芯金边
  g.fillStyle(GOLD, 0.35).fillPoints(crescent.map((p) => p.clone().scale(1.12)), true);
  g.fillStyle(0xffffff, 1).fillPoints(crescent, true);
  g.lineStyle(3, GOLD, 1).strokePoints(crescent, true);
  g.setScale(dir * 0.7, 0.7).setRotation(tilt * dir);
  scene.tweens.add({
    targets: g,
    scaleX: dir * 1.05,
    scaleY: 1.05,
    alpha: 0,
    duration: 220,
    ease: 'Cubic.easeOut',
    onComplete: () => g.destroy(),
  });

  const streak = scene.add.rectangle(x + dir * 100, y, 150, 5, 0xffffff).setStrokeStyle(1.5, GOLD).setRotation(tilt * dir).setDepth(11);
  scene.tweens.add({ targets: streak, scaleY: 0.2, alpha: 0, duration: 140, onComplete: () => streak.destroy() });

  for (let i = 0; i < 5; i++) {
    const s = scene.add.star(x + dir * 60, y, 4, 2, 6, GOLD).setDepth(11);
    const a = FloatBetween(-1.2, 1.2) + (dir > 0 ? 0 : Math.PI);
    const d = Between(30, 70);
    scene.tweens.add({
      targets: s,
      x: s.x + Math.cos(a) * d,
      y: s.y + Math.sin(a) * d,
      angle: 180,
      alpha: 0,
      duration: Between(250, 400),
      ease: 'Quad.easeOut',
      onComplete: () => s.destroy(),
    });
  }
}

/** 暗器：一颗小石子划弧线飞过去，命中后弹开落地 */
export function stone(
  scene: Phaser.Scene,
  from: { x: number; y: number },
  to: { x: number; y: number },
  groundY: number,
  onHit: () => void,
  duration?: number,
) {
  const s = scene.add.circle(from.x, from.y, 5, 0x8a8172).setStrokeStyle(2, INK).setDepth(10);
  const dist = Math.abs(to.x - from.x);
  const arc = dist * 0.1;
  const dir = Math.sign(to.x - from.x);
  const p = { t: 0 };
  let frame = 0;
  scene.tweens.add({
    targets: p,
    t: 1,
    duration: duration ?? dist / 1.1, // 默认约 1100 像素每秒
    ease: 'Linear',
    onUpdate: () => {
      s.x = from.x + (to.x - from.x) * p.t;
      s.y = from.y + (to.y - from.y) * p.t - arc * 4 * p.t * (1 - p.t);
      s.angle += 25;
      if (frame++ % 2 === 0) {
        const dot = scene.add.circle(s.x, s.y, 2.5, INK, 0.35).setDepth(9);
        scene.tweens.add({ targets: dot, alpha: 0, scale: 0.3, duration: 180, onComplete: () => dot.destroy() });
      }
    },
    onComplete: () => {
      onHit();
      // 弹回来一点，再掉到地上淡出
      scene.tweens.add({ targets: s, x: s.x - dir * 34, duration: 420, ease: 'Quad.easeOut' });
      scene.tweens.add({
        targets: s,
        y: { from: s.y, to: s.y - 22 },
        duration: 140,
        ease: 'Quad.easeOut',
        onComplete: () =>
          scene.tweens.add({
            targets: s,
            y: groundY - 4,
            duration: 280,
            ease: 'Bounce.easeOut',
            onComplete: () => scene.tweens.add({ targets: s, alpha: 0, delay: 300, duration: 300, onComplete: () => s.destroy() }),
          }),
      });
    },
  });
}
