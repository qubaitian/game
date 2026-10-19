import type { Match, Seat, Slot } from '../../shared/combat.ts';
import type { Driver } from './battle/driver';

type ServerMsg = { t: 'state'; online: [boolean, boolean]; match: Match };

/** 连对战服务器：收状态，发按键。断线每秒重连一次 */
export class Net implements Driver {
  match: Match | null = null;
  online: [boolean, boolean] = [false, false];
  connected = false;
  replaced = false; // 这个座位被别的页面顶掉了
  onState?: (match: Match) => void;
  private ws?: WebSocket;
  private readonly seat: Seat;

  constructor(seat: Seat) {
    this.seat = seat;
    this.connect();
  }

  /** 被顶掉之后，点一下在本页重新接管 */
  takeOver() {
    if (!this.replaced) return;
    this.replaced = false;
    this.connect();
  }

  private connect() {
    const ws = new WebSocket(`ws://${location.hostname}:8787/?seat=${this.seat}`);
    this.ws = ws;
    ws.onopen = () => (this.connected = true);
    ws.onmessage = (e) => {
      const msg: ServerMsg = JSON.parse(e.data);
      this.match = msg.match;
      this.online = msg.online;
      this.onState?.(msg.match);
    };
    ws.onclose = (e) => {
      this.connected = false;
      this.online = [false, false];
      if (e.code === 4000) this.replaced = true;
      else setTimeout(() => this.connect(), 1000);
    };
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  dir(dir: number) {
    this.send({ t: 'dir', dir });
  }

  cast(slot: Slot) {
    this.send({ t: 'cast', slot });
  }

  reset() {
    this.send({ t: 'reset' });
  }
}
