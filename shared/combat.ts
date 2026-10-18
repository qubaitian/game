// 对战规则，服务器和客户端共用。
// 服务器每 tick 调用 step() 推进战斗；客户端只用这里的数据表画按钮、算攻击范围。
// 规则依据 design.md 和 skills-wudang.md / skills-jieqing.md。

export const TICK = 1 / 30;
export const ARENA = 5; // 场地 -5m ~ 5m
export const BODY = 0.5; // 两人之间最近的距离，不能穿过对方
export const SWING = 0.35; // 每一下从出手到命中的时间，这段时间里走出范围就躲开了
export const INTERVAL = 1.5; // 平 A 间隔
export const STARTUP = 0.5; // 招式起手
export const DASH_SPEED = 10; // 冲刺速度 m/s
export const MAX_STACK = 10; // 破绽、寒毒的上限

export type WeaponKind = 'fist' | 'sword' | 'hidden';
export type Slot = 'shenfa' | 'move0' | 'move1' | 'move2' | 'huti';
export type Seat = 0 | 1;

export interface MoveDef {
  id: string;
  name: string;
  tier: string;
  kind: WeaponKind;
  hits: number;
  power: number;
  min: number;
  max: number;
  neili: number;
  shenfa: number;
  desc: string;
}

export interface SkillDef {
  id: string;
  name: string;
  tier: string;
  neili: number;
  shenfa: number;
  duration: number; // 0 表示立即生效
  desc: string;
}

export interface SectDef {
  id: string;
  name: string;
  color: number;
  weapon: { name: string; kind: WeaponKind; min: number; max: number };
  speed: number;
  movePower: number; // 内功给招式的威力加成
  neigong: { name: string; tier: string; desc: string };
  shenfa: SkillDef;
  moves: MoveDef[];
  huti: SkillDef;
}

export const SECTS: SectDef[] = [
  {
    id: 'wudang',
    name: '武当',
    color: 0x34466b,
    weapon: { name: '剑', kind: 'sword', min: 0.5, max: 2.5 },
    speed: 1,
    movePower: 0.12,
    neigong: { name: '武当太和功', tier: '简', desc: '武当武学的威力 +12%' },
    shenfa: { id: 'lingyun', name: '凌云飞渡', tier: '简', neili: 0, shenfa: 10, duration: 0, desc: '蓄力 0.5 秒，向按住的方向冲出 3m（没按方向就冲向对方）' },
    moves: [
      { id: 'danjian', name: '武当丹剑', tier: '简', kind: 'sword', hits: 6, power: 1.4, min: 0.5, max: 3, neili: 5, shenfa: 5, desc: '没有额外效果' },
      { id: 'yunshou', name: '太乙云手', tier: '简', kind: 'fist', hits: 6, power: 1.2, min: 0, max: 2.25, neili: 10, shenfa: 0, desc: '每命中 1 次，给对方加 1 层破绽' },
      { id: 'zhuifeng', name: '追风云环掌', tier: '简', kind: 'fist', hits: 6, power: 1.3, min: 0, max: 2, neili: 7, shenfa: 3, desc: '每命中 1 次，回复 1 内力' },
    ],
    huti: { id: 'tiebushan', name: '武当铁布衫', tier: '简', neili: 5, shenfa: 5, duration: 10, desc: '10 秒内受到的伤害 -20%' },
  },
  {
    id: 'jieqing',
    name: '界青',
    color: 0x8c3a2b,
    weapon: { name: '暗器', kind: 'hidden', min: 2, max: 4.5 },
    speed: 1.15,
    movePower: 0,
    neigong: { name: '步天歌', tier: '简', desc: '移动速度 +15%' },
    shenfa: { id: 'baichi', name: '百尺桩', tier: '简', neili: 0, shenfa: 10, duration: 10, desc: '10 秒内最远攻击距离 +1m' },
    moves: [
      { id: 'shijue', name: '界青十诀', tier: '简', kind: 'hidden', hits: 6, power: 1.3, min: 2, max: 5, neili: 5, shenfa: 5, desc: '每命中 2 次，给对方加 1 层破绽' },
      { id: 'zhaiye', name: '摘叶飞花术', tier: '简', kind: 'hidden', hits: 6, power: 1.3, min: 0, max: 5.25, neili: 7, shenfa: 3, desc: '没有最近距离限制，贴身也能打' },
      { id: 'xuanming', name: '玄冥剑气', tier: '中', kind: 'sword', hits: 6, power: 1.2, min: 0.5, max: 3.5, neili: 10, shenfa: 0, desc: '每命中 1 次，给对方加 1 层寒毒' },
    ],
    huti: { id: 'hanbing', name: '寒冰八脉', tier: '简', neili: 10, shenfa: 0, duration: 10, desc: '10 秒内每次被打中，给对方加 1 层寒毒' },
  },
];

export interface Swing {
  left: number;
  move: number; // -1 是平 A
  kind: WeaponKind;
  power: number;
  min: number;
  max: number;
}

