// One Room = one lobby / match. Owns players, settings, the phase machine, snapshots.
import crypto from 'node:crypto';
import {
  COLORS, HATS, DEFAULT_SETTINGS, SETTING_LIMITS, MIN_PLAYERS, MAX_PLAYERS, BASE_SPEED,
  FLOOR_LOBBY, PLAYER_R, SNAP_EVERY, CELL, clamp,
} from '../shared/constants.js';
import { FLOORS } from '../shared/map.js';
import { stepMove, stairAt, nearStair, lineClear, walkableAt } from '../shared/physics.js';
import * as G from './game.js';
import { BOT_NAMES, tickBots } from './bots.js';

const now = () => Date.now();
export const LOBBY_GRACE_MS = 15000;
export const GAME_GRACE_MS = 60000;

const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>&"']/g, '').trim().slice(0, 12);

export class Room {
  constructor(code, isPublic) {
    this.code = code;
    this.settings = { ...DEFAULT_SETTINGS, isPublic: !!isPublic };
    this.players = new Map();
    this.nextId = 1;
    this.hostId = null;
    this.phase = 'lobby';
    this.bodies = [];
    this.sab = null;
    this.meeting = null;
    this.result = null;
    this.tickN = 0;
    this.createdAt = now();
    this.introUntil = 0; this.emergencyReadyAt = 0; this.sabReadyAt = 0;     this.endedAt = 0;
    this.emptySince = 0;
    this.lobbyChat = [];
  }

