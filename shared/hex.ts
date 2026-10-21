// 教学关规则：六边形格子。玩家登录后控制徒弟，旁边站着师傅，对面是木桩。
// 时间都用秒。冷却为 0 才能行动；行动就是先选一个技能，再选格子或单位。
// 玩家在线、冷却为 0 时，时间停下来等他；玩家不在线，时间不走。

export const COLS = 7;
export const ROWS = 5;
export const TICK = 0.05; // 服务器每次推进多少秒
export const START_SPREAD = 1.5; // 开局每人随机一个冷却，在 0 到这么多秒之间
export const NPC_WAIT = 1; // 师傅和木桩还不会行动，冷却到 0 时原地等这么久

/** 师傅一句一句教。走一步以后说第二句，木桩打坏以后说第三句 */
export const LESSONS = ['点金色格子，走一步', '点木桩，打它', '出师了'];
export const TEACHER = 'shifu'; // 气泡画在谁头上

export type Side = 'friend' | 'foe';
/** 格子：[列, 行]。尖头朝上，奇数行往右错半格 */
export type Cell = [number, number];

export interface Unit {
  id: string;
  name: string;
  side: Side;
  player: boolean; // 是不是玩家控制的人
  at: Cell;
  cd: number; // 冷却：还要等几秒才能行动
  range: number; // 攻击范围：几格以内的敌人能打到，相邻是 1
  hp: number;
  maxHp: number;
  mp: number; // 内力
  maxMp: number;
  sp: number; // 脚力
  maxSp: number;
  buffs: string[]; // 状态名，比如“中毒”
}

export interface Board {
  units: Unit[];
  time: number; // 开局以来过了多少秒
  lesson: number; // 师傅教到第几句，是 LESSONS 的下标
}

/** 技能：先选技能，再选目标。移动的目标是相邻的空格子，攻击的目标是攻击范围内的敌人 */
export interface Skill {
  id: SkillId;
  name: string;
  cd: number; // 用完加多少冷却
  target: 'cell' | 'foe';
  power?: number; // 扣多少血
}

export type SkillId = 'move' | 'attack';

export const SKILLS: Record<SkillId, Skill> = {
  move: { id: 'move', name: '移动', cd: 1, target: 'cell' },
  attack: { id: 'attack', name: '攻击', cd: 1.5, target: 'foe', power: 100 },
};

function unit(id: string, name: string, side: Side, player: boolean, at: Cell, hp = 1000): Unit {
  return {
    id, name, side, player, at,
    range: 1,
    cd: 0,
    hp, maxHp: hp,
    mp: 100, maxMp: 100,
    sp: 100, maxSp: 100,
    buffs: [],
  };
}

/** 教学关：徒弟走两步就能打到木桩，木桩三下打坏 */
export function createTutorial(): Board {
  const units = [
    unit('tudi', '徒弟', 'friend', true, [2, 2]),
    unit(TEACHER, '师傅', 'friend', false, [1, 1]),
    unit('muzhuang', '木桩', 'foe', false, [5, 2], 300),
  ];
  // 开局每人随机一个 0 到 1.5 秒的冷却，互相不一样，这样谁先谁后是随机的
  const used = new Set<number>();
  for (const u of units) {
    do u.cd = Math.round(Math.random() * START_SPREAD * 1000) / 1000;
    while (used.has(u.cd));
    used.add(u.cd);
  }
  return { time: 0, lesson: 0, units };
}

export const sameCell = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

export const inside = ([c, r]: Cell) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

/** 相邻的 6 格（出界的去掉）。奇数行往右错半格，所以奇偶行的斜邻居不一样 */
export function neighbors([c, r]: Cell): Cell[] {
  const d = r % 2 ? 0 : -1;
  const list: Cell[] = [
    [c - 1, r], [c + 1, r],
    [c + d, r - 1], [c + d + 1, r - 1],
    [c + d, r + 1], [c + d + 1, r + 1],
  ];
  return list.filter(inside);
}

/** 两格之间隔几步。先把“奇数行错半格”的坐标换成立方坐标，再取三个方向差的最大值 */
export function dist(a: Cell, b: Cell) {
  const cube = ([c, r]: Cell) => {
    const x = c - (r - (r & 1)) / 2;
    return [x, r, -x - r];
  };
  const p = cube(a), q = cube(b);
  return Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
}

/** 这个人的攻击范围：离他 1 到 range 格的所有格子 */
export function attackArea(b: Board): Cell[] {
  const u = unitOf(b);
  if (!u) return [];
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = dist(u.at, [c, r]);
    if (d >= 1 && d <= u.range) cells.push([c, r]);
  }
  return cells;
}

export const unitAt = (b: Board, cell: Cell) => b.units.find((u) => sameCell(u.at, cell));

export const unitOf = (b: Board) => b.units.find((u) => u.player);

/** 玩家用这个技能，现在能选哪些格子。冷却不为 0 就一个都没有 */
export function targets(b: Board, skill: SkillId): Cell[] {
  const u = unitOf(b);
  if (!u || u.cd !== 0) return [];
  if (SKILLS[skill].target === 'cell') return neighbors(u.at).filter((c) => !unitAt(b, c));
  return attackArea(b).filter((c) => {
    const v = unitAt(b, c);
    return !!v && v.side !== u.side;
  });
}

/** 用技能。不合法就什么都不做，返回 false */
export function act(b: Board, skill: SkillId, to: Cell): boolean {
  if (!SKILLS[skill] || !targets(b, skill).some((c) => sameCell(c, to))) return false;
  const u = unitOf(b)!;
  const s = SKILLS[skill];
  if (s.target === 'cell') u.at = [to[0], to[1]];
  else {
    const v = unitAt(b, to)!;
    v.hp = Math.max(0, v.hp - (s.power ?? 0));
    if (v.hp === 0) b.units = b.units.filter((w) => w !== v);
  }
  u.cd = s.cd;
  // 教学：走了一步就教打木桩，敌人都打完了就出师
  if (b.lesson === 0 && s.target === 'cell') b.lesson = 1;
  if (!b.units.some((w) => w.side === 'foe')) b.lesson = 2;
  return true;
}

/** 推进时间。玩家不在线、或者在等玩家，就不动；否则所有人的冷却一起减 */
export function step(b: Board, dt: number, online: boolean) {
  if (!online) return;
  for (const u of b.units) if (!u.player && u.cd === 0) u.cd = NPC_WAIT;
  if (unitOf(b)?.cd === 0) return;
  // 最多只走到下一个人冷却到 0，这样开局排好的先后不会在同一下里挤在一起
  const next = Math.min(dt, ...b.units.map((u) => u.cd).filter((cd) => cd > 0));
  for (const u of b.units) u.cd = Math.max(0, u.cd - next);
  b.time += next;
}
