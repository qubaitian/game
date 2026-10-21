import './hex.css';
import {
  COLS, LESSONS, ROWS, SKILLS, TEACHER, attackArea, sameCell, targets, unitAt, unitOf,
  type Board, type Cell, type SkillId, type Unit,
} from '../../../shared/hex.ts';

// 每种状态是好是坏，决定方框的颜色
const KIND: Record<string, 'good' | 'bad'> = {
  中毒: 'bad', 流血: 'bad', 眩晕: 'bad', 封穴: 'bad', 残废: 'bad', 内伤: 'bad', 减速: 'bad', 定身: 'bad',
  护体: 'good', 铁甲: 'good', 狂暴: 'good', 醉酒: 'good', 加速: 'good', 疗伤: 'good',
};

// 冷却外框和时间条都分两段：最后 1.5 秒，和再往前的 1.5 秒
const WARN = 1.5;
const HEX_W = 120; // 一个格子的宽（像素）

// ---- 六边形的几何（格子宽 100，高 115.47） ----

// 六个顶点，从顶上的尖开始顺时针
const V = [[50, 0], [100, 28.87], [100, 86.6], [50, 115.47], [0, 86.6], [0, 28.87]];
const C = [50, 57.735];
/** 把一条沿着六边形的线往里缩：边离中心 50，往里缩 inset 就是乘 (50 - inset) / 50 */
const shrink = (inset: number) => `transform="translate(50 57.735) scale(${(50 - inset) / 50}) translate(-50 -57.735)"`;
const along = (idx: number[]) => 'M' + idx.map((i) => V[i].join(' ')).join(' L');
/** 沿六边形画的线：往里缩 inset，线宽 width（缩放以后线宽也会缩，所以先除回来） */
const ring = (inset: number, width: number) => `${shrink(inset)} stroke-width="${width / ((50 - inset) / 50)}"`;
const LOOP = along([0, 1, 2, 3, 4, 5, 0]);

// 一条资源条占两条边，三条正好一圈。满的时候三条在顶点处接在一起，没有缝。
// 做法：每条用一整圈闭合路径（拐角是尖角），从它起点前一个顶点开始绕，这条占第 2、3 条边，
// 也就是路径的 [100/6, 300/6]。两头各多画一点，再用一个扇形裁掉，扇形的边正好穿过顶点。
const EDGE = 100 / 6;
const EXT = 3;
const SECTORS = { mp: [0, 1, 2], sp: [2, 3, 4], hp: [4, 5, 0] } as const;
type Bar = keyof typeof SECTORS;

function barDash(f: number) {
  // 少掉的部分从起点开始，顺时针往前吃；终点那头永远在顶点上
  if (f <= 0) return 'stroke-dasharray="0 200"';
  const a = EDGE + (1 - f) * 2 * EDGE - (f >= 1 ? EXT : 0);
  const b = 3 * EDGE + EXT;
  return `stroke-dasharray="0 ${a} ${b - a} 200"`;
}

/** 扇形裁剪，整页只放一份 */
function sectorDefs() {
  const far = (i: number) => [C[0] + (V[i][0] - C[0]) * 4, C[1] + (V[i][1] - C[1]) * 4];
  return `<svg width="0" height="0" style="position:absolute"><defs>${Object.entries(SECTORS)
    .map(([k, idx]) => `<clipPath id="sector-${k}" clipPathUnits="userSpaceOnUse">
      <polygon points="${[C, ...idx.map(far)].map((q) => q.join(',')).join(' ')}"/></clipPath>`)
    .join('')}</defs></svg>`;
}

/** 一个格子的两圈：敌友框兼冷却条（外）、资源条（里）。宽度单位：格子宽 = 100 */
function rings(u: Unit) {
  const bar = (cls: Bar, f: number) => {
    const start = SECTORS[cls][0];
    const loop = [0, 1, 2, 3, 4, 5, 6].map((k) => (start + 5 + k) % 6);
    return `<path class="${cls}" pathLength="100" d="${along(loop)}" ${ring(11.5, 8)} clip-path="url(#sector-${cls})" ${barDash(f)}/>`;
  };
  return `<svg class="rings" viewBox="0 0 100 115.47" preserveAspectRatio="none">
    <path class="t-base" d="${LOOP}" ${ring(3.5, 6)}/>
    <path class="t-near" pathLength="100" data-near="${u.id}" d="${LOOP}" ${ring(3.5, 6)}/>
    <path class="t-far" pathLength="100" data-far="${u.id}" d="${LOOP}" ${ring(3.5, 6)}/>
    <path class="sep" d="${LOOP}" ${ring(7, 1)}/>
    ${bar('mp', u.mp / u.maxMp)}
    ${bar('sp', u.sp / u.maxSp)}
    ${bar('hp', u.hp / u.maxHp)}
  </svg>`;
}

