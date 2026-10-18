// 对战服务器：两个座位（0 = 武当，1 = 界青），服务器跑战斗规则，每 tick 把状态广播给双方。
import { WebSocketServer, type WebSocket } from 'ws';
import { TICK, cast, createMatch, setDir, step, type Seat, type Slot } from '../../shared/combat.ts';

const PORT = Number(process.env.PORT ?? 8787);
const SLOTS: Slot[] = ['shenfa', 'move0', 'move1', 'move2', 'huti'];

type ClientMsg = { t: 'dir'; dir: number } | { t: 'cast'; slot: Slot } | { t: 'reset' };

const seats: [WebSocket | null, WebSocket | null] = [null, null];
let match = createMatch();

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  const seat: Seat = new URL(req.url ?? '/', 'http://localhost').searchParams.get('seat') === '1' ? 1 : 0;
  // 同一个座位再连进来，就顶掉旧的（比如刷新页面）。4000 告诉旧页面别自动重连，免得两个页面来回抢座位
  seats[seat]?.close(4000, 'replaced');
  seats[seat] = ws;
  console.log(`座位 ${seat} 已连接`);

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.t === 'dir') setDir(match, seat, msg.dir);
    else if (msg.t === 'cast' && SLOTS.includes(msg.slot)) {
      if (seats[0] && seats[1]) cast(match, seat, msg.slot);
    } else if (msg.t === 'reset' && match.winner !== null) match = createMatch();
  });

  ws.on('close', () => {
    if (seats[seat] === ws) {
      seats[seat] = null;
      setDir(match, seat, 0);
      console.log(`座位 ${seat} 已断开`);
    }
  });
});

setInterval(() => {
  const online: [boolean, boolean] = [!!seats[0], !!seats[1]];
  // 两边都在才开打
  if (online[0] && online[1]) step(match, TICK);
  const payload = JSON.stringify({ t: 'state', online, match });
  match.events = [];
  for (const ws of seats) if (ws && ws.readyState === ws.OPEN) ws.send(payload);
}, TICK * 1000);

console.log(`对战服务器 ws://localhost:${PORT}`);
