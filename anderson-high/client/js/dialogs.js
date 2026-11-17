// Modal dialogs (settings, join, create) and the shared character-customisation editor.
import { COLORS, HATS } from '/shared/constants.js';
import { S, $, $$, esc, show, toast } from './state.js';
import { settings, saveSettings, profile, saveProfile, DEFAULT_KEYS } from './settings.js';
import { net } from './net.js';
import { audio } from './audio.js';
import { drawChar } from './chars.js';

const dlg = () => $('#dlg');
export function closeDialog() { show(dlg(), false); dlg().innerHTML = ''; }
function open(html) { dlg().innerHTML = `<div class="panel dlg">${html}</div>`; show(dlg(), true); dlg().onclick = (e) => { if (e.target === dlg()) closeDialog(); }; return dlg().firstElementChild; }

// ---------------------------------------------------------------- character editor
export function mountProfile(host, inLobby = false) {
  host.innerHTML = `<canvas width="130" height="130"></canvas><input maxlength="12" placeholder="Your name" spellcheck="false"><div class="swatches"></div><div class="hats"></div>`;
  const cv = $('canvas', host), name = $('input', host), sw = $('.swatches', host), hats = $('.hats', host), c = cv.getContext('2d');
  const push = (patch) => { Object.assign(profile, patch); saveProfile(); if (inLobby) net.send({ t: 'cosmetic', ...patch }); };
  name.value = profile.name;
  name.oninput = () => { profile.name = name.value.slice(0, 12); saveProfile(); };
  name.onchange = () => push({ name: name.value.trim() || profile.name });
  const taken = (i) => inLobby && S.room?.players.some((p) => p.id !== S.id && p.color === i);
  const draw = () => {
    sw.innerHTML = COLORS.map((col, i) => `<div class="sw ${i === profile.color ? 'sel' : ''} ${taken(i) ? 'taken' : ''}" data-i="${i}" title="${col.name}" style="background:${col.hex}"></div>`).join('');
    hats.innerHTML = HATS.map((h) => `<button class="hat ${h === profile.hat ? 'sel' : ''}" data-h="${h}">${h}</button>`).join('');
  };
  sw.onclick = (e) => { const i = e.target.dataset.i; if (i === undefined || taken(+i)) return; audio.sfx('pop'); push({ color: +i }); draw(); };
  hats.onclick = (e) => { const h = e.target.dataset.h; if (!h) return; audio.sfx('pop'); push({ hat: h }); draw(); };
  draw();
  const loop = (t) => { if (!host.isConnected) return; c.clearRect(0, 0, 130, 130); drawChar(c, { x: 65, y: 80, color: profile.color, hat: profile.hat, moving: Math.floor(t / 1400) % 2 === 1, t: t / 1000, scale: 2.6, shadow: true }); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return draw;
}

// ---------------------------------------------------------------- settings
export function openSettings(inGame = false) {
  const k = settings.keys;
  const slider = (key, label) => `<div class="row"><span>${label}</span><input type="range" min="0" max="1" step="0.05" data-s="${key}" value="${settings[key]}"></div>`;
  const keyBtn = (a, label) => `<div class="row"><span>${label}</span><button class="btn small keybtn" data-k="${a}">${k[a].replace('Key', '')}</button></div>`;
  const p = open(`<h2>SETTINGS</h2>
    <h3>🔊 Sound</h3>${slider('master', 'Master volume')}${slider('sfx', 'Sound effects')}${slider('music', 'Music volume')}
    <div class="row"><span>Background music</span><div class="seg" data-seg="musicOn"><button data-v="1">On</button><button data-v="0">Off</button></div></div>
    <h3>🖥 Graphics</h3>
    <div class="row"><span>Quality</span><div class="seg" data-seg="quality"><button data-v="low">Low</button><button data-v="medium">Medium</button><button data-v="high">High</button></div></div>
    <div class="row"><span>Camera zoom</span><input type="range" min="0.7" max="1.5" step="0.05" data-s="zoom" value="${settings.zoom}"></div>
    <div class="row"><span>Show FPS / ping</span><div class="seg" data-seg="showFps"><button data-v="1">On</button><button data-v="0">Off</button></div></div>
    <h3>🎮 Controls</h3><div class="row"><span>Move</span><b>WASD / Arrow keys</b></div>
    ${keyBtn('use', 'Use / interact (or Space)')}${keyBtn('report', 'Report body')}${keyBtn('kill', 'Eliminate (impostor)')}${keyBtn('sabotage', 'Sabotage (impostor)')}${keyBtn('vent', 'Vent (impostor)')}${keyBtn('map', 'Map')}
    <div class="row"><span>On-screen joystick</span><div class="seg" data-seg="joystick"><button data-v="auto">Auto</button><button data-v="on">On</button><button data-v="off">Off</button></div></div>
    <div class="row" style="justify-content:center;gap:10px"><button class="btn small gray" id="rk">Reset keys</button>${inGame ? '<button class="btn small red" id="lv">Leave game</button>' : ''}<button class="btn green" id="ok">DONE</button></div>`);
  const refresh = () => {
    $$('[data-seg]', p).forEach((seg) => { const key = seg.dataset.seg; $$('button', seg).forEach((b) => { const v = settings[key]; b.classList.toggle('sel', b.dataset.v === String(typeof v === 'boolean' ? +v : v)); }); });
  };
  refresh();
  p.oninput = (e) => { const key = e.target.dataset.s; if (!key) return; settings[key] = +e.target.value; saveSettings(); };
  p.onclick = (e) => {
    const seg = e.target.closest('[data-seg]');
    if (seg && e.target.dataset.v !== undefined) { const key = seg.dataset.seg, v = e.target.dataset.v; settings[key] = key === 'musicOn' || key === 'showFps' ? v === '1' : v; saveSettings(); refresh(); audio.sfx('click'); return; }
    const kb = e.target.dataset.k;
    if (kb) { e.target.textContent = 'press a key…'; const h = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (ev.code !== 'Escape') { settings.keys[kb] = ev.code; saveSettings(); } e.target.textContent = settings.keys[kb].replace('Key', ''); removeEventListener('keydown', h, true); }; addEventListener('keydown', h, true); return; }
    if (e.target.id === 'rk') { settings.keys = { ...DEFAULT_KEYS }; saveSettings(); openSettings(inGame); }
    if (e.target.id === 'lv') { net.send({ t: 'leave' }); closeDialog(); }
    if (e.target.id === 'ok') { audio.sfx('back'); closeDialog(); }
  };
}

