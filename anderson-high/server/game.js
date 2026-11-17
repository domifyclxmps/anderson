// Authoritative game rules. Every function receives the Room and mutates it.
import {
  USE_RANGE, KILL_RANGE, REPORT_RANGE, START_KILL_DELAY, EMERGENCY_DELAY, SABOTAGE_COOLDOWN,
  FIRE_TIME, FLOOR_1, FLOOR_LOBBY, VISION_BASE, LIGHTS_OUT_VISION, VENT_COOLDOWN,
} from '../shared/constants.js';
import { SPAWNS, ALL_VENTS, roomName } from '../shared/map.js';
import { witnessed } from './bots.js';
import { lineClear, walkableAt } from '../shared/physics.js';
import { TASK_BY_ID, STATIONS, pickTasks } from '../shared/tasks.js';

// AH_FAST=1 shortens the waiting timers so automated tests finish quickly. Never set in normal play.
const FAST = process.env.AH_FAST === '1';
const sc = (ms) => (FAST ? Math.max(200, ms / 10) : ms);
export const INTRO_MS = sc(5000);
export const MIN_TASK_MS = 2200;      // a minigame can't be finished faster than this
export const RESULTS_MS = sc(7000);
export const EJECT_MS = sc(6000);
export const END_SCREEN_MS = sc(14000);

const now = () => Date.now();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Can player p touch something at (x,y) on `floor` within `range`? */
export function canReach(p, floor, x, y, range = USE_RANGE) {
  if (p.floor !== floor || p.vent) return false;
  const d = Math.hypot(p.x - x, p.y - y);
  return d <= range && (d < 24 || lineClear(floor, p.x, p.y, x, y));
}

export function isImp(p) { return p.role === 'imp'; }
export const alivePlayers = (r) => [...r.players.values()].filter((p) => !p.left && p.alive);

// ------------------------------------------------------------------ start
export function startGame(r) {
  const ps = [...r.players.values()].filter((p) => !p.left);
  shuffle(ps);
  const impCount = Math.min(r.settings.impostors, Math.floor((ps.length - 1) / 2));
  const spawns = shuffle(SPAWNS.slice());
  ps.forEach((p, i) => {
    if (p.bot) p.botState = {};
    p.role = i < impCount ? 'imp' : 'crew';
    p.alive = true; p.vent = 0; p.vote = null; p.taskOpen = null; p.fixOpen = null;
    p.floor = FLOOR_1; p.x = spawns[i % spawns.length].x; p.y = spawns[i % spawns.length].y;
    p.stairLock = 0; p.moving = false; p.seq = 0;
    p.emergencyLeft = r.settings.emergencyMeetings;
    p.tasks = pickTasks(r.settings.tasksPerPlayer).map((tid) => ({ tid, done: false }));
    p.killReadyAt = now() + INTRO_MS + sc(START_KILL_DELAY * 1000);
  });
  r.bodies = []; r.sab = null; r.result = null; r.meeting = null;
  r.sabReadyAt = now() + INTRO_MS + sc(15000);
  r.emergencyReadyAt = now() + INTRO_MS + sc(EMERGENCY_DELAY * 1000);
  r.introUntil = now() + INTRO_MS;
  r.phase = 'playing';
  const imps = ps.filter(isImp);
  for (const p of ps) {
    r.send(p, {
      t: 'start', role: p.role, introMs: INTRO_MS,
      mates: isImp(p) ? imps.map((q) => q.id) : [],
      tasks: p.tasks, fake: isImp(p),
    });
  }
  r.broadcastRoom();
}

// ------------------------------------------------------------------ progress / win
export function progress(r) {
  let done = 0, total = 0;
  for (const p of r.players.values()) {
    if (p.left || p.role !== 'crew') continue;
    for (const t of p.tasks) { total++; if (t.done) done++; }
  }
  return [done, total];
}

export function checkWin(r) {
  if (r.phase !== 'playing' && r.phase !== 'meeting') return false;
  const live = alivePlayers(r);
  const imps = live.filter(isImp).length, crew = live.length - imps;
  const [done, total] = progress(r);
  if (imps === 0) { endGame(r, 'crew', 'All impostors were voted out'); return true; }
  if (total > 0 && done >= total) { endGame(r, 'crew', 'All tasks completed'); return true; }
  if (imps >= crew) { endGame(r, 'imp', 'The impostors outnumber the crew'); return true; }
  return false;
}

export function endGame(r, winner, reason) {
  if (r.phase === 'ended' || r.phase === 'lobby') return;
  r.phase = 'ended';
  r.endedAt = now();
  r.sab = null;
  r.result = {
    winner, reason,
    roles: [...r.players.values()].filter((p) => p.role).map((p) => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, role: p.role, alive: p.alive && !p.left })),
  };
  r.meeting = null;
  r.broadcastRoom();
}

