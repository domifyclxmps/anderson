// The live world view: input, client-side prediction + server reconciliation, camera, rendering, fog of war.
import { CELL, COLS, ROWS, PLAYER_R, BASE_SPEED, FLOOR_LOBBY } from '/shared/constants.js';
import { FLOORS, ALL_VENTS } from '/shared/map.js';
import { stepMove, nearStair, stairAt } from '/shared/physics.js';
import { TASK_BY_ID, STATIONS } from '/shared/tasks.js';
import { S, bus } from './state.js';
import { settings, isTouch } from './settings.js';
import { net } from './net.js';
import { audio } from './audio.js';
import { drawChar, drawBody, hexOf } from './chars.js';
import { getArt, drawArt, drawCanopies } from './mapart.js';

export const W = {
  mode: 'menu', phase: 'lobby',
  me: { x: 0, y: 0, f: 0, vis: 9999, alive: true, vent: 0, kcd: 0, scd: 0, ecd: 0, emg: 0, introUntil: 0, snapAt: 0 },
  others: new Map(), bodies: [], prog: [0, 0], sab: null,
  seq: 0, pending: [], corr: { x: 0, y: 0 }, stairLock: false,
  keys: new Set(), joy: { x: 0, y: 0 }, blocked: () => false,
  cam: { x: 960, y: 900, zoom: 1 }, fade: 0, prevFloor: null, t: 0, fps: 60, shake: 0, lobbyShift: 0,
  particles: [],
};
let canvas, ctx, fog, fctx, held = { x: 0, y: 0 }, acc = 0, wasMoving = false, stepT = 0, lastFrame = 0, frames = 0, fpsT = 0;

export function init(cv) {
  canvas = cv; ctx = cv.getContext('2d'); fog = document.createElement('canvas'); fctx = fog.getContext('2d');
  addEventListener('keydown', (e) => { if (!isTyping(e)) W.keys.add(e.code); if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code) && !isTyping(e)) e.preventDefault(); });
  addEventListener('keyup', (e) => W.keys.delete(e.code));
  addEventListener('blur', () => W.keys.clear());
  requestAnimationFrame(frame);
}
const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
export function setMode(m) { W.mode = m; if (m !== 'game') { W.pending.length = 0; } }

// ---------------------------------------------------------------- movement (mirrors server Room.onInput)
function applyMove(dx, dy, dt) {
  const me = W.me, playing = W.phase === 'playing';
  if (playing && (performance.now() < me.introUntil || me.vent)) return;
  const len = Math.hypot(dx, dy); if (len < 0.05 || dt <= 0) return;
  if (len > 1) { dx /= len; dy /= len; }
  const speed = BASE_SPEED * (S.room?.settings.speed ?? 1);
  const n = Math.max(1, Math.ceil(dt / (1 / 60))), step = dt / n, noclip = playing && !me.alive;
  for (let i = 0; i < n; i++) {
    [me.x, me.y] = stepMove(me.f, me.x, me.y, dx * speed * step, dy * speed * step, noclip);
    if (playing && me.f !== FLOOR_LOBBY) {
      if (W.stairLock) { if (!nearStair(me.x, me.y)) W.stairLock = false; }
      else if (stairAt(me.x, me.y)) { me.f = 1 - me.f; W.stairLock = true; changedFloor(); }
    }
  }
}
function changedFloor() { W.fade = 1; audio.sfx('stairs'); bus.emit('floor', W.me.f); }

function readDir() {
  if (W.blocked() || W.mode === 'menu') return { x: 0, y: 0 };
  const k = W.keys; let x = 0, y = 0;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1; if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) y -= 1; if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
  if (!x && !y) { x = W.joy.x; y = W.joy.y; }
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  return { x, y };
}
function sendInput(dir) {
  if (acc <= 0) return;
  const moving = Math.hypot(dir.x, dir.y) > 0.05;
  if (moving || wasMoving) {
    const m = { t: 'input', seq: ++W.seq, dx: +dir.x.toFixed(3), dy: +dir.y.toFixed(3), dt: +acc.toFixed(4) };
    net.send(m); W.pending.push(m);
    if (W.pending.length > 120) W.pending.shift();
    applyMove(dir.x, dir.y, acc);
    wasMoving = moving;
  }
  acc = 0;
}