export interface Fighter {
  seat: Seat;
  sect: number;
  x: number;
  dir: -1 | 0 | 1; // 玩家按住的方向
  hp: number;
  maxHp: number;
  neili: number;
  shenfa: number;
  atk: number;
  def: number;
  qishi: number;
  atkCd: number;
  swing: Swing | null;
  queued: { move: number; left: number; hits: number } | null; // 接下来几次平 A 换成这一招
  casting: { slot: Slot; left: number } | null; // 起手中
  dash: { dir: number; left: number } | null;
  shenfaBuff: number; // 身法剩余秒数
  hutiBuff: number; // 护体剩余秒数
  pozhan: number;
  handu: number;
  handuClock: number;
}

export type GameEvent =
  | { t: 'swing'; seat: Seat; kind: WeaponKind; move: string | null }
  | { t: 'hit'; seat: Seat; kind: WeaponKind; dmg: number; move: string | null }
  | { t: 'miss'; seat: Seat; kind: WeaponKind }
  | { t: 'cast'; seat: Seat; slot: Slot; name: string }
  | { t: 'dash'; seat: Seat }
  | { t: 'dot'; seat: Seat; dmg: number }
  | { t: 'fail'; seat: Seat; msg: string }
  | { t: 'ko'; seat: Seat };

export interface Match {
  time: number;
  fighters: [Fighter, Fighter];
  winner: Seat | null;
  events: GameEvent[];
}

function newFighter(seat: Seat): Fighter {
  return {
    seat,
    sect: seat,
    x: seat === 0 ? -2 : 2,
    dir: 0,
    hp: 1000,
    maxHp: 1000,
    neili: 100,
    shenfa: 100,
    atk: 100,
    def: 100,
    qishi: 100,
    atkCd: 0,
    swing: null,
    queued: null,
    casting: null,
    dash: null,
    shenfaBuff: 0,
    hutiBuff: 0,
    pozhan: 0,
    handu: 0,
    handuClock: 0,
  };
}

export function createMatch(): Match {
  return { time: 0, fighters: [newFighter(0), newFighter(1)], winner: null, events: [] };
}

export function sectOf(f: Fighter) {
  return SECTS[f.sect];
}

export function skillOf(f: Fighter, slot: Slot): SkillDef | MoveDef {
  const s = sectOf(f);
  if (slot === 'shenfa') return s.shenfa;
  if (slot === 'huti') return s.huti;
  return s.moves[Number(slot.slice(4))];
}

/** 当前这一下的攻击范围：排着招式就用招式的，否则用武器的 */
export function attackRange(f: Fighter) {
  const s = sectOf(f);
  const src = f.queued ? s.moves[f.queued.move] : s.weapon;
  const bonus = s.shenfa.id === 'baichi' && f.shenfaBuff > 0 ? 1 : 0;
  return { min: src.min, max: src.max + bonus };
}

export function distance(m: Match) {
  return Math.abs(m.fighters[0].x - m.fighters[1].x);
}

export function setDir(m: Match, seat: Seat, dir: number) {
  m.fighters[seat].dir = dir > 0 ? 1 : dir < 0 ? -1 : 0;
}

export function cast(m: Match, seat: Seat, slot: Slot) {
  const f = m.fighters[seat];
  if (m.winner !== null) return;
  const fail = (msg: string) => m.events.push({ t: 'fail', seat, msg });
  if (f.casting || f.dash) return fail('正在施展');
  const def = skillOf(f, slot);
  if (f.neili < def.neili) return fail('内力不足');
  if (f.shenfa < def.shenfa) return fail('身法不足');
  f.neili -= def.neili;
  f.shenfa -= def.shenfa;
  m.events.push({ t: 'cast', seat, slot, name: def.name });

  if (slot === 'huti') f.hutiBuff = sectOf(f).huti.duration;
  else if (slot === 'shenfa') {
    if (def.id === 'lingyun') f.casting = { slot, left: 0.5 };
    else f.shenfaBuff = sectOf(f).shenfa.duration;
  } else f.casting = { slot, left: STARTUP };
}

function opponent(m: Match, f: Fighter) {
  return m.fighters[f.seat === 0 ? 1 : 0];
}

/** 移动，不能出场地，也不能穿过对方 */
function moveBy(m: Match, f: Fighter, dx: number) {
  const o = opponent(m, f);
  let x = Math.max(-ARENA, Math.min(ARENA, f.x + dx));
  if (f.x <= o.x) x = Math.min(x, o.x - BODY);
  else x = Math.max(x, o.x + BODY);
  f.x = x;
}

