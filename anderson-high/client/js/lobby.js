// Lobby: crew cards, lobby chat, host controls and match settings.
import { S, $, esc, toast, bus } from './state.js';
import { net } from './net.js';
import { audio } from './audio.js';
import { drawChar, hexOf } from './chars.js';
import { getArt } from './mapart.js';
import { openCustomize, openSettings } from './dialogs.js';

const STEPS = [
  ['maxPlayers', 'Player limit', 4, 10, 1], ['impostors', 'Impostors', 1, 2, 1], ['killCooldown', 'Kill cooldown (s)', 10, 60, 5],
  ['tasksPerPlayer', 'Tasks per player', 2, 8, 1], ['discussionTime', 'Discussion (s)', 0, 60, 5], ['voteTime', 'Voting (s)', 15, 120, 5],
  ['speed', 'Player speed', 0.75, 1.5, 0.25], ['emergencyMeetings', 'Emergency meetings', 0, 3, 1],
];

let chatRendered = 0, settingsOpen = false;

/** Small crewmate portrait for a player card. */
function avatar(p) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 46;
  drawChar(cv.getContext('2d'), { x: 23, y: 34, color: p.color, hat: p.hat, scale: 46 / 38, shadow: false });
  return cv;
}

function msgEl(m) {
  const p = document.createElement('p');
  if (m.sys) { p.className = 'sys'; p.textContent = m.text; return p; }
  const who = document.createElement('b');
  const pl = S.room?.players.find((q) => q.id === m.id);
  who.style.color = hexOf(m.color ?? pl?.color ?? 0);
  who.textContent = m.name || pl?.name || 'Player';
  p.appendChild(who);
  p.appendChild(document.createTextNode(': ' + m.text));
  return p;
}

function syncChat(force = false) {
  const log = $('#llog'); if (!log) return;
  const msgs = S.room?.chat || [];
  if (force || msgs.length < chatRendered) { log.innerHTML = ''; chatRendered = 0; }
  if (!msgs.length) {
    if (!log.firstChild) {
      const p = document.createElement('p'); p.className = 'empty';
      p.textContent = 'No messages yet — say hi to the crew.';
      log.appendChild(p);
    }
    return;
  }
  if (log.firstChild?.classList.contains('empty')) log.innerHTML = '';
  while (chatRendered < msgs.length) log.appendChild(msgEl(msgs[chatRendered++]));
  log.scrollTop = log.scrollHeight;
}