// ---------------------------------------------------------------- server snapshots
bus.on('snap', (m) => {
  const me = W.me, s = m.me, prevF = me.f;
  W.phase = m.ph;
  const ox = me.x, oy = me.y;
  const prevVent = me.vent;
  me.f = s.f; me.vis = s.vis; me.alive = !!s.alive; me.vent = s.vent;
  if (s.vent && prevVent !== s.vent) puff(me.x, me.y, me.f, 'rgba(150,205,235,.7)', 12, 70);
  else if (!s.vent && prevVent) puff(me.x, me.y, me.f, 'rgba(150,205,235,.55)', 9, 50);
  me.kcd = s.kcd; me.scd = s.scd; me.ecd = s.ecd; me.emg = s.emg; me.snapAt = performance.now();
  me.introUntil = performance.now() + s.intro;
  if (s.intro > 0) S.introUntil = me.introUntil;
  me.x = s.x; me.y = s.y;
  W.pending = W.pending.filter((p) => p.seq > m.ack);
  W.stairLock = nearStair(me.x, me.y);
  for (const p of W.pending) applyMove(p.dx, p.dy, p.dt);
  const ex = ox - me.x, ey = oy - me.y;
  if (Math.hypot(ex, ey) > 60 || !W.hasSnap) { W.corr.x = W.corr.y = 0; } else { W.corr.x = ex; W.corr.y = ey; }
  W.hasSnap = true;
  if (prevF !== me.f && W.pending.length === 0 && prevF !== undefined && prevF !== FLOOR_LOBBY && me.f !== FLOOR_LOBBY && W.mode === 'game') { W.fade = 1; bus.emit('floor', me.f); }
  const seen = new Set();
  for (const [id, x, y, f, facing, moving, dead] of m.ps) {
    seen.add(id);
    let o = W.others.get(id);
    if (!o) { o = { x, y, f, tx: x, ty: y, walk: Math.random() * 6 }; W.others.set(id, o); }
    if (o.f !== f) { o.x = x; o.y = y; }
    Object.assign(o, { tx: x, ty: y, f, facing, moving: !!moving, dead: !!dead });
  }
  for (const id of [...W.others.keys()]) if (!seen.has(id)) W.others.delete(id);
  W.bodies = m.bodies.map(([id, x, y, f, color]) => ({ id, x, y, f, color }));
  W.prog = m.prog; W.sab = m.sab;
});
bus.on('conn', (ok) => { if (!ok) W.pending.length = 0; });

// ---------------------------------------------------------------- helpers used by the HUD
export const remaining = (ms) => Math.max(0, ms - (performance.now() - W.me.snapAt));
export function resetWorld() { W.others.clear(); W.bodies = []; W.pending.length = 0; W.hasSnap = false; W.seq = 0; acc = 0; wasMoving = false; W.particles.length = 0; W.shake = 0; }