/** 一圈路径（长度 100）只画最后 f 那一段：f 变小时，起点从顶上往顺时针方向退 */
function showTail(path: Element | null, f: number) {
  if (!(path instanceof SVGElement)) return;
  path.style.strokeDasharray = `${f * 100} 100`;
  path.style.strokeDashoffset = `${-(1 - f) * 100}`;
}

// 字越多字越小，保证名字只占一行
const nameSize = (name: string) => `${Math.min(16, 56 / name.length)}cqw`;

const ACTIONS: SkillId[] = ['move', 'attack'];

/** 棋盘上亮着的格子：能走的、攻击范围、范围里能打的敌人 */
type Marks = { move: Cell[]; area: Cell[]; hit: Cell[] };

/** 教学关页面。联网在 main.ts，这里只管画和点 */
export class HexView {
  private board: Board | null = null;
  private mode: SkillId | null = null; // 选了哪个技能，等着选目标；轮到自己时默认是移动
  private hovered: string | null = null; // 鼠标停在谁身上
  private focus: { friend: string | null; foe: string | null } = { friend: null, foe: null }; // 点过谁
  private pan = { x: 0, y: 0 }; // 拖动的偏移，以棋盘居中的位置为 0
  private zoom = 1; // 滚轮缩放，1 是整张地图正好放进中间区域
  private shape = ''; // 上次画格子时的样子，没变就只更新冷却
  private readonly root: HTMLElement;
  private readonly view: HTMLElement;
  private readonly boardEl: HTMLElement;
  private readonly timeline: HTMLElement;
  private readonly panels: { friend: HTMLElement; foe: HTMLElement };
  private readonly buttons = new Map<SkillId, HTMLButtonElement>();

  constructor(
    parent: HTMLElement,
    private readonly address: string | null, // 登录的钱包地址，游客是 null
    private readonly send: (msg: object) => void,
    private readonly logout: () => void,
  ) {
    document.title = '教学关 · 团战';
    this.root = document.createElement('div');
    this.root.className = 'hexpage';
    this.root.innerHTML = `${sectorDefs()}
      <div class="panels"><div class="panel friend"></div><div class="panel foe"></div></div>
      <div class="middle">
        <div class="view"><div class="board"></div></div>
        <div class="timeline"><div class="track"></div></div>
      </div>
      <div class="actions"></div>
      <div class="sysmask" hidden><div class="sysbox">
        <h2>系统</h2>
        <p class="who">${address ? `钱包 ${short(address)}` : '游客'}</p>
        <button data-do="restart">重新开始</button>
        <button data-do="logout">退出登录</button>
        <button data-do="close">返回游戏</button>
      </div></div>`;
    parent.appendChild(this.root);
    this.view = this.root.querySelector('.view')!;
    this.boardEl = this.root.querySelector('.board')!;
    this.timeline = this.root.querySelector('.timeline')!;
    this.panels = { friend: this.root.querySelector('.panel.friend')!, foe: this.root.querySelector('.panel.foe')! };

    // 时间条的刻度：3s、1.5s、0
    for (const [t, label] of [[3, '3'], [1.5, '1.5'], [0, '0']] as const) {
      const el = document.createElement('div');
      el.className = 'tick';
      el.dataset.t = String(t);
      el.textContent = label;
      this.timeline.appendChild(el);
    }

    // 动作栏：先点技能，再点格子；再点一次同一个技能就回到移动
    const bar = this.root.querySelector('.actions')!;
    for (const id of ACTIONS) {
      const b = document.createElement('button');
      b.textContent = SKILLS[id].name;
      b.addEventListener('click', () => {
        this.mode = this.mode === id ? 'move' : id;
        this.render();
      });
      bar.appendChild(b);
      this.buttons.set(id, b);
    }
    // 系统按钮：和玩法无关的功能都在这里面
    const sys = document.createElement('button');
    sys.className = 'system';
    sys.textContent = '系统';
    sys.addEventListener('click', () => this.toggleSystem(true));
    bar.appendChild(sys);
    this.bindSystem();

    this.bindPointer();
    new ResizeObserver(() => {
      this.applyPan();
      this.render();
    }).observe(this.view);
  }

