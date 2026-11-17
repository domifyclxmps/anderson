// Boot + screen router. Phases follow the server: lobby -> playing <-> meeting -> ended -> lobby.
import { S, bus, $, show, toast } from './state.js';
import { net } from './net.js';
import { audio } from './audio.js';
import { settings, profile, session } from './settings.js';
import * as world from './world.js';
import { W } from './world.js';
import { buildHud, updateHud } from './hud.js';
import { renderLobby } from './lobby.js';
import { renderMeeting, resetMeeting, showRole, showEnd, hideSplash } from './meeting.js';
import { closeMini } from './minigames.js';
import { mountProfile, openSettings, openJoin, openCreate, closeDialog } from './dialogs.js';

world.init($('#world'));
buildHud();

// ---------------------------------------------------------------- main menu
function buildMenu() {
  $('#menu').innerHTML = `<div class="menu-wrap"><div><div class="logo"><h1>ANDERSON<br>HIGH</h1><h2>AFTER THE BELL</h2></div>
    <div class="menu-btns"><button class="btn big green" id="mQuick">QUICK PLAY</button><button class="btn big" id="mCreate">CREATE GAME</button><button class="btn big gold" id="mJoin">JOIN GAME</button><button class="btn big gray" id="mSet">SETTINGS</button></div></div>
    <div class="panel profile" id="mProf"></div></div><div class="ver">Anderson High · play solo with bots or online · <span id="mStat">connecting…</span></div>`;
  mountProfile($('#mProf'));
  const go = (t, extra = {}) => { audio.unlock(); audio.sfx('click'); net.send({ t, ...profile, ...extra }); };
  $('#mQuick').onclick = () => go('quick'); $('#mCreate').onclick = () => { audio.unlock(); audio.sfx('click'); openCreate(); };
  $('#mJoin').onclick = () => { audio.unlock(); audio.sfx('click'); openJoin(); }; $('#mSet').onclick = () => { audio.unlock(); audio.sfx('click'); openSettings(false); };
}
buildMenu();
addEventListener('pointerdown', () => audio.unlock(), { once: false });
addEventListener('keydown', () => audio.unlock());

// ---------------------------------------------------------------- phase router
function enter(phase) {
  const prev = S.phase; S.phase = phase; W.phase = phase === 'menu' ? 'lobby' : phase;
  const screens = { menu: '#menu', lobby: '#lobby', playing: '#hud', meeting: '#meeting', ended: '#hud' };
  for (const id of ['#menu', '#lobby', '#hud', '#meeting']) show(id, id === screens[phase]);
  if (phase === 'menu') { world.setMode('menu'); audio.music('menu'); hideSplash(); closeMini(true); }
  if (phase === 'lobby') { if (prev !== 'lobby') { world.resetWorld(); } world.setMode('lobby'); audio.music('menu'); hideSplash(); closeMini(true); resetMeeting(); S.role = null; S.tasks = []; }
  if (phase === 'playing') { world.setMode('game'); audio.music('game'); if (prev === 'meeting') { hideSplash(); resetMeeting(); } closeMini(true); }
  if (phase === 'meeting') { world.setMode('game'); closeMini(true); audio.music('meeting'); }
  if (phase === 'ended') { world.setMode('game'); closeMini(true); audio.music('menu'); }
  if (prev !== phase) bus.emit('phase', phase, prev);
}
const reset = () => { S.room = null; S.id = S.code = S.token = null; session.clear(); world.resetWorld(); enter('menu'); };

bus.on('joined', (m) => { S.id = m.id; S.code = m.code; S.token = m.token; session.set({ code: m.code, token: m.token }); if (!m.reconnected) audio.sfx('join'); else toast('Reconnected!'); });
bus.on('room', (m) => {
  S.room = m; S.id = m.you;
  if (m.phase !== S.phase && !(m.phase === 'ended' && S.phase === 'ended')) enter(m.phase);
  if (m.phase === 'lobby') renderLobby();
  if (m.phase === 'meeting') renderMeeting();
  if (m.phase === 'ended') showEnd();
});
bus.on('start', (m) => {
  S.role = m.role; S.mates = m.mates || []; S.tasks = m.tasks.map((t) => ({ ...t })); S.fake = m.fake;
  W.me.introUntil = performance.now() + (m.introMs || 0);
  if (m.introMs) { showRole(m); audio.sfx('start'); }
});
bus.on('killed', () => { toast('You were eliminated! You are now a ghost — keep doing tasks.', 'bad'); audio.sfx('die'); });
bus.on('err', (m) => toast(m.msg, 'bad'));
bus.on('toast', (m) => toast(m.msg));
bus.on('kicked', () => { toast('You were removed by the host', 'bad'); reset(); });
bus.on('left', () => reset());
bus.on('reconnectFailed', () => { session.clear(); if (S.phase !== 'menu') { toast('Could not rejoin the game', 'bad'); reset(); } });
bus.on('ev', (m) => { if (m.e === 'left' && S.phase !== 'menu') toast(`${m.name} left`); });
bus.on('conn', (ok) => { show('#conn', !ok); const s = $('#mStat'); if (s) s.textContent = ok ? 'online' : 'offline'; });
bus.on('floor', (f) => toast(`Floor ${f + 1}`));

// per-frame HUD updates + FPS-independent timers
(function loop() { requestAnimationFrame(loop); updateHud(); })();

net.connect();
window.AH = { S, W, bus, net };   // handy for debugging / tests
