import type { Match, Slot } from '../../../shared/combat.ts';

/** 对战场景从这里拿状态、发按键。联网用 Net，单人用 LocalDriver */
export interface Driver {
  match: Match | null;
  online: [boolean, boolean];
  connected: boolean;
  replaced: boolean;
  onState?: (match: Match) => void;
  /** 开场显示在按钮上方的提示 */
  intro?: string;
  /** 分出胜负后的提示，不给就用联网的“再来一局” */
  endText?: string;
  /** 单人模式每帧推进战斗 */
  tick?(dt: number): void;
  takeOver(): void;
  dir(dir: number): void;
  cast(slot: Slot): void;
  reset(): void;
}