  /** 服务器发来新的棋盘 */
  update(board: Board) {
    this.board = board;
    this.render();
  }

  remove() {
    this.root.remove();
    window.removeEventListener('keydown', this.onKey);
  }

  // ---- 系统框：屏幕中间弹出，后面的游戏变暗。点框外面或按 Esc 关上 ----

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.toggleSystem(false);
  };

  private bindSystem() {
    const mask = this.root.querySelector<HTMLElement>('.sysmask')!;
    mask.addEventListener('click', (e) => {
      const what = (e.target as HTMLElement).closest<HTMLElement>('[data-do]')?.dataset.do;
      if (what === 'restart') this.send({ t: 'reset' });
      if (what === 'logout') return this.logout();
      // 点了按钮，或者点在框外面，都关上
      if (what || e.target === mask) this.toggleSystem(false);
    });
    window.addEventListener('keydown', this.onKey);
  }

  private toggleSystem(open: boolean) {
    this.root.querySelector<HTMLElement>('.sysmask')!.hidden = !open;
  }

  // ---- 鼠标：拖动地图、点格子、看单位 ----

  private bindPointer() {
    let down: { x: number; y: number; px: number; py: number } | null = null;
    let dragging = false;
    this.view.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      dragging = false;
      this.view.setPointerCapture(e.pointerId);
    });
    this.view.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!dragging && Math.hypot(dx, dy) > 4) {
          dragging = true;
          this.view.classList.add('dragging');
        }
        if (dragging) {
          this.pan.x = down.px + dx;
          this.pan.y = down.py + dy;
          this.applyPan();
        }
        return;
      }
      // 鼠标停在谁身上，就在上面的框里显示谁
      const id = this.hexAt(e.clientX, e.clientY)?.dataset.unit ?? null;
      if (id !== this.hovered) {
        this.hovered = id;
        this.renderPanels();
      }
    });
    this.view.addEventListener('pointerup', (e) => {
      const wasDrag = dragging;
      down = null;
      dragging = false;
      this.view.classList.remove('dragging');
      if (!wasDrag) this.click(e.clientX, e.clientY);
    });
    this.view.addEventListener('pointerleave', () => {
      if (this.hovered === null) return;
      this.hovered = null;
      this.renderPanels();
    });
    // 滚轮（触控板捏合也是滚轮）：以鼠标所在的点为中心缩放
    this.view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const box = this.view.getBoundingClientRect();
      this.zoomAt(e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    // 双击：回到整张地图正好放下的样子
    this.view.addEventListener('dblclick', () => {
      this.zoom = 1;
      this.pan = { x: 0, y: 0 };
      this.applyPan();
    });
  }

  /** 整张地图正好放进中间区域时的倍数 */
  private fitScale() {
    const w = this.boardEl.offsetWidth, h = this.boardEl.offsetHeight;
    if (!w || !h) return 1;
    return Math.min(this.view.clientWidth / w, this.view.clientHeight / h) * 0.96;
  }

  /** 棋盘左上角在中间区域里的位置：先居中，再加上拖动的偏移 */
  private origin(scale: number) {
    return {
      x: (this.view.clientWidth - this.boardEl.offsetWidth * scale) / 2 + this.pan.x,
      y: (this.view.clientHeight - this.boardEl.offsetHeight * scale) / 2 + this.pan.y,
    };
  }

  /** 以 (mx, my) 为中心缩放，这个点下面的格子保持不动 */
  private zoomAt(mx: number, my: number, factor: number) {
    const fit = this.fitScale();
    const s = fit * this.zoom;
    const zoom = Math.min(4, Math.max(0.5, this.zoom * factor));
    const s2 = fit * zoom;
    const o = this.origin(s);
    // 鼠标下面那一点在棋盘上的位置，缩放前后要对上
    const px = (mx - o.x) / s, py = (my - o.y) / s;
    this.zoom = zoom;
    this.pan.x = mx - px * s2 - (this.view.clientWidth - this.boardEl.offsetWidth * s2) / 2;
    this.pan.y = my - py * s2 - (this.view.clientHeight - this.boardEl.offsetHeight * s2) / 2;
    this.applyPan();
  }

  private hexAt(x: number, y: number) {
    return (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.hex') ?? null;
  }

  private click(x: number, y: number) {
    const hex = this.hexAt(x, y);
    if (!hex || !this.board) return;
    // 点亮着的空格子就是移动，点攻击范围里的敌人就是攻击
    const skill: SkillId | null = hex.classList.contains('can') ? 'move' : hex.classList.contains('hit') ? 'attack' : null;
    if (this.mode && skill) {
      const to = hex.dataset.cell!.split(',').map(Number) as Cell;
      this.send({ t: 'act', skill, to });
      this.mode = null;
      this.render();
      return;
    }
    // 否则点到人：在上面的框里固定显示他
    const u = this.board.units.find((v) => v.id === hex.dataset.unit);
    if (u) {
      this.focus[u.side] = u.id;
      this.renderPanels();
    }
  }

  /** 棋盘先缩放到正好放下（再乘滚轮缩放），再居中，再加上拖动的偏移。窗口变了也跟着变 */
  private applyPan() {
    const s = this.fitScale() * this.zoom;
    const o = this.origin(s);
    this.boardEl.style.transform = `translate(${o.x}px, ${o.y}px) scale(${s})`;
  }

  // ---- 画 ----

  private render() {
    const b = this.board;
    if (!b) return;
    const me = unitOf(b);
    const ready = !!me && me.cd === 0;
    // 轮到自己时，自动选上移动，能走的格子直接亮起来
    if (!ready) this.mode = null;
    else if (!this.mode) this.mode = 'move';
    // 默认（移动）时，能走的格子和攻击范围一起亮；选了攻击，就只亮攻击范围
    const marks: Marks = {
      move: this.mode === 'move' ? targets(b, 'move') : [],
      area: this.mode ? attackArea(b) : [],
      hit: this.mode ? targets(b, 'attack') : [],
    };

    // 只有位置、资源、亮着的格子变了才重画格子；冷却每次都更新
    const shape = JSON.stringify([b.units.map((u) => [u.id, u.at, u.hp, u.mp, u.sp, u.buffs]), marks, b.lesson]);
    if (shape !== this.shape) {
      this.shape = shape;
      this.layout(b, marks);
    }
    for (const u of b.units) {
      showTail(this.boardEl.querySelector(`[data-near="${u.id}"]`), Math.min(1, u.cd / WARN));
      showTail(this.boardEl.querySelector(`[data-far="${u.id}"]`), Math.min(1, Math.max(0, (u.cd - WARN) / WARN)));
    }
    for (const [id, btn] of this.buttons) {
      btn.disabled = !ready;
      btn.classList.toggle('on', this.mode === id);
    }
    this.renderTimeline(b);
    this.renderPanels();
  }

  /** 尖头朝上的六边形，奇数行往右错半格 */
  private layout(b: Board, marks: Marks) {
    const w = HEX_W;
    const R = w / Math.sqrt(3); // 外接圆半径
    const gap = 3;
    const center = ([c, r]: Cell) => ({ x: w / 2 + c * w + (r % 2 ? w / 2 : 0), y: R + r * R * 1.5 });
    const width = w * (COLS + 0.5), height = R * 2 + (ROWS - 1) * R * 1.5;
    this.boardEl.style.width = `${width}px`;
    this.boardEl.style.height = `${height}px`;
    this.applyPan();
    const me = unitOf(b);

    let html = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell: Cell = [c, r];
        const { x, y } = center(cell);
        const u = unitAt(b, cell);
        const has = (list: Cell[]) => list.some((t) => sameCell(t, cell));
        const cls = ['hex', u ? u.side : '', u && u === me ? 'mine' : '',
          has(marks.move) ? 'can' : '', has(marks.area) ? 'area' : '', has(marks.hit) ? 'hit' : ''].join(' ');
        const style = `left:${x - w / 2 + gap / 2}px;top:${y - R + gap / 2}px;width:${w - gap}px;height:${R * 2 - gap}px`;
        html += `<div class="${cls}" data-cell="${c},${r}" ${u ? `data-unit="${u.id}"` : ''} style="${style}">${u ? rings(u) : ''}<div class="in">${u ? `
          <div class="name" style="font-size:${nameSize(u.name)}">${u.name}</div>
          ${u.buffs.length ? `<div class="buffs">${u.buffs.map((k) => `<div class="buff ${KIND[k] ?? 'bad'}">${k}</div>`).join('')}</div>` : ''}` : ''}
        </div></div>`;
      }
    }
    // 师傅头上的气泡：教到哪一句就说哪一句
    const teacher = b.units.find((u) => u.id === TEACHER);
    if (teacher) {
      const { x, y } = center(teacher.at);
      html += `<div class="say" style="left:${x}px;top:${y - R}px">${LESSONS[b.lesson]}</div>`;
    }
    this.boardEl.innerHTML = html;
  }

  /** 右边的时间条：上面 3s，中间 1.5s，下面 0。超过 3s 的停在最上面，挨得太近的往旁边错开 */
  private renderTimeline(b: Board) {
    const track = this.timeline.querySelector<HTMLElement>('.track')!;
    const top = track.offsetTop, h = track.offsetHeight, mid = this.timeline.clientWidth / 2;
    const yOf = (cd: number) => top + (1 - Math.min(cd, 2 * WARN) / (2 * WARN)) * h;
    for (const t of this.timeline.querySelectorAll<HTMLElement>('.tick')) t.style.top = `${yOf(Number(t.dataset.t))}px`;

    const me = unitOf(b);
    const placed: { y: number; x: number }[] = [];
    const sorted = [...b.units].sort((p, q) => p.cd - q.cd);
    let html = '';
    for (const u of sorted) {
      const y = yOf(u.cd);
      // 和已经放下的挨得太近，就往左右错开
      let x = mid;
      for (const off of [0, -24, 24, -48, 48]) {
        x = mid + off;
        if (!placed.some((p) => Math.abs(p.y - y) < 24 && Math.abs(p.x - x) < 24)) break;
      }
      placed.push({ x, y });
      const cls = ['chip', u.side, u === me ? 'mine' : ''].join(' ');
      html += `<div class="${cls}" style="left:${x}px;top:${y}px" title="${u.name} ${u.cd.toFixed(2)}s">${u.name[0]}</div>`;
    }
    for (const el of this.timeline.querySelectorAll('.chip')) el.remove();
    this.timeline.insertAdjacentHTML('beforeend', html);
  }

  /** 上面两个详细状态框：鼠标停在谁身上就显示谁；否则显示点过的；再否则左边是自己，右边是第一个敌人 */
  private renderPanels() {
    const b = this.board;
    if (!b) return;
    const find = (id: string | null) => b.units.find((u) => u.id === id);
    const hovered = find(this.hovered);
    const pick = (side: 'friend' | 'foe') =>
      (hovered?.side === side ? hovered : undefined) ??
      find(this.focus[side]) ??
      (side === 'friend' ? unitOf(b) : undefined) ??
      b.units.find((u) => u.side === side);
    for (const side of ['friend', 'foe'] as const) this.panels[side].innerHTML = panel(pick(side), this.address);
  }
}

/** 钱包地址太长，只留头尾：0x12ab…9f3c */
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** 一个人的详细状态。玩家控制的人，名字下面写缩短的钱包地址，游客写“游客” */
function panel(u: Unit | undefined, address: string | null) {
  if (!u) return '';
  const row = (label: string, v: number, max: number, color: string) => `<div class="row">
    <span>${label}</span><div class="bar"><i style="width:${(v / max) * 100}%;--c:${color}"></i></div>
    <span class="num">${Math.round(v)} / ${max}</span></div>`;
  return `<div class="pname">${u.name}<small>攻击范围 ${u.range}　冷却 ${u.cd.toFixed(1)}s</small></div>
    ${u.player ? `<div class="addr">${address ? short(address) : '游客'}</div>` : ''}
    ${row('血', u.hp, u.maxHp, '#2dbb4e')}
    ${row('内力', u.mp, u.maxMp, '#2f86f0')}
    ${row('脚力', u.sp, u.maxSp, '#f0c020')}
    ${u.buffs.length ? `<div class="pbuffs">${u.buffs.map((k) => `<span class="${KIND[k] ?? 'bad'}">${k}</span>`).join('')}</div>` : ''}`;
}
