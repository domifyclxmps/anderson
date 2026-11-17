// In-game HUD: floor indicator, task list, progress, minimap, action buttons, sabotage / vent controls, interactions.
import { USE_RANGE, KILL_RANGE, REPORT_RANGE } from '/shared/constants.js';
import { STAIRS, ALL_VENTS, roomName } from '/shared/map.js';
import { lineClear } from '/shared/physics.js';
import { TASK_BY_ID, STATIONS } from '/shared/tasks.js';
import { S, bus, $, esc, show, toast } from './state.js';
import { settings, isTouch } from './settings.js';
import { net } from './net.js';
import { audio } from './audio.js';
import { W, remaining } from './world.js';
import { openMini, closeMini, miniOpen } from './minigames.js';
import { getArt } from './mapart.js';
import { openSettings } from './dialogs.js';

let el, lastTaskSig = '', sabMenu = false, bigMap = false, tick = 0;
const KEYNAME = (code) => code.replace('Key', '').replace('Digit', '');

export function buildHud() {
  el = $('#hud');
  el.innerHTML = `
  <div class="hud-pan" id="hFloor"></div>
  <div class="hud-pan" id="hBar"><span id="hBarT">TASKS</span><div class="bar"><i id="hBarI" style="width:0"></i></div></div>
  <div class="hud-pan" id="hTasks"></div>
  <div class="hud-pan hidden" id="hAlert"></div>
  <div id="hTop"><div style="display:flex;gap:6px"><button class="btn small gray" id="hMap">MAP</button><button class="btn small gray" id="hSet">⚙</button></div><canvas id="mini" width="190" height="200"></canvas></div>
  <div id="sabmenu" class="hidden"><button class="btn red" data-k="lights">💡 Lights Out</button><button class="btn red" data-k="fire">🔥 Fire Drill</button></div>
  <div id="ventnav" class="hidden"></div>
  <div id="acts">
    <button class="act vnt hidden" id="aVent">VENT<small></small></button>
    <button class="act sab hidden" id="aSab">SABOTAGE<small></small></button>
    <button class="act kill hidden" id="aKill">KILL<small></small></button>
    <button class="act rep" id="aRep">REPORT<small></small></button>
    <button class="act" id="aUse">USE<small></small></button>
  </div>
  <div id="joy" class="hidden"><i></i></div>
  <div id="bigmap" class="hidden"><canvas id="bm" width="900" height="900"></canvas></div>`;
  $('#aUse').onclick = doUse; $('#aRep').onclick = doReport; $('#aKill').onclick = doKill; $('#aVent').onclick = doVent;
  $('#aSab').onclick = () => { if (!$('#aSab').classList.contains('on')) return; sabMenu = !sabMenu; audio.sfx('click'); };
  $('#sabmenu').onclick = (e) => { const k = e.target.dataset.k; if (k) { net.send({ t: 'sabotage', kind: k }); sabMenu = false; } };
  $('#hMap').onclick = () => toggleMap(); $('#mini').onclick = () => toggleMap(); $('#bigmap').onclick = () => toggleMap(false);
  $('#hSet').onclick = () => openSettings(true);
  setupJoystick();
  addEventListener('keydown', onKey);
  W.blocked = () => miniOpen() || (S.phase !== 'playing' && S.phase !== 'lobby') || bigMap || !!document.querySelector('#dlg:not(.hidden)') || document.activeElement?.tagName === 'INPUT';
}
export const toggleMap = (v) => { bigMap = v ?? !bigMap; show('#bigmap', bigMap); };