export function backToLobby(r) {
  r.phase = 'lobby';
  r.result = null; r.meeting = null; r.bodies = []; r.sab = null;
  for (const [id, p] of [...r.players]) {
    if (p.left || (!p.connected)) { r.players.delete(id); continue; }
    p.role = null; p.tasks = []; p.alive = true; p.vent = 0; p.vote = null; p.taskOpen = null;
    r.placeInLobby(p);
  }
  r.ensureHost();
  r.broadcastRoom();
}

// ------------------------------------------------------------------ tasks
export function taskStart(r, p, tid) {
  if (r.phase !== 'playing') return;
  const task = p.tasks.find((t) => t.tid === tid);
  const def = TASK_BY_ID[tid];
  if (!task || !def || task.done) return;
  if (!canReach(p, def.floor, def.x, def.y, USE_RANGE + 14)) return;
  p.taskOpen = { tid, at: now() };
  r.send(p, { t: 'taskBegin', tid, seed: (Math.random() * 1e9) | 0 });
}

export function taskDone(r, p, tid) {
  if (r.phase !== 'playing') return;
  const open = p.taskOpen;
  if (!open || open.tid !== tid) return;
  if (now() - open.at < MIN_TASK_MS) { r.send(p, { t: 'taskDenied', tid, why: 'too fast' }); return; }
  const task = p.tasks.find((t) => t.tid === tid);
  const def = TASK_BY_ID[tid];
  p.taskOpen = null;
  if (!task || !def || task.done) return;
  if (!canReach(p, def.floor, def.x, def.y, USE_RANGE * 2.2)) return;
  if (isImp(p)) { task.done = true; r.send(p, { t: 'taskOk', tid }); return; } // decoy: does nothing for the team
  task.done = true;
  r.send(p, { t: 'taskOk', tid });
  r.broadcast({ t: 'ev', e: 'task' }, true);
  checkWin(r);
}

export function taskCancel(r, p) { p.taskOpen = null; p.fixOpen = null; }

// ------------------------------------------------------------------ kill / report / emergency
export function kill(r, p, targetId) {
  if (r.phase !== 'playing' || !p.alive || !isImp(p) || p.vent) return;
  const t = now();
  if (t < r.introUntil || t < p.killReadyAt) return;
  const v = r.players.get(targetId);
  if (!v || v.left || !v.alive || isImp(v) || v.vent) return;
  if (v.floor !== p.floor || dist(p, v) > KILL_RANGE || !lineClear(p.floor, p.x, p.y, v.x, v.y)) return;
  witnessed(r, p, `I saw ${p.name} eliminate ${v.name} in ${roomName(v.floor, v.x, v.y)}!`, p.id, v);
  v.alive = false; v.taskOpen = null; v.fixOpen = null;
  r.bodies.push({ id: v.id, x: v.x, y: v.y, floor: v.floor, color: v.color });
  p.x = v.x; p.y = v.y; p.stairLock = 0; p.seq++;
  p.killReadyAt = t + r.settings.killCooldown * 1000;
  r.send(v, { t: 'killed', by: p.id });
  r.broadcast({ t: 'ev', e: 'kill', x: v.x, y: v.y, f: v.floor }, true);
  r.broadcastRoom();
  checkWin(r);
}

export function report(r, p, bodyId) {
  if (r.phase !== 'playing' || !p.alive || p.vent) return;
  const b = r.bodies.find((x) => x.id === bodyId);
  if (!b || !canReach(p, b.floor, b.x, b.y, REPORT_RANGE)) return;
  startMeeting(r, p, b);
}

export function emergency(r, p) {
  const st = STATIONS.emergency;
  if (r.phase !== 'playing' || !p.alive || p.emergencyLeft <= 0) return;
  if (now() < r.emergencyReadyAt || now() < r.introUntil) { r.send(p, { t: 'toast', msg: 'The bell is not ready yet' }); return; }
  if (r.sab?.kind === 'fire') { r.send(p, { t: 'toast', msg: 'Can\'t call a meeting during a fire drill' }); return; }
  if (!canReach(p, st.floor, st.x, st.y)) return;
  p.emergencyLeft--;
  startMeeting(r, p, null);
}