function build(el) {
  el.dataset.built = '1';
  el.innerHTML = `
  <div class="lob-shell">
    <header class="lob-head">
      <div class="lob-brand"><b>ANDERSON HIGH</b><small>AFTER THE BELL · LOBBY</small></div>
      <button class="lob-code" id="lcodeBtn" title="Copy the lobby code">
        <small>CODE</small><b id="lcodeV">----</b><em>COPY</em>
      </button>
      <div class="lob-meta">
        <span class="lob-pill" id="lvis">PRIVATE</span>
        <span class="lob-pill" id="lcount">0/0</span>
        <span class="lob-pill" id="lping">ONLINE</span>
      </div>
    </header>

    <main class="lob-main">
      <section class="panel lob-players">
        <div class="lob-sec-head">
          <h3>CREW <small id="lcrewnote"></small></h3>
          <button class="btn small lob-add" id="lbot">+ ADD BOT</button>
        </div>
        <div class="lob-grid" id="lplayers"></div>
        <div class="lob-brief">
          <div class="lob-brief-info"><b>MEET THE SCHOOL</b><span>Seven halls · two floors · 16 tasks</span><small>WASD to move · E to use · R to report</small></div>
          <canvas id="lmap"></canvas>
        </div>
        <p class="lob-hint" id="lhint"></p>
        <div class="lob-tips">
          <div class="tip"><b>DO TASKS</b><span>Fill the crew bar together</span></div>
          <div class="tip"><b>WATCH THE HALLS</b><span>Report anything suspicious</span></div>
          <div class="tip"><b>VOTE</b><span>Eject the impostor</span></div>
        </div>
      </section>

      <aside class="lob-right">
        <section class="panel lob-set">
          <div class="lob-sec-head"><h3>MATCH</h3><div class="lob-head-right"><span class="lob-tag" id="lsettag">HOST</span><button class="lob-toggle" id="ltoggle">EDIT</button></div></div>
          <div class="lob-summary" id="lsum"></div>
          <div class="lob-rows hidden" id="lrows"></div>
        </section>
        <section class="panel lob-chat">
          <div class="lob-sec-head"><h3>LOBBY CHAT</h3><span class="lob-tag">EVERYONE</span></div>
          <div class="lob-log" id="llog"></div>
          <form id="lform" autocomplete="off">
            <input id="li" maxlength="140" placeholder="Say something to the crew…">
            <button class="btn small green" type="submit">SEND</button>
          </form>
        </section>
      </aside>
    </main>

    <footer class="lob-foot">
      <div class="lob-foot-left"><button class="btn gray small" id="lcust">CUSTOMIZE</button><button class="btn gray small" id="lsetb">SETTINGS</button></div>
      <div class="lob-foot-right"><button class="btn red" id="lleave">LEAVE</button><button class="btn green" id="lstart">START</button></div>
    </footer>
  </div>`;

  $('#lcodeBtn', el).onclick = () => {
    const code = S.room?.code || '';
    navigator.clipboard?.writeText(code).then(() => toast('Lobby code copied!')).catch(() => toast('Code: ' + code));
    audio.sfx('click');
  };
  $('#lcust', el).onclick = () => { audio.sfx('click'); openCustomize(); };
  $('#lsetb', el).onclick = () => { audio.sfx('click'); openSettings(false); };
  $('#lleave', el).onclick = () => { audio.sfx('back'); net.send({ t: 'leave' }); };
  $('#lstart', el).onclick = () => { audio.sfx('start'); net.send({ t: 'start' }); };
  $('#lbot', el).onclick = () => { audio.sfx('click'); net.send({ t: 'addBot' }); };
  $('#ltoggle', el).onclick = () => {
    settingsOpen = !settingsOpen; audio.sfx('click');
    renderSettings(S.room, S.room.hostId === S.id);
  };
  $('#lform', el).onsubmit = (e) => {
    e.preventDefault();
    const input = $('#li', el), text = input.value.trim();
    if (!text) return;
    net.send({ t: 'chat', text });
    input.value = ''; input.focus();
    audio.sfx('click');
  };
  el.addEventListener('click', (e) => {
    const st = e.target.closest?.('[data-k]');
    if (st) {
      const row = STEPS.find(([k]) => k === st.dataset.k); if (!row) return;
      const [k, , lo, hi, step] = row;
      const v = Math.max(lo, Math.min(hi, +(S.room.settings[k] + +st.dataset.d).toFixed(2)));
      audio.sfx('click'); net.send({ t: 'settings', settings: { [k]: v } });
      return;
    }
    const vis = e.target.closest?.('[data-vis]');
    if (vis) { audio.sfx('click'); net.send({ t: 'settings', settings: { isPublic: vis.dataset.vis === '1' } }); return; }
    const kick = e.target.closest?.('[data-kick]');
    if (kick) { audio.sfx('click'); net.send({ t: 'kick', id: +kick.dataset.kick }); }
  });
}

function renderTop(r, host) {
  $('#lcodeV').textContent = r.code;
  const vis = $('#lvis');
  vis.textContent = r.settings.isPublic ? 'PUBLIC' : 'PRIVATE';
  vis.className = 'lob-pill ' + (r.settings.isPublic ? 'pub' : 'priv');
  $('#lcount').textContent = `${r.players.length}/${r.settings.maxPlayers} CREW`;
  $('#lping').textContent = S.connected ? (S.ping ? S.ping + 'ms' : 'ONLINE') : 'OFFLINE';
  $('#lcrewnote').textContent = `${r.players.length}/${r.settings.maxPlayers}`;
  const start = $('#lstart');
  start.classList.toggle('hidden', !host);
  start.textContent = r.players.length < 4 ? 'START WITH BOTS' : 'START MATCH';
  const bot = $('#lbot');
  bot.classList.toggle('hidden', !host);
  bot.disabled = r.players.length >= r.settings.maxPlayers;
  $('#lhint').textContent = host
    ? 'Start anytime — empty seats are filled with bots.'
    : 'Waiting for the host to start the match…';
}