function onKey(e) {
  if (S.phase !== 'playing' || e.repeat || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const k = settings.keys;
  if (e.code === k.use || e.code === 'Space') doUse();
  else if (e.code === k.report) doReport();
  else if (e.code === k.kill) doKill();
  else if (e.code === k.vent) doVent();
  else if (e.code === k.sabotage) $('#aSab').click();
  else if (e.code === k.map || e.code === 'Tab') { toggleMap(); e.preventDefault(); }
  else if (e.code === 'Escape') { if (miniOpen()) closeMini(); else if (bigMap) toggleMap(false); }
}

function setupJoystick() {
  const j = $('#joy'), knob = j.firstElementChild; let id = null;
  const mv = (e) => { const r = j.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / 55, dy = (e.clientY - cy) / 55; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } W.joy.x = Math.abs(dx) > 0.15 ? dx : 0; W.joy.y = Math.abs(dy) > 0.15 ? dy : 0; knob.style.transform = `translate(${dx * 35}px,${dy * 35}px)`; };
  j.addEventListener('pointerdown', (e) => { id = e.pointerId; j.setPointerCapture(id); mv(e); });
  j.addEventListener('pointermove', (e) => { if (e.pointerId === id) mv(e); });
  const up = () => { id = null; W.joy.x = W.joy.y = 0; knob.style.transform = ''; };
  j.addEventListener('pointerup', up); j.addEventListener('pointercancel', up);
}

// ---------------------------------------------------------------- interaction detection
const reach = (f, x, y, range) => { const m = W.me; if (m.f !== f || m.vent) return -1; const d = Math.hypot(m.x - x, m.y - y); return d <= range && (d < 24 || lineClear(f, m.x, m.y, x, y)) ? d : -1; };
function candidates() {
  const m = W.me, c = {}; let best = null;
  const consider = (o, d) => { if (d >= 0 && (!best || d < best.d)) best = { ...o, d }; };
  for (const tk of S.tasks) if (!tk.done) { const d = TASK_BY_ID[tk.tid]; consider({ kind: 'task', id: tk.tid, def: d }, reach(d.floor, d.x, d.y, USE_RANGE)); }
  const em = STATIONS.emergency; if (m.alive) consider({ kind: 'emergency' }, reach(em.floor, em.x, em.y, USE_RANGE));
  if (W.sab && S.role !== 'imp') for (const id of W.sab.kind === 'lights' ? ['fix_lights'] : ['fire_a', 'fire_b']) { if (W.sab.kind === 'fire' && W.sab.fixed[id.slice(-1)]) continue; const st = STATIONS[id]; consider({ kind: 'fix', id, def: st }, reach(st.floor, st.x, st.y, USE_RANGE)); }
  c.use = best;
  c.body = null; for (const b of W.bodies) if (m.alive && reach(b.f, b.x, b.y, REPORT_RANGE) >= 0) c.body = b;
  if (S.role === 'imp' && m.alive && !m.vent) {
    let bd = 1e9; for (const [id, o] of W.others) { if (o.f !== m.f || o.dead || S.mates.includes(id)) continue; const d = Math.hypot(o.x - m.x, o.y - m.y); if (d <= KILL_RANGE && d < bd && lineClear(m.f, m.x, m.y, o.x, o.y)) { bd = d; c.target = id; } }
    for (const v of ALL_VENTS) if (reach(v.floor, v.x, v.y, USE_RANGE) >= 0) c.vent = v;
  }
  return c;
}
let cand = {};
function doUse() {
  if (S.phase !== 'playing' || !cand.use || miniOpen() || performance.now() < W.me.introUntil) return;
  const u = cand.use;
  if (u.kind === 'task') net.send({ t: 'taskStart', tid: u.id });
  else if (u.kind === 'emergency') { if (W.me.emg <= 0) toast('You have no emergency meetings left'); else net.send({ t: 'emergency' }); }
  else if (u.kind === 'fix') net.send({ t: 'fixStart', id: u.id });
  audio.sfx('click');
}
function doReport() { if (S.phase === 'playing' && cand.body) net.send({ t: 'report', body: cand.body.id }); }
function doKill() { if (S.phase === 'playing' && cand.target && remaining(W.me.kcd) <= 0) { net.send({ t: 'kill', target: cand.target }); audio.sfx('kill'); } }
function doVent() { if (S.role !== 'imp' || S.phase !== 'playing') return; if (W.me.vent) net.send({ t: 'vent', action: 'exit' }); else if (cand.vent) { net.send({ t: 'vent', action: 'enter', id: cand.vent.id }); audio.sfx('vent'); } }

