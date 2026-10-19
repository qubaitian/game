// 故事模式里的武学配置：玩家在剧情里学到的武学，以及第六天夜里的对手。
// 效果写在 combat.ts 里，这里只放数据。

import { addKit, type Fighter, type MoveDef, type SectDef, type SkillDef } from './combat.ts';

const FIST = { name: '拳', kind: 'fist' as const, min: 0, max: 1.5 };

/** 剧情里学到的武学，按名字查 */
const MOVES: Record<string, MoveDef> = {
  擒拿手: { id: 'qinna', name: '擒拿手', tier: '简', kind: 'fist', hits: 4, power: 1.2, min: 0, max: 1.2, neili: 5, shenfa: 5, desc: '每命中 1 次，给对方加 1 层破绽' },
  断腕手: { id: 'duanwan', name: '断腕手', tier: '简', kind: 'fist', hits: 1, power: 5, min: 0, max: 1, neili: 20, shenfa: 0, desc: '只有一下，很重' },
  庄稼把式: { id: 'zhuangjia', name: '庄稼把式', tier: '简', kind: 'fist', hits: 3, power: 1.3, min: 0, max: 1.5, neili: 5, shenfa: 5, desc: '每命中 1 次，把对方推开 0.6m' },
  飞石: { id: 'feishi', name: '飞石', tier: '简', kind: 'hidden', hits: 4, power: 1.3, min: 1.5, max: 4.5, neili: 5, shenfa: 5, desc: '抄本错了一个字：每扔一次，自己掉 10 血' },
};

const SHENFA: Record<string, SkillDef> = {
  护身步: { id: 'hushen', name: '护身步', tier: '简', neili: 0, shenfa: 10, duration: 0, desc: '蓄力 0.5 秒，向按住的方向冲出 3m（没按方向就往后退）' },
};

const HUTI: Record<string, SkillDef> = {
  听风: { id: 'tingfeng', name: '听风', tier: '简', neili: 10, shenfa: 0, duration: 10, desc: '10 秒内受到的伤害 -50%' },
};

/** 玩家：没有内功，只有剧情里学到的武学 */
export function playerKit(skills: string[]): SectDef {
  return {
    id: 'player',
    name: '趟子手',
    color: 0x5a4a32,
    weapon: FIST,
    speed: 1,
    movePower: 0,
    shenfa: skills.map((k) => SHENFA[k]).find(Boolean),
    moves: skills.map((k) => MOVES[k]).filter(Boolean),
    huti: skills.map((k) => HUTI[k]).find(Boolean),
  };
}

export type FoeId = 'aqi' | 'archer';

interface Foe {
  kit: SectDef;
  stats: Partial<Fighter>;
  intro: string;
}

/** 对手的攻都很低，玩家的血最低停在 1，所以不会输 */
export const FOES: Record<FoeId, Foe> = {
  aqi: {
    kit: {
      id: 'aqi',
      name: '阿七',
      color: 0x8c3a2b,
      weapon: FIST,
      speed: 1.1,
      movePower: 0,
      moves: [{ id: 'yehu', name: '野狐拳', tier: '简', kind: 'fist', hits: 3, power: 1.3, min: 0, max: 1.5, neili: 10, shenfa: 0, desc: '没有额外效果' }],
    },
    stats: { hp: 1200, maxHp: 1200, atk: 30 },
    intro: '拦住阿七，把他打倒。',
  },
  archer: {
    kit: {
      id: 'archer',
      name: '带头的弓手',
      color: 0x4a5a3b,
      weapon: { name: '弓', kind: 'hidden', min: 2.5, max: 5 },
      speed: 1,
      movePower: 0,
      moves: [{ id: 'lianzhu', name: '连珠箭', tier: '简', kind: 'hidden', hits: 3, power: 1.2, min: 2.5, max: 5.5, neili: 10, shenfa: 0, desc: '没有额外效果' }],
    },
    stats: { hp: 1000, maxHp: 1000, atk: 30 },
    intro: '弓手打不到贴身的人。冲上去，把他打倒。',
  },
};

/** 给一场故事战斗登记两边的武学配置，返回 createMatch 用的初始属性 */
export function storySetup(skills: string[], foe: FoeId): [Partial<Fighter>, Partial<Fighter>] {
  return [
    { sect: addKit(playerKit(skills)), minHp: 1 },
    { sect: addKit(FOES[foe].kit), ...FOES[foe].stats },
  ];
}