// ---------------------------------------------------------------- particles / feedback
function addParticle(p) { W.particles.push(p); if (W.particles.length > 240) W.particles.shift(); }
function puff(x, y, f, col, n = 8, spd = 45) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = spd * (0.35 + Math.random() * 0.9);
    addParticle({ x, y, f, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.45 + Math.random() * 0.45, col, size: 2 + Math.random() * 3.5 });
  }
}
function floatText(x, y, f, text, col = '#ffd75e') { addParticle({ x, y, f, vx: 0, vy: -30, life: 0, max: 1.15, text, col }); }
function stepParticles(dt) {
  for (let i = W.particles.length - 1; i >= 0; i--) {
    const p = W.particles[i]; p.life += dt;
    if (p.life >= p.max) { W.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95;
  }
}
function drawParticles(floor) {
  for (const p of W.particles) {
    if (p.f !== floor) continue;
    const a = 1 - p.life / p.max;
    if (p.text !== undefined) {
      ctx.globalAlpha = a; ctx.font = '800 13px "Baloo 2","Trebuchet MS",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(5,13,24,.9)'; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - p.life / p.max * 0.45), 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}
bus.on('ev', (m) => {
  if (m.e === 'kill' && W.me.f === m.f && Math.hypot(m.x - W.me.x, m.y - W.me.y) < 460) { puff(m.x, m.y, m.f, 'rgba(255,110,110,.75)', 16, 85); W.shake = 9; }
  else if (m.e === 'sabotage') W.shake = 5;
});
bus.on('taskOk', () => { floatText(W.me.x, W.me.y - 36, W.me.f, 'TASK DONE', '#8ef0c0'); puff(W.me.x, W.me.y, W.me.f, 'rgba(140,240,190,.7)', 10, 55); });
export function ventPos(id) { return ALL_VENTS.find((v) => v.id === id); }

// ---------------------------------------------------------------- rendering
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1) * (settings.quality === 'low' ? 0.75 : 1);
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  return { w, h, dpr };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016); lastFrame = now;
  W.t += dt; frames++; fpsT += dt; if (fpsT > 0.5) { W.fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  const { w, h, dpr } = resize();
  const live = (W.mode === 'game' || W.mode === 'lobby') && W.hasSnap;

  if (live) {
    const d = readDir();
    if (d.x !== held.x || d.y !== held.y) { sendInput(held); held = d; }
    acc += dt;
    if (acc >= 1 / 50) sendInput(held);
    const moving = Math.hypot(held.x, held.y) > 0.05 && !(W.phase === 'playing' && (performance.now() < W.me.introUntil || W.me.vent));
    if (moving) { stepT -= dt; if (stepT <= 0) { stepT = 0.3; if (W.me.alive) { audio.sfx('step'); puff(W.me.x, W.me.y + 9, W.me.f, 'rgba(175,205,230,.32)', 1, 9); } } }
    W.corr.x *= Math.exp(-10 * dt); W.corr.y *= Math.exp(-10 * dt);
    for (const o of W.others.values()) { const k = 1 - Math.exp(-14 * dt); o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; if (o.moving) o.walk += dt; }
  }
  W.fade = Math.max(0, W.fade - dt * 2.6);
  stepParticles(dt); W.shake *= Math.exp(-6 * dt);

  // camera
  const cam = W.cam, me = W.me;
  if (W.mode === 'game' && W.hasSnap) {
    cam.zoom = Math.max(0.5, Math.min(2.2, Math.min(w / 920, h / 580) * settings.zoom));
    const k = 1 - Math.exp(-12 * dt);
    cam.x += (me.x + W.corr.x - cam.x) * k; cam.y += (me.y + W.corr.y - cam.y) * k;
    if (Math.hypot(me.x - cam.x, me.y - cam.y) > 400) { cam.x = me.x; cam.y = me.y; }
  } else if (W.mode === 'lobby') {
    const b = FLOORS[FLOOR_LOBBY].bounds, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    cam.zoom = Math.min((w * 0.96) / bw, (h * 0.9) / bh);
    cam.x = (b.x0 + b.x1) / 2; cam.y = (b.y0 + b.y1) / 2;
  } else {
    cam.zoom = Math.max(0.7, Math.min(w / 1100, h / 700)) * 1.05;
    cam.x = 960 + Math.sin(W.t * 0.07) * 560; cam.y = 1000 + Math.cos(W.t * 0.05) * 620;
  }

  const floor = W.mode === 'menu' ? 0 : (W.mode === 'lobby' ? FLOOR_LOBBY : me.f);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0a1024'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  const shk = W.shake > 0.3 ? W.shake : 0;
  ctx.translate(w / 2 + (Math.random() - 0.5) * shk, h / 2 + (Math.random() - 0.5) * shk); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);
  const vx0 = cam.x - w / 2 / cam.zoom, vy0 = cam.y - h / 2 / cam.zoom, vx1 = cam.x + w / 2 / cam.zoom, vy1 = cam.y + h / 2 / cam.zoom;
  drawArt(ctx, getArt(floor, settings.quality), vx0, vy0, vx1, vy1);
  if (W.fade > 0 && W.prevFloor !== null && W.prevFloor !== floor) drawArt(ctx, getArt(W.prevFloor, settings.quality), vx0, vy0, vx1, vy1, W.fade);
  W.prevFloor = floor;
  if (W.mode === 'game' && W.hasSnap) drawEntities(floor);
  else if (W.mode === 'lobby' && W.hasSnap) drawLobbyPlayers();
  drawParticles(floor);
  drawCanopies(ctx, floor, W.t);
  ctx.restore();

  if (W.mode === 'game' && W.hasSnap && me.alive && W.phase === 'playing') drawFog(w, h, dpr);
  if (W.fade > 0.05) { ctx.fillStyle = `rgba(10,16,40,${W.fade * 0.45})`; ctx.fillRect(0, 0, w, h); }
  if (settings.showFps) { ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText(`${W.fps} fps  ${S.ping} ms`, w - 110, h - 10); }
}