// ---------------------------------------------------------------- server -> minigames
const started = new Map();
bus.on('taskBegin', (m) => { const d = TASK_BY_ID[m.tid]; if (!d) return; started.set(m.tid, performance.now()); audio.sfx('open');
  openMini({ id: d.id, game: d.game, title: d.name, desc: d.desc, seed: m.seed,
    onDone: () => setTimeout(() => net.send({ t: 'taskDone', tid: m.tid }), Math.max(0, 2350 - (performance.now() - started.get(m.tid)))),
    onCancel: () => net.send({ t: 'taskCancel' }) }); });
bus.on('fixBegin', (m) => { const d = STATIONS[m.id]; if (!d) return; started.set(m.id, performance.now()); audio.sfx('open');
  openMini({ id: m.id, game: d.game, title: d.name, desc: 'Fix the sabotage before it is too late!', seed: m.seed,
    onDone: () => setTimeout(() => net.send({ t: 'fixDone', id: m.id }), Math.max(0, 1300 - (performance.now() - started.get(m.id)))),
    onCancel: () => net.send({ t: 'taskCancel' }) }); });
bus.on('taskOk', (m) => { const t = S.tasks.find((x) => x.tid === m.tid); if (t) t.done = true; toast('Task complete ✔'); });
bus.on('taskDenied', () => toast('Task failed — try again', 'bad'));
bus.on('ev', (m) => {
  if (m.e === 'sabotage') { audio.sfx('sabotage'); toast(m.kind === 'lights' ? 'Sabotage: Lights out!' : 'Sabotage: FIRE DRILL!', 'bad'); }
  else if (m.e === 'sabFixed') { audio.sfx('fixed'); toast('Sabotage fixed'); }
  else if (m.e === 'kill' && W.me.alive && W.me.f === m.f && Math.hypot(m.x - W.me.x, m.y - W.me.y) < 360) audio.sfx('kill');
});

// ---------------------------------------------------------------- per-frame update
export function updateHud() {
  if (!el || S.phase !== 'playing' || el.classList.contains('hidden')) return;
  tick++; const m = W.me;
  cand = candidates();
  $('#hFloor').innerHTML = `FLOOR ${m.f + 1}<small>${esc(roomName(m.f, m.x, m.y))}</small>`;
  const [d, t] = W.prog; $('#hBarI').style.width = t ? (d / t * 100) + '%' : '0'; $('#hBarT').textContent = `TASKS ${d}/${t}`;
  const sig = JSON.stringify(S.tasks) + S.role + m.f;
  if (sig !== lastTaskSig) { lastTaskSig = sig; $('#hTasks').innerHTML = `<b>${S.role === 'imp' ? 'FAKE TASKS (look busy)' : 'YOUR TASKS'}</b>` + S.tasks.map((x) => { const q = TASK_BY_ID[x.tid]; return `<div class="${x.done ? 'done' : q.floor === m.f ? 'here' : ''}">${x.done ? '✔' : '•'} ${esc(q.room)}: ${esc(q.name)} <small>${q.floor === m.f ? '' : `(F${q.floor + 1})`}</small></div>`; }).join(''); }
  const al = $('#hAlert');
  if (W.sab) { al.classList.remove('hidden'); al.textContent = W.sab.kind === 'lights' ? '💡 LIGHTS OUT — fix the Electrical Panel in the Main Hall' : `🔥 FIRE DRILL ${Math.ceil(remaining(W.sab.left) / 1000)}s — reset the panels in Science Hall & Aux Gym`; } else al.classList.add('hidden');
  const isImp = S.role === 'imp', intro = performance.now() < m.introUntil;
  const set = (id, on, small = '') => { const b = $(id); b.classList.toggle('on', !!on); b.querySelector('small').textContent = small; };
  set('#aUse', cand.use && !intro, cand.use ? (cand.use.kind === 'emergency' ? 'ALARM' : cand.use.kind === 'fix' ? 'FIX' : 'TASK') : KEYNAME(settings.keys.use));
  set('#aRep', cand.body && !intro, KEYNAME(settings.keys.report));
  for (const id of ['#aKill', '#aSab', '#aVent']) $(id).classList.toggle('hidden', !isImp);
  if (isImp) {
    const kcd = Math.ceil(remaining(m.kcd) / 1000), scd = Math.ceil(remaining(m.scd) / 1000);
    set('#aKill', m.alive && !m.vent && cand.target && !kcd && !intro, kcd ? kcd + 's' : KEYNAME(settings.keys.kill));
    set('#aSab', m.alive && !W.sab && !scd && !intro, scd ? scd + 's' : KEYNAME(settings.keys.sabotage));
    set('#aVent', m.alive && (m.vent || cand.vent), m.vent ? 'EXIT' : KEYNAME(settings.keys.vent));
  }
  show('#sabmenu', sabMenu && isImp && !W.sab);
  const vn = $('#ventnav');
  if (m.vent) {
    const sig2 = 'v' + m.vent;
    if (vn.dataset.s !== sig2) { vn.dataset.s = sig2; const v = ALL_VENTS.find((x) => x.id === m.vent); vn.innerHTML = v.links.map((id) => { const dest = ALL_VENTS.find((x) => x.id === id); return `<button class="btn" data-id="${id}">➜ ${esc(roomName(dest.floor, dest.x, dest.y))} · F${dest.floor + 1}</button>`; }).join('') + '<button class="btn gray" data-id="0">Exit vent</button>'; vn.onclick = (e) => { if (e.target.dataset.id === undefined) return; const id = +e.target.dataset.id; net.send(id ? { t: 'vent', action: 'move', id } : { t: 'vent', action: 'exit' }); audio.sfx('vent'); }; }
    vn.classList.remove('hidden');
  } else { vn.classList.add('hidden'); vn.dataset.s = ''; }
  show('#joy', isTouch());
  if (tick % 3 === 0) drawMini($('#mini'), 190);
  if (bigMap) drawMini($('#bm'), 900, true);
}

