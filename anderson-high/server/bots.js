// Server-side players use the same movement and game rules as human players.
import { BASE_SPEED, CELL, COLS, ROWS, KILL_RANGE, REPORT_RANGE, TICK_RATE } from '../shared/constants.js';
import { FLOORS, ALL_VENTS, roomName } from '../shared/map.js';
import { collides, lineClear, nearStair, stairAt } from '../shared/physics.js';
import { TASK_BY_ID, STATIONS } from '../shared/tasks.js';
import * as G from './game.js';

export const BOT_NAMES = ['Nova', 'Pixel', 'Riley', 'Echo', 'Juno', 'Cosmo', 'Mochi', 'Scout', 'Orbit'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (n) => (n + 0.5) * CELL;
const free = (f, c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !collides(FLOORS[f].grid, center(c), center(r));

// Cell-centre BFS includes stair locks so a route doesn't immediately flip back.
function findPath(p, target) {
  const key = (f, c, r, locked) => ((f * ROWS + r) * COLS + c) * 2 + locked;
  const start = [p.floor, Math.floor(p.x / CELL), Math.floor(p.y / CELL), p.stairLock ? 1 : 0];
  const goalC = Math.floor(target.x / CELL), goalR = Math.floor(target.y / CELL);
  const queue = [start], previous = new Map([[key(...start), null]]);
  let goal = null;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head], [floor, col, row, locked] = current;
    if (floor === target.floor && col === goalC && row === goalR) { goal = current; break; }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc, r = row + dr;
      if (!free(floor, c, r)) continue;
      const x = center(c), y = center(r);
      let f = floor, lock = locked;
      if (lock) { if (!nearStair(x, y)) lock = 0; }
      else if (stairAt(x, y)) { f = 1 - floor; lock = 1; }
      if (f !== floor && !free(f, c, r)) continue;
      const k = key(f, c, r, lock);
      if (previous.has(k)) continue;
      previous.set(k, current); queue.push([f, c, r, lock]);
    }
  }
  if (!goal) return [];
  const path = [];
  for (let s = goal; s; s = previous.get(key(...s))) path.push({ floor: s[0], x: center(s[1]), y: center(s[2]) });
  return path.reverse().slice(1);
}

function walk(r, p, target, t) {
  const b = p.botState;
  const key = `${target.floor}:${Math.floor(target.x / CELL)}:${Math.floor(target.y / CELL)}`;
  if (key !== b.pathKey || !b.path || t - b.pathAt > 5000) {
    b.path = findPath(p, target); b.pathKey = key; b.pathAt = t;
  }
  while (b.path.length && b.path[0].floor === p.floor && distance(p, b.path[0]) < 7) b.path.shift();
  const next = b.path[0] || (p.floor === target.floor && Math.floor(p.x / CELL) === Math.floor(target.x / CELL) && Math.floor(p.y / CELL) === Math.floor(target.y / CELL) ? target : null);
  if (!next) { p.moving = false; return; }
  const dx = next.x - p.x, dy = next.y - p.y, d = Math.hypot(dx, dy);
  if (d < 1) return;
  // Shorten the final step to avoid oscillating around a waypoint.
  r.onInput(p, { seq: p.seq + 1, dx: dx / d, dy: dy / d, dt: Math.min(1 / TICK_RATE, d / (BASE_SPEED * r.settings.speed)) });
}

function visible(r, observer, p) {
  return p !== observer && !p.left && p.alive && !p.vent && p.floor === observer.floor && distance(observer, p) <= G.visionOf(r, observer) && lineClear(observer.floor, observer.x, observer.y, p.x, p.y);
}

// Record only what a living bot could actually see, never hidden roles.
export function witnessed(r, actor, description, suspect = actor.id, victim = null) {
  for (const p of r.players.values()) {
    if (!p.bot || !p.alive || p.left || p === actor || !visible(r, p, actor) || (victim && !visible(r, p, victim))) continue;
    p.botState.evidence = { text: description, suspect, at: Date.now() };
  }
}

