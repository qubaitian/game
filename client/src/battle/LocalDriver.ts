import {
  TICK, attackRange, cast, createMatch, sectOf, setDir, step,
  type Fighter, type Match, type Slot,
} from '../../../shared/combat.ts';
import type { Driver } from './driver';

/** 单人模式：战斗在本页跑，玩家是座位 0，座位 1 由 AI 控制 */
export class LocalDriver implements Driver {
  match: Match;
  online: [boolean, boolean] = [true, true];
  connected = true;
  replaced = false;
  onState?: (match: Match) => void;
  endText = '胜利\n点这里继续';
  private acc = 0;
  private done = false;
  private readonly ai = new SimpleAi();

  constructor(
    setup: [Partial<Fighter>, Partial<Fighter>],
    readonly intro: string,
    private readonly onWin: () => void,
  ) {
    this.match = createMatch(setup);
  }

  tick(dt: number) {
    // 卡顿时最多补 0.25 秒，免得一下子跑很多步
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.ai.think(this.match, TICK);
      step(this.match, TICK);
    }
    this.onState?.(this.match);
    this.match.events = [];
  }

  takeOver() {}

  dir(dir: number) {
    setDir(this.match, 0, dir);
  }

  cast(slot: Slot) {
    cast(this.match, 0, slot);
  }

  /** 打完了，点一下回到故事。只回一次，连点不会重复 */
  reset() {
    if (this.match.winner === null || this.done) return;
    this.done = true;
    this.onWin();
  }
}

/** 很简单的对手：站在自己的攻击范围中间，隔几秒放一次招 */
class SimpleAi {
  private moveClock = 0;
  private castClock = 3;

  think(m: Match, dt: number) {
    if (m.winner !== null) return;
    const f = m.fighters[1];
    const o = m.fighters[0];

    this.moveClock -= dt;
    if (this.moveClock <= 0) {
      this.moveClock = 0.25;
      const { min, max } = attackRange(f);
      const d = Math.abs(f.x - o.x);
      const toward = Math.sign(o.x - f.x) || 1;
      let dir = 0;
      if (d > max - 0.3) dir = toward;
      else if (min > 0 && d < min + 0.3) dir = -toward;
      setDir(m, 1, dir);
    }

    this.castClock -= dt;
    if (this.castClock <= 0 && !f.casting && !f.queued) {
      this.castClock = 5 + Math.random() * 3;
      const moves = sectOf(f).moves;
      const i = Math.floor(Math.random() * moves.length);
      if (moves[i] && f.neili >= moves[i].neili && f.shenfa >= moves[i].shenfa) cast(m, 1, `move${i}` as Slot);
    }
  }
}
