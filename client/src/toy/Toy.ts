import Phaser from 'phaser';

export const INK = 0x2b241c;
const HEAD = 0xf4ecdc;
const CLOAK_H = 104; // 披风高度（像素）
const HEAD_R = 27;

function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/**
 * 圆脑袋 + 披风的玩具小人，没有手脚。
 * 所有姿态都是几个数字，用 tween 直接改它们，每帧 draw 一次。
 */
export class Toy {
  lean = 0; // 上身前倾，正数朝面向方向
  squash = 1; // <1 压扁，>1 拉长
  hop = 0; // 离地高度（像素）
  reach = 0; // 0~1，小拳头从披风里伸出来的程度
  flash = 0; // 受击闪白 0~1
  flutter = 0; // 披风下摆飘动幅度，移动时变大

  constructor(
    public x: number,
    public facing: 1 | -1,
    readonly color: number,
    readonly ground: number,
  ) {}

  /** 胸口高度，特效和暗器从这里出 */
  chestY() {
    return this.ground - this.hop - CLOAK_H * 0.55 * this.squash;
  }

  /** 小拳头的位置 */
  fistPoint() {
    return { x: this.x + this.facing * (14 + this.lean * 40 * 0.55 + this.reach * 46), y: this.chestY() };
  }

  draw(g: Phaser.GameObjects.Graphics, t: number) {
    const f = this.facing;
    const sy = this.squash;
    const sx = 1 / Math.sqrt(sy);
    const base = this.ground - this.hop;
    const bob = Math.sin(t * 3 + this.x * 0.01) * 1.5;
    // 局部坐标 → 屏幕。ly 向上为负；越往上越受前倾影响
    const pt = (lx: number, ly: number) => {
      const k = Math.min(Math.max(-ly / CLOAK_H, 0), 1.6);
      return new Phaser.Math.Vector2(this.x + lx * f * sx + this.lean * 40 * f * k, base + (ly - bob * k) * sy);
    };

    // 影子：跳得越高越小越淡
    const lift = Math.min(this.hop / 60, 1);
    g.fillStyle(INK, 0.16 * (1 - lift * 0.6));
    g.fillEllipse(this.x, this.ground + 3, 78 * (1 - lift * 0.4), 10 * (1 - lift * 0.4));

    // 披风：脖子窄、下摆宽，两侧是二次曲线，下摆波浪
    const pts: Phaser.Math.Vector2[] = [];
    const side = (s: number, from: number, to: number) => {
      for (let i = 0; i <= 8; i++) {
        const u = from + ((to - from) * i) / 8;
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        pts.push(pt(s * (a * 13 + b * 30 + c * 38), a * -CLOAK_H + b * -CLOAK_H * 0.5 + c * 0));
      }
    };
    side(-1, 0, 1);
    for (let i = 1; i < 8; i++) {
      const lx = -38 + (76 * i) / 8;
      const wave = Math.sin(t * 5 + i * 1.3) * (1.5 + this.flutter * 4);
      pts.push(pt(lx, wave - this.flutter * 3 * (lx * f < 0 ? 1 : 0)));
    }
    side(1, 1, 0);

    const cloak = mix(this.color, 0xffffff, this.flash * 0.55);
    g.fillStyle(cloak, 1);
    g.lineStyle(3, INK, 1);
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);

    // 领口
    const n1 = pt(-15, -CLOAK_H + 3), n2 = pt(15, -CLOAK_H + 3);
    g.lineStyle(3, INK, 1).lineBetween(n1.x, n1.y, n2.x, n2.y);

    // 小拳头
    if (this.reach > 0.02) {
      const p = this.fistPoint();
      g.fillStyle(cloak, 1).fillCircle(p.x, p.y, 9);
      g.lineStyle(3, INK, 1).strokeCircle(p.x, p.y, 9);
    }

    // 脑袋和眼睛
    const h = pt(0, -CLOAK_H - HEAD_R + 7);
    g.fillStyle(mix(HEAD, 0xffffff, this.flash * 0.7), 1).fillCircle(h.x, h.y, HEAD_R);
    g.lineStyle(3, INK, 1).strokeCircle(h.x, h.y, HEAD_R);
    const blink = (t + this.x * 0.003) % 3.7 < 0.12;
    for (const ex of [5, 16]) {
      const x = h.x + f * ex * sx;
      if (blink || this.flash > 0.5) g.lineStyle(2.5, INK, 1).lineBetween(x - 3, h.y - 1, x + 3, h.y - 1);
      else g.fillStyle(INK, 1).fillCircle(x, h.y - 2, 2.8);
    }
  }
}