// ---------------------------------------------------------------- join / create
export function openJoin() {
  const p = open(`<h2>JOIN GAME</h2><p style="text-align:center;margin:0 0 10px">Enter the 4-letter lobby code from your friend</p><input class="codein" maxlength="4" placeholder="ABCD" autocomplete="off"><div class="row" style="justify-content:center;margin-top:14px"><button class="btn gray" id="c">CANCEL</button><button class="btn green" id="go">JOIN</button></div>`);
  const inp = $('input', p); inp.focus();
  const go = () => { const code = inp.value.trim().toUpperCase(); if (code.length !== 4) return toast('Codes have 4 letters', 'bad'); net.send({ t: 'join', code, ...profile }); closeDialog(); };
  $('#go', p).onclick = go; $('#c', p).onclick = closeDialog; inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
export function openCreate() {
  let pub = false, max = 8;
  const p = open(`<h2>CREATE GAME</h2>
    <div class="row"><span>Lobby type</span><div class="seg" id="vis"><button data-v="0" class="sel">Private</button><button data-v="1">Public</button></div></div>
    <div class="row"><span>Max players</span><div class="stepper"><button id="m">−</button><b id="n">8</b><button id="pl">+</button></div></div>
    <div class="row" style="justify-content:center;margin-top:14px"><button class="btn gray" id="c">CANCEL</button><button class="btn green" id="go">CREATE</button></div>`);
  $('#vis', p).onclick = (e) => { if (e.target.dataset.v === undefined) return; pub = e.target.dataset.v === '1'; $$('#vis button', p).forEach((b) => b.classList.toggle('sel', b === e.target)); };
  $('#m', p).onclick = () => { max = Math.max(4, max - 1); $('#n', p).textContent = max; };
  $('#pl', p).onclick = () => { max = Math.min(10, max + 1); $('#n', p).textContent = max; };
  $('#c', p).onclick = closeDialog;
  $('#go', p).onclick = () => { net.send({ t: 'create', public: pub, max, ...profile }); closeDialog(); };
}
export function openCustomize() {
  const p = open(`<h2>CUSTOMIZE</h2><div class="profile" id="pf" style="margin:auto"></div><div class="row" style="justify-content:center"><button class="btn green" id="ok">DONE</button></div>`);
  mountProfile($('#pf', p), true); $('#ok', p).onclick = closeDialog;
}
