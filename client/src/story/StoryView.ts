import type { FoeId } from '../../../shared/kits.ts';
import { N, NPCS, has, type Choice, type State } from './nodes';
import './story.css';

/** 打一场，打赢了 resolve */
export type Fight = (foe: FoeId, skills: string[]) => Promise<void>;

/** 故事引擎：显示当前节点，处理选项。遇到 fight 选项就隐藏自己，等战斗打完再继续 */
export class StoryView {
  private s!: State;
  private readonly root: HTMLElement;
  private readonly el: Record<'day' | 'say' | 'text' | 'choices' | 'compass' | 'skills', HTMLElement>;

  constructor(parent: HTMLElement, private readonly fight: Fight) {
    this.root = document.createElement('div');
    this.root.id = 'story';
    this.root.innerHTML = `<div class="wrap">
  <h1>雁口县登记令</h1>
  <main class="story">
    <div class="day"></div>
    <div class="say" hidden></div>
    <div class="text"></div>
    <div class="choices"></div>
  </main>
  <aside>
    <div class="card">
      <h2>罗盘</h2>
      <svg class="compass" viewBox="0 0 240 240" role="img" aria-label="武学罗盘"></svg>
      <div class="muted">横轴：支持登记 ↔ 反对登记。<br>竖轴：温和 ↔ 强硬。<br>你的位置由你做过的事决定。</div>
    </div>
    <div class="card">
      <h2>武学</h2>
      <div class="skills"></div>
    </div>
  </aside>
</div>`;
    parent.appendChild(this.root);
    const q = (c: string) => this.root.querySelector<HTMLElement>('.' + c)!;
    this.el = { day: q('day'), say: q('say'), text: q('text'), choices: q('choices'), compass: q('compass'), skills: q('skills') };
    this.reset();
  }

  private reset() {
    this.s = { x: 0, y: 0, skills: [], f: {}, path: [[0, 0]], say: null, node: 'start' };
    this.go('start');
  }

  private go(id: string) {
    const n = N[id];
    if (!n) throw new Error('no node: ' + id);
    this.s.node = id;
    n.enter?.(this.s);
    this.render();
  }

  private available(c: Choice) {
    if (c.skill && !has(this.s, c.skill)) return false;
    if (c.if && !c.if(this.s)) return false;
    return true;
  }

  private async choose(c: Choice) {
    const s = this.s;
    if (c.reset) return this.reset();
    if (c.fx) {
      s.x = clamp(s.x + c.fx[0]);
      s.y = clamp(s.y + c.fx[1]);
      s.path.push([s.x, s.y]);
    }
    if (c.set) Object.assign(s.f, c.set);
    s.say = c.say ?? null;
    if (c.fight) {
      this.root.hidden = true;
      await this.fight(c.fight, s.skills);
      this.root.hidden = false;
    }
    const next = typeof c.go === 'function' ? c.go(s) : c.go!;
    this.go(next);
  }

  private render() {
    const n = N[this.s.node];
    this.el.day.textContent = n.day ?? '';
    this.el.say.hidden = !this.s.say;
    this.el.say.innerHTML = this.s.say ? paras(this.s.say) : '';
    this.el.text.innerHTML = paras(typeof n.text === 'function' ? n.text(this.s) : n.text);
    const box = this.el.choices;
    box.innerHTML = '';
    for (const c of n.choices.filter((c) => this.available(c))) {
      const b = document.createElement('button');
      b.className = c.fight ? 'choice fight' : 'choice';
      b.innerHTML = (c.skill ? `<span class="skill">【${c.skill}】</span>` : '') + esc(c.t);
      b.onclick = () => this.choose(c);
      box.appendChild(b);
    }
    this.drawCompass();
    this.drawSkills();
    this.root.scrollTo({ top: 0 });
  }

  private drawCompass() {
    const s = this.s;
    let h = `<line class="axis" x1="10" y1="120" x2="230" y2="120"/>
<line class="axis" x1="120" y1="10" x2="120" y2="230"/>
<text class="lab" x="12" y="114">支持登记</text>
<text class="lab" x="228" y="114" text-anchor="end">反对登记</text>
<text class="lab" x="126" y="20">强硬</text>
<text class="lab" x="126" y="228">温和</text>`;
    for (const n of Object.values(NPCS)) {
      h += `<circle class="npc-${n.side}" cx="${px(n.x)}" cy="${py(n.y)}" r="4"/>`;
      h += `<text class="npc-name" x="${px(n.x)}" y="${py(n.y) + 16}" text-anchor="middle">${n.name}</text>`;
    }
    const pts = s.path.map(([x, y]) => `${px(x)},${py(y)}`).join(' ');
    h += `<polyline class="path" points="${pts}"/>`;
    h += `<circle class="you" cx="${px(s.x)}" cy="${py(s.y)}" r="5"/>`;
    this.el.compass.innerHTML = h;
  }

  private drawSkills() {
    const s = this.s;
    if (!s.skills.length) {
      this.el.skills.innerHTML = '<div class="muted">你还不会武。</div>';
      return;
    }
    this.el.skills.innerHTML =
      '<div class="chips">' + s.skills.map((k) => `<span class="chip">${k}</span>`).join('') + '</div>' +
      `<div class="muted" style="margin-top:8px">${s.f.registered ? '已登记：丁等武牌。' : '未登记。'}</div>`;
  }
}

function clamp(v: number) {
  return Math.max(-10, Math.min(10, v));
}

// 罗盘坐标 -10 ~ 10 换算到 240×240 的画布
function px(x: number) {
  return 120 + x * 10;
}
function py(y: number) {
  return 120 - y * 10;
}

function esc(t: string) {
  return t.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!);
}

/** 一行一段；以“开头的算对白，缩进；【】里的标成武学的颜色 */
function paras(str: string) {
  return str
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const html = esc(t).replace(/【(.+?)】/g, '<span class="skill">【$1】</span>');
      return `<p${t.startsWith('“') ? ' class="q"' : ''}>${html}</p>`;
    })
    .join('');
}