// ------------------------------------------------------------------ vents (impostor only)
export function vent(r, p, action, id) {
  if (r.phase !== 'playing' || !p.alive || !isImp(p)) return;
  const all = ALL_VENTS;
  if (action === 'enter') {
    if (p.vent) return;
    const v = all.find((x) => x.id === id);
    if (!v || !canReach(p, v.floor, v.x, v.y, USE_RANGE)) return;
    if (now() < r.introUntil) return;
    witnessed(r, p, `I saw ${p.name} enter a vent near ${roomName(v.floor, v.x, v.y)}!`);
    p.vent = v.id; p.x = v.x; p.y = v.y; p.ventAt = now(); p.taskOpen = null;
  } else if (action === 'move') {
    if (!p.vent || now() - p.ventAt < VENT_COOLDOWN * 500) return;
    const cur = all.find((x) => x.id === p.vent);
    const dst = all.find((x) => x.id === id);
    if (!cur || !dst || !cur.links.includes(dst.id)) return;
    p.vent = dst.id; p.x = dst.x; p.y = dst.y; p.floor = dst.floor; p.ventAt = now(); p.seq++;
  } else if (action === 'exit') {
    if (!p.vent) return;
    const cur = all.find((x) => x.id === p.vent);
    p.vent = 0; p.seq++;
    if (cur) { p.floor = cur.floor; witnessed(r, p, `I saw ${p.name} come out of a vent near ${roomName(cur.floor, cur.x, cur.y)}!`); }
    // nudge out of the grate if somebody's tiny collision would trap us (vents are on free floor so this is a safety net)
    if (!walkableAt(p.floor, p.x, p.y)) { p.x += 24; }
  }
}

// ------------------------------------------------------------------ sabotage
export function sabotage(r, p, kind) {
  if (r.phase !== 'playing' || !p.alive || !isImp(p) || r.sab) return;
  if (now() < r.sabReadyAt || now() < r.introUntil) return;
  if (kind === 'lights') r.sab = { kind: 'lights', fixed: {} };
  else if (kind === 'fire') r.sab = { kind: 'fire', fixed: { a: false, b: false }, endsAt: now() + FIRE_TIME * 1000 };
  else return;
  r.broadcast({ t: 'ev', e: 'sabotage', kind });
}

export function fixStart(r, p, id) {
  const st = STATIONS[id];
  if (r.phase !== 'playing' || !st || !r.sab || p.role === null) return;
  const okStation = (r.sab.kind === 'lights' && id === 'fix_lights') || (r.sab.kind === 'fire' && (id === 'fire_a' || id === 'fire_b'));
  if (!okStation || !canReach(p, st.floor, st.x, st.y, USE_RANGE + 14)) return;
  p.fixOpen = { id, at: now() };
  r.send(p, { t: 'fixBegin', id, seed: (Math.random() * 1e9) | 0 });
}

export function fixDone(r, p, id) {
  const open = p.fixOpen;
  if (!open || open.id !== id || !r.sab || r.phase !== 'playing') return;
  if (now() - open.at < 1200) return;
  const st = STATIONS[id];
  p.fixOpen = null;
  if (!canReach(p, st.floor, st.x, st.y, USE_RANGE * 2.2)) return;
  if (id === 'fix_lights' && r.sab.kind === 'lights') clearSabotage(r);
  else if (r.sab.kind === 'fire' && (id === 'fire_a' || id === 'fire_b')) {
    r.sab.fixed[id === 'fire_a' ? 'a' : 'b'] = true;
    if (r.sab.fixed.a && r.sab.fixed.b) clearSabotage(r);
  }
}

export function clearSabotage(r) {
  if (!r.sab) return;
  r.sab = null;
  r.sabReadyAt = now() + SABOTAGE_COOLDOWN * 1000;
  r.broadcast({ t: 'ev', e: 'sabFixed' });
}

// ------------------------------------------------------------------ meetings
export function startMeeting(r, caller, body) {
  if (r.phase !== 'playing') return;
  r.phase = 'meeting';
  const disc = r.settings.discussionTime;
  r.meeting = {
    stage: disc > 0 ? 'discussion' : 'voting',
    stageEndsAt: now() + (disc > 0 ? disc : r.settings.voteTime) * 1000,
    callerId: caller.id, bodyId: body ? body.id : null,
    votes: new Map(), chat: [], result: null,
  };
  if (r.sab) { r.sab = null; }
  r.bodies = [];
  for (const p of r.players.values()) { p.taskOpen = null; p.fixOpen = null; p.vent = 0; p.moving = false; p.vote = null; }
  r.broadcast({ t: 'ev', e: 'meeting', body: !!body });
  r.broadcastRoom();
}

