// Headless test client: speaks the real WebSocket protocol and walks the real map (BFS over the shared grid).
import { FLOORS, STAIRS } from '../../shared/map.js';
import { collides, stairAt, nearStair } from '../../shared/physics.js';
import { COLS, ROWS, CELL } from '../../shared/constants.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

const free = (f, c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !collides(FLOORS[f].grid, (c + .5) * CELL, (r + .5) * CELL);
const cc = (c) => (c + .5) * CELL;

/** BFS path [{f,x,y}...] from (f,x,y) to (tf,tx,ty), crossing stairs like the server does. */
export function findPath(f0, x0, y0, tf, tx, ty) {
  const key = (f, c, r, l) => ((f * ROWS + r) * COLS + c) * 2 + l;
  const sc = Math.floor(x0 / CELL), sr = Math.floor(y0 / CELL);
  const start = [f0, sc, sr, nearStair(x0, y0) ? 1 : 0];
  const prev = new Map([[key(...start), null]]);
  const q = [start];
  const gc = Math.floor(tx / CELL), gr = Math.floor(ty / CELL);
  let goal = null;
  while (q.length) {
    const cur = q.shift();
    const [f, c, r, l] = cur;
    if (f === tf && c === gc && r === gr) { goal = cur; break; }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (!free(f, nc, nr)) continue;
      let nf = f, nl = l;
      const x = cc(nc), y = cc(nr);
      if (l) { if (!nearStair(x, y)) nl = 0; } else if (stairAt(x, y)) { nf = 1 - f; nl = 1; }
      if (nf !== f && !free(nf, nc, nr)) continue;
      const k = key(nf, nc, nr, nl);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      q.push([nf, nc, nr, nl]);
    }
  }
  if (!goal) return null;
  const out = [];
  for (let s = goal; s; s = prev.get(key(...s))) out.push({ f: s[0], x: cc(s[1]), y: cc(s[2]) });
  return out.reverse();
}

export class Bot {
  constructor(name, port) {
    this.name = name; this.port = port; this.msgs = []; this.room = null; this.snap = null; this.start = null;
    this.events = []; this.errs = []; this.toasts = []; this.chat = []; this.killed = false; this.seq = 0; this.pos = null;
    this.tasksDone = []; this.taskBegin = null; this.fixBegin = null; this.kicked = false;
  }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);
      this.ws.onopen = () => res(this);
      this.ws.onerror = (e) => rej(e);
      this.ws.onmessage = (ev) => this.onMsg(JSON.parse(ev.data));
      this.ws.onclose = () => { this.closed = true; };
    });
  }
  onMsg(m) {
    switch (m.t) {
      case 'joined': this.joined = m; this.id = m.id; this.token = m.token; this.code = m.code; break;
      case 'room': this.room = m; break;
      case 'snap': this.snap = m; this.pos = m.me; break;
      case 'start': this.start = m; this.role = m.role; this.myTasks = m.tasks; break;
      case 'err': this.errs.push(m.msg); break;
      case 'toast': this.toasts.push(m.msg); break;
      case 'ev': this.events.push(m); break;
      case 'chat': this.chat.push(m); break;
      case 'killed': this.killed = true; break;
      case 'taskBegin': this.taskBegin = m; break;
      case 'taskOk': this.tasksDone.push(m.tid); break;
      case 'fixBegin': this.fixBegin = m; break;
      case 'kicked': this.kicked = true; break;
      case 'reconnectFailed': this.reconnectFailed = true; break;
    }
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async until(fn, ms = 8000, label = 'condition') {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(15); }
    throw new Error(`timeout waiting for ${label} (bot ${this.name})`);
  }
  async join(code) { this.send({ t: 'join', code, name: this.name }); }
  async walkTo(f, x, y, tol = 14, ms = 60000) {
    const t0 = Date.now();
    let path = null, cur = 0, lastProg = Date.now(), lastIdx = -1;
    while (Date.now() - t0 < ms) {
      const me = this.pos;
      if (me && me.f === f && Math.hypot(me.x - x, me.y - y) <= tol) return;
      if (!me) { await sleep(30); continue; }
      if (!path || Date.now() - lastProg > 2500) { path = findPath(me.f, me.x, me.y, f, x, y); cur = 0; lastProg = Date.now(); if (!path) throw new Error(`no path for ${this.name} to ${f} ${x},${y}`); }
      for (let i = Math.min(path.length - 1, cur + 2); i >= cur; i--) if (path[i].f === me.f && Math.hypot(path[i].x - me.x, path[i].y - me.y) < 11) { cur = i + 1; if (i > lastIdx) { lastIdx = i; lastProg = Date.now(); } break; }
      const tgt = cur >= path.length ? { x, y } : path[cur];
      const dx = tgt.x - me.x, dy = tgt.y - me.y, d = Math.hypot(dx, dy) || 1;
      this.send({ t: 'input', seq: ++this.seq, dx: dx / d, dy: dy / d, dt: 1 / 30 });
      await sleep(33);
    }
    throw new Error(`walkTo timeout (${this.name}) pos=${JSON.stringify(this.pos)} want ${f} ${x},${y}`);
  }
  stop() { this.send({ t: 'input', seq: ++this.seq, dx: 0, dy: 0, dt: 0 }); }
  close() { try { this.ws.close(); } catch {} }
}