  // ---------------------------------------------------------------- messaging
  send(p, obj, droppable = false) { if (p.conn) p.conn.send(JSON.stringify(obj), droppable); }
  broadcast(obj, droppable = false) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.conn) p.conn.send(s, droppable);
  }

  roomView(viewer) {
    const m = this.meeting;
    const view = {
      t: 'room', code: this.code, phase: this.phase, hostId: this.hostId, you: viewer.id,
      settings: this.settings,
      players: [...this.players.values()].filter((p) => !p.left).map((p) => ({
        id: p.id, name: p.name, color: p.color, hat: p.hat, connected: p.connected, bot: !!p.bot,
        alive: this.phase === 'lobby' ? true : p.alive,
      })),
      result: this.result,
    };
    if (this.phase === 'lobby') view.chat = this.lobbyChat.slice(-40);
    if (m) {
      const left = Math.max(0, m.stageEndsAt - now());
      view.meeting = {
        stage: m.stage, left, callerId: m.callerId, bodyId: m.bodyId,
        voted: [...m.votes.keys()], myVote: m.votes.get(viewer.id) ?? null,
        result: m.result,
        chat: m.chat.filter((c) => !c.dead || !viewer.alive).slice(-40),
      };
    }
    return view;
  }
  broadcastRoom() { for (const p of this.players.values()) this.send(p, this.roomView(p)); }

  /** Lobby feed line for joins, leaves and kicks. */
  sysChat(text) {
    const e = { sys: true, text: String(text).slice(0, 90), at: now() };
    this.lobbyChat.push(e);
    if (this.lobbyChat.length > 60) this.lobbyChat.shift();
    this.broadcast({ t: 'chat', ...e });
  }

  // ---------------------------------------------------------------- membership
  get activeCount() { return [...this.players.values()].filter((p) => !p.left).length; }
  get connectedCount() { return [...this.players.values()].filter((p) => p.connected && !p.left).length; }
  get humanCount() { return [...this.players.values()].filter((p) => !p.bot && p.connected && !p.left).length; }
  get full() { return this.activeCount >= this.settings.maxPlayers; }

  freeColor(want, except) {
    const used = new Set([...this.players.values()].filter((p) => p !== except && !p.left).map((p) => p.color));
    if (Number.isInteger(want) && want >= 0 && want < COLORS.length && !used.has(want)) return want;
    for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
    return 0;
  }

  addPlayer(conn, { name, color, hat }) {
    const p = {
      id: this.nextId++, token: crypto.randomBytes(12).toString('hex'),
      name: cleanName(name) || 'Student', color: this.freeColor(color), hat: HATS.includes(hat) ? hat : 'none',
      conn, connected: true, dcAt: 0, left: false,
      x: 0, y: 0, floor: FLOOR_LOBBY, facing: 1, moving: false, alive: true, role: null,
      tasks: [], vent: 0, stairLock: 0, seq: 0, budget: 0.25, lastInput: now(), lastMove: now(),
      killReadyAt: 0, emergencyLeft: 0, taskOpen: null, fixOpen: null, vote: null,
    };
    this.players.set(p.id, p);
    if (this.hostId === null) this.hostId = p.id;
    this.placeInLobby(p);
    if (this.phase === 'lobby' && !p.bot) this.sysChat(`${p.name} joined the lobby`);
    return p;
  }

  addBot() {
    if (this.full) return null;
    const used = new Set([...this.players.values()].filter((p) => !p.left).map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${this.nextId}`;
    const p = this.addPlayer(null, { name, hat: HATS[1 + Math.floor(Math.random() * (HATS.length - 1))] });
    p.bot = true; p.botState = {};
    return p;
  }

  placeInLobby(p) {
    const s = FLOORS[FLOOR_LOBBY].lobbySpawn;
    p.floor = FLOOR_LOBBY;
    for (let i = 0; i < 50; i++) {
      p.x = s.x0 + Math.random() * (s.x1 - s.x0); p.y = s.y0 + Math.random() * (s.y1 - s.y0);
      if (walkableAt(FLOOR_LOBBY, p.x, p.y)) break;
    }
    p.stairLock = 0; p.vent = 0; p.seq++;
  }

  ensureHost() {
    const h = this.players.get(this.hostId);
    if (h && !h.bot && !h.left && h.connected) return;
    const next = [...this.players.values()].find((p) => !p.bot && !p.left && p.connected) || [...this.players.values()].find((p) => !p.bot && !p.left);
    this.hostId = next ? next.id : null;
  }

  attach(p, conn) { // (re)connect
    if (p.conn && p.conn !== conn) { p.conn.replaced = true; p.conn.close(4000); }
    p.conn = conn; p.connected = true; p.dcAt = 0; p.lastInput = now();
  }

  disconnect(p) {
    p.conn = null; p.connected = false; p.dcAt = now(); p.moving = false;
    if (this.phase === 'lobby') { this.ensureHost(); }
    if (this.phase === 'meeting' && this.meeting?.stage === 'voting' && G.alivePlayers(this).filter((q) => q.connected).every((q) => this.meeting.votes.has(q.id))) G.endVoting(this);
    this.broadcastRoom();
  }

  /** Permanently remove (leave button, kick, or reconnect grace expired). */
  removePlayer(p, why = 'left') {
    if (p.left) return;
    if (this.phase === 'lobby') {
      this.players.delete(p.id);
    } else {
      const wasAlive = p.alive;
      p.left = true; p.alive = false; p.conn = null; p.connected = false; p.vent = 0;
      this.bodies = this.bodies.filter((b) => b.id !== p.id);
      if (this.meeting) { this.meeting.votes.delete(p.id); for (const [v, t] of [...this.meeting.votes]) if (t === p.id) this.meeting.votes.set(v, 'skip'); }
      if (this.activeCount < 2 && (this.phase === 'playing' || this.phase === 'meeting')) {
        G.endGame(this, p.role === 'imp' ? 'crew' : 'imp', 'Not enough players left');
      } else if (!G.checkWin(this) && this.phase === 'meeting' && this.meeting?.stage === 'voting' && wasAlive) {
        const vs = G.alivePlayers(this).filter((q) => q.connected);
        if (vs.length && vs.every((q) => this.meeting.votes.has(q.id))) G.endVoting(this);
      }
    }
    if (p.conn) { p.conn.close(1000); }
    this.ensureHost();
    if (this.phase === 'lobby') this.sysChat(`${p.name} ${why === 'kicked' ? 'was kicked' : 'left the lobby'}`);
    this.broadcast({ t: 'ev', e: 'left', id: p.id, name: p.name });
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------- client messages
  handle(p, m) {
    switch (m.t) {
      case 'ping': this.send(p, { t: 'pong', c: m.c }); return;
      case 'input': return this.onInput(p, m);
      case 'cosmetic': return this.onCosmetic(p, m);
      case 'settings': return this.onSettings(p, m);
      case 'start': return this.onStart(p);
      case 'addBot': if (p.id === this.hostId && this.phase === 'lobby' && this.addBot()) this.broadcastRoom(); return;
      case 'kick': return this.onKick(p, m);
      case 'toLobby': if (p.id === this.hostId && (this.phase === 'ended' || this.phase === 'playing' || this.phase === 'meeting')) G.backToLobby(this); return;
      case 'taskStart': return G.taskStart(this, p, m.tid);
      case 'taskDone': return G.taskDone(this, p, m.tid);
      case 'taskCancel': return G.taskCancel(this, p);
      case 'fixStart': return G.fixStart(this, p, m.id);
      case 'fixDone': return G.fixDone(this, p, m.id);
      case 'kill': return G.kill(this, p, m.target);
      case 'report': return G.report(this, p, m.body);
      case 'emergency': return G.emergency(this, p);
      case 'sabotage': return G.sabotage(this, p, m.kind);
      case 'vent': return G.vent(this, p, m.action, m.id | 0);
      case 'chat': return G.chat(this, p, m.text);
      case 'vote': return G.vote(this, p, m.target === 'skip' ? 'skip' : m.target | 0);
      default: return;
    }
  }

  onCosmetic(p, m) {
    if (this.phase !== 'lobby') return;
    if (m.name !== undefined) p.name = cleanName(m.name) || p.name;
    if (m.hat !== undefined && HATS.includes(m.hat)) p.hat = m.hat;
    if (m.color !== undefined) {
      const c = m.color | 0;
      const taken = [...this.players.values()].some((q) => q !== p && !q.left && q.color === c);
      if (c >= 0 && c < COLORS.length && !taken) p.color = c;
      else this.send(p, { t: 'toast', msg: 'That colour is taken' });
    }
    this.broadcastRoom();
  }

  onSettings(p, m) {
    if (p.id !== this.hostId || this.phase !== 'lobby') return;
    const s = m.settings || {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!(key in s)) continue;
      const v = s[key];
      if (typeof DEFAULT_SETTINGS[key] === 'boolean') this.settings[key] = !!v;
      else if (typeof DEFAULT_SETTINGS[key] === 'number') {
        const [lo, hi] = SETTING_LIMITS[key] || [-Infinity, Infinity];
        let n = clamp(Number(v) || 0, lo, hi);
        if (key === 'maxPlayers') n = Math.max(Math.round(n), this.activeCount);
        if (['impostors', 'tasksPerPlayer', 'emergencyMeetings', 'discussionTime', 'voteTime', 'killCooldown'].includes(key)) n = Math.round(n);
        this.settings[key] = n;
      }
    }
    // Two impostors need six seats, so never leave the room too small for its own rules.
    if (this.settings.impostors >= 2 && this.settings.maxPlayers < 6) this.settings.maxPlayers = 6;
    this.broadcastRoom();
  }

  onKick(p, m) {
    if (p.id !== this.hostId || this.phase !== 'lobby') return;
    const t = this.players.get(m.id | 0);
    if (!t || t === p) return;
    this.send(t, { t: 'kicked' });
    this.removePlayer(t, 'kicked');
    t.conn = null;
  }

  onStart(p) {
    if (p.id !== this.hostId || this.phase !== 'lobby') return;
    if ([...this.players.values()].some((q) => !q.left && !q.connected)) return this.send(p, { t: 'toast', msg: 'Waiting for players to reconnect' });
    const minimum = this.settings.impostors >= 2 ? 6 : MIN_PLAYERS;
    if (this.settings.maxPlayers < minimum) return this.send(p, { t: 'toast', msg: `Increase the player limit to ${minimum} for two impostors` });
    while (this.activeCount < minimum) { if (!this.addBot()) break; }
    G.startGame(this);
  }

  onInput(p, m) {
    if (this.phase !== 'lobby' && this.phase !== 'playing') return;
    if (p.left) return;
    const t = now();
    const elapsed = Math.min(500, t - p.lastInput) / 1000;
    p.lastInput = t;
    p.budget = Math.min(0.4, p.budget + elapsed);
    let dt = clamp(Number(m.dt) || 0, 0, 0.12);
    dt = Math.min(dt, p.budget);
    p.budget -= dt;
    const seq = m.seq | 0;
    if (seq > p.seq) p.seq = seq;
    if (this.phase === 'playing' && (t < this.introUntil || p.vent)) { p.moving = false; return; }
    let dx = Number(m.dx) || 0, dy = Number(m.dy) || 0;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    if (len < 0.05 || dt <= 0) { p.moving = false; return; }
    const speed = BASE_SPEED * this.settings.speed;
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    const step = dt / n;
    const noclip = this.phase === 'playing' && !p.alive;
    const ox = p.x, oy = p.y;
    for (let i = 0; i < n; i++) {
      [p.x, p.y] = stepMove(p.floor, p.x, p.y, dx * speed * step, dy * speed * step, noclip);
      this.stairs(p);
    }
    p.moving = Math.hypot(p.x - ox, p.y - oy) > 0.1;
    p.lastMove = t;
    if (Math.abs(dx) > 0.1) p.facing = dx > 0 ? 1 : -1;
  }

  stairs(p) {
    if (this.phase !== 'playing' || p.floor === FLOOR_LOBBY) return;
    if (p.stairLock) { if (!nearStair(p.x, p.y)) p.stairLock = 0; return; }
    const s = stairAt(p.x, p.y);
    if (s) { p.floor = 1 - p.floor; p.stairLock = s.id; }
  }

  // ---------------------------------------------------------------- reconnect snapshot
  fullSync(p) {
    this.send(p, this.roomView(p));
    if (p.role && (this.phase === 'playing' || this.phase === 'meeting' || this.phase === 'ended')) {
      const imps = [...this.players.values()].filter((q) => q.role === 'imp');
      this.send(p, { t: 'start', role: p.role, introMs: 0, mates: p.role === 'imp' ? imps.map((q) => q.id) : [], tasks: p.tasks, fake: p.role === 'imp', resync: true });
    }
  }

  // ---------------------------------------------------------------- tick
  tick() {
    this.tickN++;
    const t = now();
    if (this.tickN % 30 === 0) this.upkeep(t);
    if (this.phase === 'playing') G.tickPlaying(this);
    if (this.phase === 'meeting') G.tickMeeting(this);
    if (this.phase === 'playing' || this.phase === 'meeting') tickBots(this, t);
    if (this.phase === 'ended' && t - this.endedAt > G.END_SCREEN_MS) G.backToLobby(this);
    for (const p of this.players.values()) if (p.moving && t - p.lastInput > 300) p.moving = false;
    if (this.tickN % SNAP_EVERY === 0 && (this.phase === 'lobby' || this.phase === 'playing')) this.snapshots();
  }

  upkeep(t) {
    for (const p of [...this.players.values()]) {
      if (p.left || p.connected) continue;
      const grace = this.phase === 'lobby' ? LOBBY_GRACE_MS : GAME_GRACE_MS;
      if (t - p.dcAt > grace) this.removePlayer(p, 'timeout');
    }
    if (this.humanCount === 0) { if (!this.emptySince) this.emptySince = t; } else this.emptySince = 0;
  }

  snapshots() {
    const all = [...this.players.values()].filter((p) => !p.left);
    const t = now();
    const [done, total] = G.progress(this);
    const sab = this.sab ? { kind: this.sab.kind, left: this.sab.endsAt ? Math.max(0, this.sab.endsAt - t) : 0, fixed: this.sab.fixed } : null;
    for (const v of all) {
      if (!v.conn) continue;
      const vis = this.phase === 'lobby' ? 99999 : G.visionOf(this, v);
      const ghost = this.phase === 'playing' && !v.alive;
      const ps = [];
      for (const q of all) {
        if (q === v) continue;
        if (this.phase === 'playing') {
          if (!q.alive && !ghost) continue;
          if (q.vent && !ghost) continue;
          if (!ghost) {
            if (q.floor !== v.floor) continue;
            const d = Math.hypot(q.x - v.x, q.y - v.y);
            if (d > vis + 40) continue;
            if (d > 30 && !lineClear(v.floor, v.x, v.y, q.x, q.y)) continue;
          }
        }
        ps.push([q.id, Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, q.floor, q.facing, q.moving ? 1 : 0, q.alive ? 0 : 1]);
      }
      const bodies = [];
      for (const b of this.bodies) {
        if (!ghost) {
          if (b.floor !== v.floor) continue;
          const d = Math.hypot(b.x - v.x, b.y - v.y);
          if (d > vis + 40 || (d > 30 && !lineClear(v.floor, v.x, v.y, b.x, b.y))) continue;
        }
        bodies.push([b.id, b.x, b.y, b.floor, b.color]);
      }
      this.send(v, {
        t: 'snap', ack: v.seq, ph: this.phase,
        me: {
          x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10, f: v.floor, vis, alive: v.alive ? 1 : 0, vent: v.vent,
          kcd: Math.max(0, v.killReadyAt - t), scd: Math.max(0, this.sabReadyAt - t), ecd: Math.max(0, this.emergencyReadyAt - t),
          emg: v.emergencyLeft, intro: Math.max(0, this.introUntil - t),
        },
        ps, bodies, prog: [done, total], sab,
      }, true);
    }
  }
}