export function chat(r, p, text) {
  if (p.left) return;
  text = String(text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 140);
  if (!text) return;
  const t = now();
  if (t - (p.lastChat || 0) < 700) return;
  p.lastChat = t;
  // Lobby chat: everyone waiting in the room, no alive/dead filtering.
  if (r.phase === 'lobby') {
    const entry = { id: p.id, name: p.name, color: p.color, text, at: t };
    r.lobbyChat.push(entry);
    if (r.lobbyChat.length > 60) r.lobbyChat.shift();
    r.broadcast({ t: 'chat', ...entry });
    return;
  }
  const m = r.meeting;
  if (r.phase !== 'meeting' || !m || m.stage === 'results' || m.stage === 'eject') return;
  const entry = { id: p.id, text, dead: !p.alive };
  m.chat.push(entry);
  if (m.chat.length > 60) m.chat.shift();
  for (const q of r.players.values()) {
    if (entry.dead && q.alive) continue; // ghosts only talk to ghosts
    r.send(q, { t: 'chat', ...entry });
  }
}

export function vote(r, p, target) {
  const m = r.meeting;
  if (r.phase !== 'meeting' || !m || m.stage !== 'voting' || !p.alive || p.left) return;
  if (m.votes.has(p.id)) return;
  if (target !== 'skip') {
    const v = r.players.get(target);
    if (!v || v.left || !v.alive || v.id === p.id) return;
  }
  m.votes.set(p.id, target);
  r.broadcastRoom();
  if (allVoted(r)) endVoting(r);
}

function voters(r) { return alivePlayers(r); }
function allVoted(r) {
  const vs = voters(r).filter((p) => p.connected);
  return vs.length > 0 && vs.every((p) => r.meeting.votes.has(p.id));
}

export function endVoting(r) {
  const m = r.meeting;
  const tally = new Map();
  let skips = 0;
  for (const [, tgt] of m.votes) { if (tgt === 'skip') skips++; else tally.set(tgt, (tally.get(tgt) || 0) + 1); }
  let best = null, bestN = 0, tie = false;
  for (const [id, n] of tally) { if (n > bestN) { best = id; bestN = n; tie = false; } else if (n === bestN) tie = true; }
  let ejected = null;
  if (best !== null && !tie && bestN > skips) ejected = best;
  const ep = ejected !== null ? r.players.get(ejected) : null;
  m.result = {
    votes: [...m.votes].map(([voter, target]) => ({ voter, target })),
    skips,
    ejected: ep ? { id: ep.id, name: ep.name, color: ep.color, hat: ep.hat, wasImp: r.settings.confirmEjects ? isImp(ep) : null } : null,
    tie: tie && best !== null,
  };
  if (ep) { ep.alive = false; }
  m.result.impsLeft = r.settings.confirmEjects ? alivePlayers(r).filter(isImp).length : null;
  m.stage = 'results';
  m.stageEndsAt = now() + RESULTS_MS;
  r.broadcastRoom();
}

/** Called each tick during a meeting. */
export function tickMeeting(r) {
  const m = r.meeting; if (!m) return;
  const t = now();
  if (m.stage === 'discussion' && t >= m.stageEndsAt) {
    m.stage = 'voting'; m.stageEndsAt = t + r.settings.voteTime * 1000; r.broadcastRoom();
  } else if (m.stage === 'voting' && t >= m.stageEndsAt) {
    endVoting(r);
  } else if (m.stage === 'results' && t >= m.stageEndsAt) {
    m.stage = 'eject'; m.stageEndsAt = t + EJECT_MS; r.broadcastRoom();
  } else if (m.stage === 'eject' && t >= m.stageEndsAt) {
    finishMeeting(r);
  }
}

function finishMeeting(r) {
  r.meeting = null;
  if (checkWin(r)) return;
  r.phase = 'playing';
  const t = now();
  const spawns = shuffle(SPAWNS.slice());
  let i = 0;
  for (const p of r.players.values()) {
    if (p.left) continue;
    const s = spawns[i++ % spawns.length];
    p.x = s.x; p.y = s.y; p.floor = FLOOR_1; p.stairLock = 0; p.seq++;
    p.killReadyAt = t + r.settings.killCooldown * 1000;
    if (p.bot) { p.botState.evidence = null; p.botState.report = null; p.botState.path = null; }
  }
  r.introUntil = t + 1500;
  r.emergencyReadyAt = t + EMERGENCY_DELAY * 1000;
  r.sabReadyAt = t + 15000;
  r.broadcastRoom();
}

// ------------------------------------------------------------------ per-tick rules
export function tickPlaying(r) {
  if (r.sab?.kind === 'fire' && now() >= r.sab.endsAt) endGame(r, 'imp', 'The fire drill was not stopped in time');
}

export function visionOf(r, p) {
  if (!p.alive) return 99999;
  if (isImp(p)) return VISION_BASE * r.settings.impVision;
  let v = VISION_BASE * r.settings.crewVision;
  if (r.sab?.kind === 'lights') v *= LIGHTS_OUT_VISION;
  return v;
}