function playing(r, p, t) {
  const b = p.botState;
  if (t < r.introUntil) return;
  if (p.vent) {
    if (t >= b.ventExitAt) G.vent(r, p, 'exit', 0);
    else if (!b.ventMoved && t - p.ventAt >= 600) {
      const current = ALL_VENTS.find((v) => v.id === p.vent);
      if (current?.links.length) G.vent(r, p, 'move', current.links[Math.floor(Math.random() * current.links.length)]);
      b.ventMoved = true;
    }
    return;
  }
  if (p.alive) {
    const body = r.bodies.find((x) => G.canReach(p, x.floor, x.x, x.y, REPORT_RANGE));
    if (body) { b.report = { name: r.players.get(body.id)?.name || 'someone', room: roomName(body.floor, body.x, body.y) }; G.report(r, p, body.id); return; }
    if (p.role === 'imp') {
      const target = [...r.players.values()].filter((q) => q.role !== 'imp' && visible(r, p, q)).sort((a, c) => distance(p, a) - distance(p, c))[0];
      if (target && t >= p.killReadyAt && distance(p, target) <= KILL_RANGE) { G.kill(r, p, target.id); return; }
      if (target && t >= p.killReadyAt && distance(p, target) < 180) { walk(r, p, target, t); return; }
      const vent = ALL_VENTS.find((v) => G.canReach(p, v.floor, v.x, v.y));
      if (vent && t >= (b.nextVentAt || 0) && Math.random() < 0.002) {
        G.vent(r, p, 'enter', vent.id); b.ventExitAt = t + 2200; b.ventMoved = false; b.nextVentAt = t + 30000; return;
      }
    }
  }
  // Crewmates (including ghosts) repair sabotages and complete their assigned tasks.
  let fix = null;
  if (p.role === 'crew' && r.sab) {
    const ids = r.sab.kind === 'lights' ? ['fix_lights'] : ['fire_a', 'fire_b'].filter((id) => !r.sab.fixed[id.slice(-1)]);
    fix = ids.map((id) => STATIONS[id]).sort((a, c) => (a.floor !== p.floor) - (c.floor !== p.floor) || distance(p, a) - distance(p, c))[0];
  }
  const task = p.tasks.find((x) => !x.done);
  if (!fix && !task && p.alive) {
    if (!b.roam || (p.floor === b.roam.floor && distance(p, b.roam) < 50)) {
      const options = Object.values(TASK_BY_ID).filter((x) => x.floor === p.floor);
      b.roam = options[Math.floor(Math.random() * options.length)];
    }
    if (b.roam) walk(r, p, b.roam, t);
    return;
  }
  const target = fix || (task && TASK_BY_ID[task.tid]);
  if (!target) { p.moving = false; return; }
  if (G.canReach(p, target.floor, target.x, target.y, 45)) {
    p.moving = false;
    if (fix) {
      if (p.fixOpen?.id !== fix.id) G.fixStart(r, p, fix.id);
      else if (t - p.fixOpen.at >= 1800) G.fixDone(r, p, fix.id);
    } else {
      if (p.taskOpen?.tid !== task.tid) G.taskStart(r, p, task.tid);
      else if (t - p.taskOpen.at >= G.MIN_TASK_MS + 1200) G.taskDone(r, p, task.tid);
    }
  } else { p.taskOpen = null; p.fixOpen = null; walk(r, p, target, t); }
}

function meeting(r, p, t) {
  const b = p.botState, m = r.meeting;
  if (!p.alive || !m || (m.stage !== 'discussion' && m.stage !== 'voting')) return;
  if (b.meeting !== m) {
    b.meeting = m; b.speakAt = t + 600 + (p.id % 5) * 550; b.voteAt = t + 3500 + (p.id % 4) * 400; b.spoken = false;
  }
  if (!b.spoken && t >= b.speakAt) {
    const evidence = b.evidence && t - b.evidence.at < 90000 ? b.evidence : null;
    const msg = evidence ? evidence.text : b.report ? `I found ${b.report.name} in ${b.report.room}.` : b.lastSeen ? `I last saw ${b.lastSeen.name} near ${b.lastSeen.room}.` : 'I did not see what happened.';
    G.chat(r, p, msg); b.spoken = true; b.report = null;
  }
  if (m.stage === 'voting' && b.spoken && t >= b.voteAt && !m.votes.has(p.id)) {
    const suspect = b.evidence && t - b.evidence.at < 90000 && r.players.get(b.evidence.suspect);
    G.vote(r, p, suspect && suspect.alive && !suspect.left && suspect.id !== p.id ? suspect.id : 'skip');
  }
}

export function tickBots(r, t) {
  for (const p of r.players.values()) {
    if (!p.bot || p.left) continue;
    if (r.phase === 'playing') {
      if (p.alive && r.tickN % TICK_RATE === p.id % TICK_RATE) {
        const seen = [...r.players.values()].find((q) => visible(r, p, q));
        if (seen) p.botState.lastSeen = { name: seen.name, room: roomName(seen.floor, seen.x, seen.y) };
      }
      playing(r, p, t);
    } else if (r.phase === 'meeting') meeting(r, p, t);
  }
}