function renderPlayers(r, host) {
  const grid = $('#lplayers'); if (!grid) return;
  const ps = r.players;
  grid.innerHTML = ps.map((p) => {
    const tags = [
      p.id === r.hostId ? '<span class="tag host">HOST</span>' : '',
      p.id === S.id ? '<span class="tag you">YOU</span>' : '',
      p.bot ? '<span class="tag bot">BOT</span>' : '',
      !p.connected ? '<span class="tag off">OFFLINE</span>' : '',
    ].join('');
    return `<div class="pcard${p.id === S.id ? ' me' : ''}${p.id === r.hostId ? ' host' : ''}" data-pid="${p.id}">
      <div class="pav"></div>
      <div class="pinfo"><b>${esc(p.name)}</b><small>${tags}</small></div>
      ${host && p.id !== S.id ? `<button class="kick" data-kick="${p.id}" title="Kick ${esc(p.name)}">✕</button>` : ''}
    </div>`;
  }).join('');
  for (let i = ps.length; i < Math.min(10, r.settings.maxPlayers); i++) {
    grid.insertAdjacentHTML('beforeend', '<div class="pcard empty"><div class="pav"></div><div class="pinfo"><b>OPEN SEAT</b><small><span class="tag">FILLED AT START</span></small></div></div>');
  }
  for (const card of grid.querySelectorAll('.pcard[data-pid]')) {
    const p = ps.find((q) => q.id === +card.dataset.pid);
    if (p) card.querySelector('.pav').appendChild(avatar(p));
  }
}

function renderSettings(r, host) {
  const box = $('#lrows'); if (!box) return;
  const st = r.settings;
  const chips = [st.isPublic ? 'PUBLIC' : 'PRIVATE', `${st.maxPlayers} SEATS`, `${st.impostors} IMP`, `${st.tasksPerPlayer} TASKS`, `${st.killCooldown}s KILL`, `${st.discussionTime}s TALK`, `${st.voteTime}s VOTE`, `${st.speed}× SPEED`, `${st.emergencyMeetings} BELL`];
  $('#lsum').innerHTML = chips.map((c) => `<span class="schip">${c}</span>`).join('');
  $('#lsum').classList.toggle('hidden', settingsOpen);
  box.classList.toggle('hidden', !settingsOpen);
  $('#ltoggle').textContent = settingsOpen ? 'CLOSE' : (host ? 'EDIT' : 'VIEW');
  const vis = `<div class="srow"><span class="sl">Visibility</span>${host
    ? `<div class="seg"><button data-vis="0" class="${st.isPublic ? '' : 'sel'}">Private</button><button data-vis="1" class="${st.isPublic ? 'sel' : ''}">Public</button></div>`
    : `<b class="val">${st.isPublic ? 'Public' : 'Private'}</b>`}</div>`;
  box.innerHTML = vis + STEPS.map(([k, label, lo, hi, step]) => {
    const v = st[k];
    return `<div class="srow"><span class="sl">${label}</span>${host
      ? `<div class="stepper"><button data-k="${k}" data-d="-${step}" ${v <= lo ? 'disabled' : ''}>−</button><b>${v}</b><button data-k="${k}" data-d="${step}" ${v >= hi ? 'disabled' : ''}>+</button></div>`
      : `<b class="val">${v}</b>`}</div>`;
  }).join('');
  $('#lsettag').textContent = host ? 'HOST' : 'HOST ONLY';
}

export function renderLobby() {
  const r = S.room, el = $('#lobby'); if (!r) return;
  if (el.dataset.built !== '1') build(el);
  if (el.dataset.code !== r.code) {
    el.dataset.code = r.code;
    const log = $('#llog', el); if (log) log.innerHTML = '';
    chatRendered = 0;
  }
  const host = r.hostId === S.id;
  renderTop(r, host);
  renderPlayers(r, host);
  renderSettings(r, host);
  drawMapPreview();
  syncChat();
}

function drawMapPreview() {
  const cv = $('#lmap'); if (!cv || cv.dataset.done === '1') return;
  const art = getArt(0, 'low'); if (!art) return;
  const k = Math.min(700 / art.w, 300 / art.h);
  cv.width = Math.round(art.w * k); cv.height = Math.round(art.h * k);
  cv.getContext('2d').drawImage(art.cv, 0, 0, cv.width, cv.height);
  cv.dataset.done = '1';
}

// Live chat while waiting in the lobby (meeting chat has its own handler).
bus.on('chat', (m) => {
  if (S.phase !== 'lobby' || !S.room) return;
  (S.room.chat ||= []).push(m);
  syncChat();
});
