import Phaser from 'phaser';
import {
  ARENA, STARTUP, SWING, attackRange, sectOf, skillOf,
  type Fighter, type GameEvent, type Match, type MoveDef, type Seat, type SkillDef, type Slot,
} from '../../../shared/combat.ts';
import { Net } from '../net';
import type { Driver } from './driver';
import { pupu, slashFlash, stone } from '../toy/effects';
import { INK, Toy } from '../toy/Toy';

const PX = 110; // 每米多少像素
const CX = 640;
const GROUND = 450;
const sx = (m: number) => CX + m * PX;
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
const FONT = 'serif';

type ButtonId = Slot | 'left' | 'right';
interface Button {
  id: ButtonId;
  rect: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
}

export class BattleScene extends Phaser.Scene {
  private seat!: Seat;
  private driver!: Driver;
  private g!: Phaser.GameObjects.Graphics;
  private toys!: [Toy, Toy];
  private hudTitle: Phaser.GameObjects.Text[] = [];
  private hudStatus: Phaser.GameObjects.Text[] = [];
  private hudNums: Phaser.GameObjects.Text[] = [];
  private castLabel: Phaser.GameObjects.Text[] = [];
  private buttons: Button[] = [];
  private info!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Text;
  private held = { left: false, right: false, keyLeft: false, keyRight: false };
  private sentDir = 0;
  private walk = [0, 0];
  private failTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('battle');
  }

  /** 不给 driver 就连对战服务器；故事模式传进 LocalDriver */
  init(data: { seat: Seat; driver?: Driver }) {
    this.seat = data.seat;
    this.driver = data.driver ?? new Net(this.seat);
  }

  /** 这个座位用的武学配置。联网时还没收到状态，就先按门派算 */
  private kit(seat: Seat) {
    return sectOf(this.driver.match?.fighters[seat] ?? ({ sect: seat } as Fighter));
  }

  create() {
    // 标签页在后台时不放特效，不然切回来会一下子全冒出来
    this.driver.onState = (m) => {
      if (!document.hidden) m.events.forEach((e) => this.onEvent(e, m));
    };
    this.g = this.add.graphics();
    this.toys = [
      new Toy(sx(-2), 1, this.kit(0).color, GROUND),
      new Toy(sx(2), -1, this.kit(1).color, GROUND),
    ];

    for (const seat of [0, 1] as const) {
      const x = seat === 0 ? 24 : 1280 - 24 - 380;
      const sect = this.kit(seat);
      const who = seat === this.seat ? '（你）' : '（对手）';
      this.hudTitle.push(this.add.text(x, 16, `${sect.name}${sect.neigong ? ` · ${sect.neigong.name}` : ''}${who}`, { fontFamily: FONT, fontSize: '20px', color: css(sect.color) }));
      this.hudNums.push(this.add.text(x, 44, '', { fontFamily: FONT, fontSize: '13px', color: '#3a3328', lineSpacing: 5 }));
      this.hudStatus.push(this.add.text(x, 112, '', { fontFamily: FONT, fontSize: '15px', color: '#3a3328' }));
      this.castLabel.push(this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#3a3328' }).setOrigin(0.5, 1));
    }

    this.createButtons();
    this.info = this.add.text(CX, 556, this.driver.intro ?? '', { fontFamily: FONT, fontSize: '16px', color: '#5a5040', align: 'center' }).setOrigin(0.5, 0);
    this.overlay = this.add
      .text(CX, 260, '', { fontFamily: FONT, fontSize: '30px', color: '#3a3328', align: 'center', backgroundColor: '#efe8dbdd', padding: { x: 24, y: 14 } })
      .setOrigin(0.5)
      .setDepth(50)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => (this.driver.replaced ? this.driver.takeOver() : this.driver.reset()));

    const kb = this.input.keyboard!;
    const key = (code: string, down: () => void, up?: () => void) => {
      kb.on(`keydown-${code}`, down);
      if (up) kb.on(`keyup-${code}`, up);
    };
    key('LEFT', () => (this.held.keyLeft = true), () => (this.held.keyLeft = false));
    key('A', () => (this.held.keyLeft = true), () => (this.held.keyLeft = false));
    key('RIGHT', () => (this.held.keyRight = true), () => (this.held.keyRight = false));
    key('D', () => (this.held.keyRight = true), () => (this.held.keyRight = false));
    key('Q', () => this.driver.cast('shenfa'));
    key('ONE', () => this.driver.cast('move0'));
    key('TWO', () => this.driver.cast('move1'));
    key('THREE', () => this.driver.cast('move2'));
    key('E', () => this.driver.cast('huti'));
    key('R', () => this.driver.reset());
    // 切走窗口时松开所有方向
    const release = () => Object.assign(this.held, { left: false, right: false, keyLeft: false, keyRight: false });
    this.game.events.on('blur', release);
    this.events.once('shutdown', () => this.game.events.off('blur', release));
  }

  // ---------- 按钮 ----------

  private createButtons() {
    // 没学的格子不放按钮
    const all: ButtonId[] = ['left', 'shenfa', 'move0', 'move1', 'move2', 'huti', 'right'];
    const ids = all.filter((id) => id === 'left' || id === 'right' || skillOf(this.me(), id));
    const keys: Record<ButtonId, string> = { left: '← / A', shenfa: 'Q', move0: '1', move1: '2', move2: '3', huti: 'E', right: '→ / D' };
    const w = 156, h = 74, gap = 12;
    const x0 = CX - (ids.length * w + (ids.length - 1) * gap) / 2 + w / 2;
    ids.forEach((id, i) => {
      const x = x0 + i * (w + gap);
      const y = 640;
      const rect = this.add.rectangle(x, y, w, h, 0xf4ecdc).setStrokeStyle(2, INK).setInteractive({ useHandCursor: true });
      const title = this.add.text(x, y - 14, '', { fontFamily: FONT, fontSize: '18px', color: '#2b241c' }).setOrigin(0.5);
      const sub = this.add.text(x, y + 16, '', { fontFamily: FONT, fontSize: '13px', color: '#7a6e5c' }).setOrigin(0.5);
      this.add.text(x - w / 2 + 6, y - h / 2 + 4, keys[id], { fontFamily: FONT, fontSize: '11px', color: '#9a8f7e' });
      const btn: Button = { id, rect, title, sub };
      this.buttons.push(btn);

      if (id === 'left' || id === 'right') {
        title.setText(id === 'left' ? '◀ 左' : '右 ▶');
        sub.setText('按住移动');
        const set = (v: boolean) => (this.held[id] = v);
        rect.on('pointerdown', () => set(true)).on('pointerup', () => set(false)).on('pointerout', () => set(false));
      } else {
        const def = skillOf(this.me(), id)!;
        title.setText(def.name);
        sub.setText(costText(def));
        rect.on('pointerdown', () => this.driver.cast(id));
        rect.on('pointerover', () => this.info.setText(describe(def, id)).setColor('#5a5040'));
        rect.on('pointerout', () => this.info.setText(''));
      }
    });
  }

  private me(): Fighter {
    return this.driver?.match?.fighters[this.seat] ?? ({ sect: this.seat } as Fighter);
  }

  private updateButtons(m: Match) {
    const f = m.fighters[this.seat];
    for (const b of this.buttons) {
      let enabled = true;
      let active = false;
      if (b.id === 'left' || b.id === 'right') {
        active = this.held[b.id] || (b.id === 'left' ? this.held.keyLeft : this.held.keyRight);
      } else {
        const def = skillOf(f, b.id)!;
        enabled = f.neili >= def.neili && f.shenfa >= def.shenfa && !f.casting && !f.dash;
        if (b.id === 'huti') active = f.hutiBuff > 0;
        else if (b.id === 'shenfa') active = f.shenfaBuff > 0 || f.casting?.slot === 'shenfa' || !!f.dash;
        else active = f.casting?.slot === b.id || f.queued?.move === Number(b.id.slice(4));
        if (active && b.id === 'huti') b.sub.setText(`剩 ${f.hutiBuff.toFixed(1)} 秒`);
        else if (active && b.id === 'shenfa' && f.shenfaBuff > 0) b.sub.setText(`剩 ${f.shenfaBuff.toFixed(1)} 秒`);
        else if (active && f.queued && b.id !== 'shenfa' && b.id !== 'huti') b.sub.setText(`还剩 ${f.queued.left} 下`);
        else b.sub.setText(costText(def));
      }
      const color = this.kit(this.seat).color;
      b.rect.setFillStyle(active ? 0xe3d6bd : 0xf4ecdc).setStrokeStyle(active ? 4 : 2, active ? color : INK);
      b.rect.setAlpha(enabled ? 1 : 0.45);
      b.title.setAlpha(enabled ? 1 : 0.45);
    }
  }

  // ---------- 每帧 ----------

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    this.driver.tick?.(dt);
    const dir = (this.held.right || this.held.keyRight ? 1 : 0) - (this.held.left || this.held.keyLeft ? 1 : 0);
    if (dir !== this.sentDir) {
      this.sentDir = dir;
      this.driver.dir(dir);
    }

    const m = this.driver.match;
    const g = this.g;
    g.clear();
    this.drawGround(g);

    const offline = this.offlineText();
    if (!m || offline) {
      this.overlay.setText(offline ?? '').setVisible(!!offline);
      if (m) this.drawHud(g, m);
      this.toys.forEach((t) => t.draw(g, _time / 1000));
      return;
    }

    for (const seat of [0, 1] as const) {
      const f = m.fighters[seat];
      const o = m.fighters[1 - seat];
      const toy = this.toys[seat];
      const target = sx(f.x);
      const prev = toy.x;
      toy.x += (target - toy.x) * Math.min(1, dt * 18);
      toy.facing = o.x >= f.x ? 1 : -1;
      // 走路一蹦一蹦，冲刺蹦得更高
      const speed = Math.abs(toy.x - prev) / Math.max(dt, 1e-3);
      if (speed > 30) {
        this.walk[seat] += dt * (f.dash ? 10 : 11);
        toy.hop = Math.abs(Math.sin(this.walk[seat] * Math.PI)) * (f.dash ? 16 : 7);
        toy.flutter = 1;
      } else {
        toy.hop *= 0.7;
        toy.flutter *= 0.85;
      }
      this.drawRange(g, f, o, seat === this.seat);
    }

    const t = _time / 1000;
    this.toys.forEach((toy) => toy.draw(g, t));
    for (const seat of [0, 1] as const) this.drawCasting(g, m.fighters[seat], seat);
    this.drawHud(g, m);
    this.updateButtons(m);

    if (!this.driver.online[1 - this.seat]) {
      this.overlay.setText(`等待对手进入…\n对手打开 http://${location.host}/${this.seat === 0 ? 2 : 1}`).setVisible(true);
    } else if (m.winner !== null) {
      this.overlay.setText(this.driver.endText ?? `${m.winner === this.seat ? '胜利' : '败北'}\n点这里或按 R 再来一局`).setVisible(true);
    } else this.overlay.setVisible(false);
  }

  /** 没连上服务器时要显示的提示，连上了返回 null */
  private offlineText() {
    if (this.driver.replaced) return '这一边已经在别的页面打开了\n点这里改在本页继续';
    if (!this.driver.connected) return '连不上对战服务器，正在重连…\n（npm run dev 会同时启动服务器）';
    return null;
  }

  private drawGround(g: Phaser.GameObjects.Graphics) {
    g.lineStyle(2, INK, 0.35).lineBetween(sx(-ARENA) - 20, GROUND + 4, sx(ARENA) + 20, GROUND + 4);
    // 场地两头的边界
    g.lineStyle(3, INK, 0.5).lineBetween(sx(-ARENA) - 20, GROUND + 4, sx(-ARENA) - 20, GROUND - 30);
    g.lineBetween(sx(ARENA) + 20, GROUND + 4, sx(ARENA) + 20, GROUND - 30);
    for (let i = -ARENA * 2; i <= ARENA * 2; i++) {
      g.lineStyle(2, INK, 0.22).lineBetween(sx(i / 2), GROUND + 4, sx(i / 2), GROUND + (i % 2 ? 9 : 14));
    }
  }

  /** 脚下画出当前攻击范围：对方在范围里就是实色 */
  private drawRange(g: Phaser.GameObjects.Graphics, f: Fighter, o: Fighter, mine: boolean) {
    const { min, max } = attackRange(f);
    const d = Math.abs(f.x - o.x);
    const inRange = d >= min && d <= max;
    const dir = o.x >= f.x ? 1 : -1;
    const x0 = sx(f.x + dir * min);
    const x1 = sx(f.x + dir * max);
    const y = GROUND + (mine ? 22 : 34);
    const color = sectOf(f).color;
    g.lineStyle(mine ? 6 : 4, color, inRange ? 0.85 : 0.25).lineBetween(x0, y, x1, y);
    g.fillStyle(color, inRange ? 0.9 : 0.35).fillCircle(x1, y, mine ? 4 : 3);
  }

  /** 起手进度：头顶一圈 */
  private drawCasting(g: Phaser.GameObjects.Graphics, f: Fighter, seat: Seat) {
    const toy = this.toys[seat];
    const label = this.castLabel[seat];
    const headY = toy.chestY() - 105;
    if (f.casting) {
      const p = 1 - f.casting.left / STARTUP;
      g.lineStyle(4, sectOf(f).color, 0.9);
      g.beginPath();
      g.arc(toy.x, headY, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(p, 0, 1));
      g.strokePath();
      label.setText(skillOf(f, f.casting.slot)!.name).setPosition(toy.x, headY - 20).setColor(css(sectOf(f).color)).setVisible(true);
    } else label.setVisible(false);
  }

  private drawHud(g: Phaser.GameObjects.Graphics, m: Match) {
    for (const seat of [0, 1] as const) {
      const f = m.fighters[seat];
      const x = seat === 0 ? 24 : 1280 - 24 - 380;
      const bar = (y: number, h: number, v: number, max: number, color: number) => {
        g.fillStyle(INK, 0.12).fillRect(x + 52, y, 320, h);
        g.fillStyle(color, 1).fillRect(x + 52, y, 320 * Phaser.Math.Clamp(v / max, 0, 1), h);
        g.lineStyle(1.5, INK, 0.6).strokeRect(x + 52, y, 320, h);
      };
      bar(46, 14, f.hp, f.maxHp, 0xa8402e);
      bar(70, 9, f.neili, 100, 0x3f6fa8);
      bar(89, 9, f.shenfa, 100, 0x5f8a4a);
      this.hudNums[seat].setText([`血 ${Math.ceil(f.hp)}`, `内力 ${f.neili}`, `身法 ${f.shenfa}`]);

      const parts: string[] = [];
      if (f.pozhan) parts.push(`破绽 ${f.pozhan}`);
      if (f.handu) parts.push(`寒毒 ${f.handu}`);
      if (f.hutiBuff > 0) parts.push(`${sectOf(f).huti!.name} ${f.hutiBuff.toFixed(0)}s`);
      if (f.shenfaBuff > 0) parts.push(`${sectOf(f).shenfa!.name} ${f.shenfaBuff.toFixed(0)}s`);
      if (f.queued) parts.push(`${sectOf(f).moves[f.queued.move].name} ×${f.queued.left}`);
      this.hudStatus[seat].setText(parts.join('   '));
    }
  }

  // ---------- 事件 → 动作和特效 ----------

  private onEvent(e: GameEvent, m: Match) {
    const me = this.toys[e.seat];
    const other = this.toys[e.seat === 0 ? 1 : 0];
    const f = me.facing;
    switch (e.t) {
      case 'swing': {
        this.tweens.add({ targets: me, lean: -0.25, squash: 0.92, duration: SWING * 700, ease: 'Quad.easeOut' });
        if (e.kind === 'hidden') {
          const to = m.fighters[e.seat === 0 ? 1 : 0];
          stone(this, { x: me.x + f * 24, y: me.chestY() }, { x: sx(to.x) - f * 26, y: other.chestY() }, GROUND, () => {}, SWING * 1000);
        }
        break;
      }
      case 'hit': {
        this.strike(me, e.kind);
        const hx = other.x - f * 30;
        const hy = other.chestY();
        if (e.kind === 'fist') pupu(this, hx, hy, f);
        else if (e.kind === 'sword') {
          slashFlash(this, other.x - f * 50, hy, f, Phaser.Math.FloatBetween(-0.4, 0.5));
          this.cameras.main.shake(70, 0.0025);
        } else pupu(this, hx, hy, f, 0.6);
        this.hitReact(other);
        this.floatText(other.x, hy - 90, `-${e.dmg}`, e.move ? '#a8402e' : '#3a3328', e.move ? 26 : 20);
        break;
      }
      case 'miss':
        this.strike(me, e.kind);
        this.floatText(other.x, other.chestY() - 90, '躲开', '#7a6e5c', 18);
        break;
      case 'cast': {
        this.floatText(me.x, me.chestY() - 140, e.name, css(this.kit(e.seat).color), 22);
        if (e.slot === 'huti' || (e.slot === 'shenfa' && (this.kit(e.seat).shenfa?.duration ?? 0) > 0)) this.ring(me, this.kit(e.seat).color);
        break;
      }
      case 'dash':
        pupu(this, me.x - f * 20, GROUND - 6, -f, 0.5);
        break;
      case 'dot':
        this.floatText(me.x + 30, me.chestY() - 60, `-${e.dmg}`, '#3f7f8f', 16);
        break;
      case 'self':
        this.floatText(me.x - 30, me.chestY() - 60, `${e.msg} -${e.dmg}`, '#a8402e', 16);
        break;
      case 'fail':
        if (e.seat === this.seat) {
          this.info.setText(e.msg).setColor('#a8402e');
          this.failTimer?.remove();
          this.failTimer = this.time.delayedCall(1500, () => this.info.text === e.msg && this.info.setText(''));
        }
        break;
      case 'ko':
        break;
    }
  }

  private strike(toy: Toy, kind: string) {
    this.tweens.add({
      targets: toy,
      lean: 0.35,
      squash: 1.06,
      reach: kind === 'fist' ? 1 : 0,
      duration: 70,
      ease: 'Quad.easeIn',
      onComplete: () => this.tweens.add({ targets: toy, lean: 0, squash: 1, reach: 0, duration: 180 }),
    });
  }

  private hitReact(toy: Toy) {
    toy.flash = 1;
    toy.squash = 0.86;
    this.tweens.add({ targets: toy, flash: 0, duration: 200 });
    this.tweens.add({ targets: toy, squash: 1, duration: 260, ease: 'Back.easeOut' });
  }

  private ring(toy: Toy, color: number) {
    const c = this.add.circle(toy.x, toy.chestY() - 20, 50).setStrokeStyle(4, color).setDepth(5);
    this.tweens.add({ targets: c, scale: 1.6, alpha: 0, duration: 500, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
  }

  private floatText(x: number, y: number, text: string, color: string, size: number) {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#efe8db', strokeThickness: 4 }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }
}

function costText(def: SkillDef | MoveDef) {
  const parts = [];
  if (def.neili) parts.push(`内力 ${def.neili}`);
  if (def.shenfa) parts.push(`身法 ${def.shenfa}`);
  return parts.join(' · ');
}

function describe(def: SkillDef | MoveDef, slot: Slot) {
  const head = `${def.name}（${def.tier}）`;
  if ('hits' in def) {
    return `${head}  ${def.hits}×${Math.round(def.power * 100)}% · ${def.min}~${def.max}m · ${costText(def)}\n${def.desc}`;
  }
  const kind = slot === 'huti' ? '护体' : '身法';
  return `${head}  ${kind} · ${costText(def)}\n${def.desc}`;
}