function nameTag(text, x, y, color = '#fff') {
  ctx.font = '700 11px "Baloo 2","Trebuchet MS",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,16,40,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}
const info = (id) => S.room?.players.find((p) => p.id === id);

function drawLobbyPlayers() {
  const list = [];
  for (const p of S.room?.players || []) {
    if (p.id === S.id) list.push({ p, x: W.me.x + W.corr.x, y: W.me.y + W.corr.y, moving: wasMoving, facing: W.facing || 1, walk: W.t });
    else { const o = W.others.get(p.id); if (o) list.push({ p, x: o.x, y: o.y, moving: o.moving, facing: o.facing, walk: o.walk }); }
  }
  list.sort((a, b) => a.y - b.y);
  for (const e of list) {
    drawChar(ctx, {
      x: e.x, y: e.y, color: e.p.color, hat: e.p.hat, facing: e.facing, moving: e.moving, t: e.walk, scale: 1.15,
      lean: e.moving ? Math.sin(e.walk * 12) * 0.1 : 0, squash: e.moving ? 1 + Math.sin(e.walk * 24) * 0.04 : 1,
    });
    nameTag(e.p.name + (e.p.id === S.room.hostId ? ' ♛' : ''), e.x, e.y - 34, e.p.id === S.id ? '#ffd75e' : '#eaf6ff');
  }
}

function drawEntities(floor) {
  const me = W.me, t = W.t, imp = S.role === 'imp';
  // sabotage + emergency markers
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  const mark = (x, y, col, txt) => { ctx.fillStyle = col; ctx.globalAlpha = 0.25 + 0.25 * pulse; ctx.beginPath(); ctx.arc(x, y, 26 + pulse * 4, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + 1); };
  const em = STATIONS.emergency; if (em.floor === floor) mark(em.x, em.y, '#e8453c', '!');
  if (W.sab && S.role !== 'imp' || (W.sab && imp)) {
    const ids = W.sab.kind === 'lights' ? ['fix_lights'] : ['fire_a', 'fire_b'].filter((id) => !W.sab.fixed[id.slice(-1)]);
    for (const id of ids) { const st = STATIONS[id]; if (st.floor === floor) mark(st.x, st.y, '#ff4b4b', '⚡'); }
  }
  for (const v of ALL_VENTS) if (v.floor === floor) {
    ctx.fillStyle = '#1e2740'; ctx.fillRect(v.x - 13, v.y - 8, 26, 16); ctx.strokeStyle = '#6c7aa0'; ctx.lineWidth = 2; ctx.strokeRect(v.x - 13, v.y - 8, 26, 16);
    ctx.fillStyle = '#6c7aa0'; for (let i = 0; i < 4; i++) ctx.fillRect(v.x - 10, v.y - 5 + i * 3.4, 20, 1.5);
  }
  for (const tk of S.tasks) if (!tk.done) {
    const d = TASK_BY_ID[tk.tid]; if (!d || d.floor !== floor) continue;
    const by = Math.sin(t * 4 + d.x) * 3;
    ctx.fillStyle = 'rgba(255,214,60,.28)'; ctx.beginPath(); ctx.arc(d.x, d.y, 24 + pulse * 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.x, d.y - 26 + by, 10, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3600'; ctx.font = '900 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', d.x, d.y - 25 + by);
  }
  for (const b of W.bodies) if (b.f === floor) drawBody(ctx, { x: b.x, y: b.y, color: b.color, t });

  const list = [];
  for (const [id, o] of W.others) { if (o.f !== floor) continue; list.push({ id, x: o.x, y: o.y, o, p: info(id) }); }
  if (!(me.vent && imp)) list.push({ id: S.id, x: me.x + W.corr.x, y: me.y + W.corr.y, me: true, p: info(S.id) });
  list.sort((a, b) => a.y - b.y);
  for (const e of list) {
    if (!e.p) continue;
    const ghost = e.me ? !me.alive : e.o.dead;
    const moving = e.me ? wasMoving && !me.vent : e.o.moving;
    if (e.me && Math.abs(held.x) > 0.1) W.facing = held.x > 0 ? 1 : -1;
    const facing = e.me ? (W.facing || 1) : e.o.facing;
    const gait = e.me ? t : e.o.walk;
    drawChar(ctx, {
      x: e.x, y: e.y, color: e.p.color, hat: e.p.hat, facing, moving, t: e.me ? t : e.o.walk + t * 0.2, ghost, scale: 1.12, alpha: e.me && me.vent ? 0.4 : 1,
      lean: moving ? Math.sin(gait * 12) * 0.1 : 0, squash: moving ? 1 + Math.sin(gait * 24) * 0.04 : 1,
    });
    const mate = imp && S.mates.includes(e.id);
    nameTag(e.p.name, e.x, e.y - 33, mate ? '#ff8a8a' : e.me ? '#ffd75e' : '#eaf6ff');
  }
}

// Fog of war: a ray-cast visibility polygon (walls block, furniture doesn't) with a soft radial edge.
function drawFog(w, h, dpr) {
  if (settings.quality === 'low') {
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, W.me.vis * W.cam.zoom);
    g.addColorStop(0, 'rgba(5,10,20,0)'); g.addColorStop(0.8, 'rgba(5,10,20,.5)'); g.addColorStop(1, 'rgba(5,10,20,.9)');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height); return;
  }
  if (fog.width !== canvas.width || fog.height !== canvas.height) { fog.width = canvas.width; fog.height = canvas.height; }
  const me = W.me, cam = W.cam, R = me.vis, px = me.x + W.corr.x, py = me.y + W.corr.y, grid = FLOORS[me.f].grid;
  fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.globalCompositeOperation = 'source-over';
  fctx.fillStyle = 'rgba(5,10,20,0.88)'; fctx.fillRect(0, 0, fog.width, fog.height);
  fctx.globalCompositeOperation = 'destination-out';
  fctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (w / 2 - cam.x * cam.zoom), dpr * (h / 2 - cam.y * cam.zoom));
  const N = 110; fctx.beginPath();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a); let d = 0;
    for (; d < R; d += 8) { const c = Math.floor((px + cx * d) / CELL), r = Math.floor((py + cy * d) / CELL); if (c < 0 || r < 0 || c >= COLS || r >= ROWS || grid[r * COLS + c] === 0) { d += 6; break; } }
    d = Math.min(d, R); const X = px + cx * d, Y = py + cy * d; i ? fctx.lineTo(X, Y) : fctx.moveTo(X, Y);
  }
  fctx.closePath();
  const g = fctx.createRadialGradient(px, py, R * 0.35, px, py, R);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,.92)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  fctx.fillStyle = g; fctx.fill();
  const g2 = fctx.createRadialGradient(px, py, 20, px, py, 70); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
  fctx.fillStyle = g2; fctx.beginPath(); fctx.arc(px, py, 70, 0, 7); fctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fog, 0, 0);
}