function drawMini(cv, size, big) {
  const m = W.me, art = getArt(m.f, 'low'), c = cv.getContext('2d');
  const k = Math.min(size / art.w, (big ? size : size * 1.05) / art.h);
  cv.width = Math.round(art.w * k); cv.height = Math.round(art.h * k);
  c.drawImage(art.cv, 0, 0, cv.width, cv.height);
  const X = (x) => (x - art.x0) * k, Y = (y) => (y - art.y0) * k, r = big ? 7 : 4;
  for (const tk of S.tasks) if (!tk.done) { const d = TASK_BY_ID[tk.tid]; if (d.floor === m.f) { c.fillStyle = '#ffd23f'; c.strokeStyle = '#000'; c.beginPath(); c.arc(X(d.x), Y(d.y), r, 0, 7); c.fill(); c.stroke(); } }
  if (W.sab) for (const id of W.sab.kind === 'lights' ? ['fix_lights'] : ['fire_a', 'fire_b']) { const st = STATIONS[id]; if (st.floor === m.f) { c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(X(st.x), Y(st.y), r + 1, 0, 7); c.fill(); } }
  for (const s of STAIRS) { c.fillStyle = '#7dffb0'; c.fillRect(X(s.trigger.x0), Y(s.trigger.y0), (s.trigger.x1 - s.trigger.x0) * k, (s.trigger.y1 - s.trigger.y0) * k); }
  if (S.role === 'imp' && m.alive) for (const v of ALL_VENTS) if (v.floor === m.f) { c.fillStyle = '#ff646c'; c.fillRect(X(v.x) - r, Y(v.y) - r, r * 2, r * 2); }
  c.fillStyle = '#fff'; c.strokeStyle = '#e8453c'; c.lineWidth = 2; c.beginPath(); c.arc(X(m.x), Y(m.y), r + 1.5, 0, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, 58, 16); c.fillStyle = '#fff'; c.font = '700 11px sans-serif'; c.fillText('FLOOR ' + (m.f + 1), 4, 12);
}