function finishCast(m: Match, f: Fighter) {
  const slot = f.casting!.slot;
  f.casting = null;
  if (slot === 'shenfa') {
    // 凌云飞渡
    const o = opponent(m, f);
    const dir = f.dir !== 0 ? f.dir : Math.sign(o.x - f.x) || 1;
    f.dash = { dir, left: 3 };
    m.events.push({ t: 'dash', seat: f.seat });
  } else {
    f.queued = { move: Number(slot.slice(4)), left: sectOf(f).moves[Number(slot.slice(4))].hits, hits: 0 };
    f.atkCd = 0; // 起手完立刻出第一下
  }
}

function startSwing(m: Match, f: Fighter) {
  const s = sectOf(f);
  const { min, max } = attackRange(f);
  if (f.queued) {
    const mv = s.moves[f.queued.move];
    f.swing = { left: SWING, move: f.queued.move, kind: mv.kind, power: mv.power * (1 + s.movePower), min, max };
    m.events.push({ t: 'swing', seat: f.seat, kind: mv.kind, move: mv.name });
  } else {
    f.swing = { left: SWING, move: -1, kind: s.weapon.kind, power: 1, min, max };
    m.events.push({ t: 'swing', seat: f.seat, kind: s.weapon.kind, move: null });
  }
  f.atkCd = INTERVAL;
}

function damage(m: Match, victim: Fighter, amount: number) {
  victim.hp = Math.max(0, victim.hp - amount);
  if (victim.hp <= 0 && m.winner === null) {
    m.winner = victim.seat === 0 ? 1 : 0;
    m.events.push({ t: 'ko', seat: m.winner });
  }
}

function resolveSwing(m: Match, f: Fighter) {
  const sw = f.swing!;
  f.swing = null;
  const o = opponent(m, f);
  const d = Math.abs(f.x - o.x);
  const s = sectOf(f);
  const mv = sw.move >= 0 ? s.moves[sw.move] : null;

  // 这一招用掉一次
  if (mv && f.queued && f.queued.move === sw.move) {
    f.queued.left--;
  }

  if (d < sw.min || d > sw.max) {
    m.events.push({ t: 'miss', seat: f.seat, kind: sw.kind });
  } else {
    // 受伤率 = 100 / 防 + 破绽层数 × 10%
    const rate = 100 / o.def + o.pozhan * 0.1;
    const guard = sectOf(o).huti.id === 'tiebushan' && o.hutiBuff > 0 ? 0.8 : 1;
    const dmg = Math.round(f.atk * sw.power * (f.qishi / 100) * rate * guard);
    m.events.push({ t: 'hit', seat: f.seat, kind: sw.kind, dmg, move: mv ? mv.name : null });

    if (mv) {
      if (mv.id === 'yunshou') o.pozhan = Math.min(MAX_STACK, o.pozhan + 1);
      if (mv.id === 'zhuifeng') f.neili = Math.min(100, f.neili + 1);
      if (mv.id === 'xuanming') o.handu = Math.min(MAX_STACK, o.handu + 1);
      if (mv.id === 'shijue' && f.queued) {
        f.queued.hits++;
        if (f.queued.hits % 2 === 0) o.pozhan = Math.min(MAX_STACK, o.pozhan + 1);
      }
    }
    if (sectOf(o).huti.id === 'hanbing' && o.hutiBuff > 0) f.handu = Math.min(MAX_STACK, f.handu + 1);
    damage(m, o, dmg);
  }

  if (f.queued && f.queued.left <= 0) f.queued = null;
}

export function step(m: Match, dt: number) {
  if (m.winner !== null) return;
  m.time += dt;

  for (const f of m.fighters) {
    f.shenfaBuff = Math.max(0, f.shenfaBuff - dt);
    f.hutiBuff = Math.max(0, f.hutiBuff - dt);

    // 移动：冲刺优先，起手时不能走
    if (f.dash) {
      const d = Math.min(DASH_SPEED * dt, f.dash.left);
      moveBy(m, f, f.dash.dir * d);
      f.dash.left -= d;
      if (f.dash.left <= 1e-6) f.dash = null;
    } else if (!f.casting) {
      moveBy(m, f, f.dir * sectOf(f).speed * dt);
    }

    if (f.casting) {
      f.casting.left -= dt;
      if (f.casting.left <= 0) finishCast(m, f);
    }

    // 平 A：冷却好了、没在起手、对方在范围里就自动出手
    f.atkCd = Math.max(0, f.atkCd - dt);
    if (f.swing) {
      f.swing.left -= dt;
      if (f.swing.left <= 0) resolveSwing(m, f);
    } else if (!f.casting && f.atkCd <= 0) {
      const { min, max } = attackRange(f);
      const d = distance(m);
      if (d >= min && d <= max) startSwing(m, f);
    }

    // 寒毒：每层每秒 1 点，不吃防御
    if (f.handu > 0) {
      f.handuClock += dt;
      while (f.handuClock >= 1) {
        f.handuClock -= 1;
        m.events.push({ t: 'dot', seat: f.seat, dmg: f.handu });
        damage(m, f, f.handu);
      }
    } else f.handuClock = 0;

    if (m.winner !== null) return;
  }
}
