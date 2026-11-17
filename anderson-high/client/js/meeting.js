// Meeting / voting screen, role reveal, ejection cutscene and game-over screen.
import { S, bus, $, $$, esc, show, toast } from './state.js';
import { net } from './net.js';
import { audio } from './audio.js';
import { drawChar, hexOf } from './chars.js';

let selected = null, lastStage = '', chatLog = [], ejectShown = false, timerId = 0, stageChanged = false;
const P = (id) => S.room?.players.find((p) => p.id === id);
function avatar(p, size = 56, dead = false) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d');
  drawChar(c, { x: size / 2, y: size * 0.72, color: p.color, hat: p.hat, scale: size / 38, ghost: dead, shadow: false, blink: false }); return cv;
}

// ---------------------------------------------------------------- meeting
export function renderMeeting() {
  const r = S.room, m = r?.meeting, el = $('#meeting'); if (!m) return;
  const me = P(S.id), alive = me?.alive, voting = m.stage === 'voting', results = m.stage === 'results' || m.stage === 'eject';
  if (m.stage !== lastStage) {
    if (lastStage === '') { chatLog = (m.chat || []).slice(); selected = null; el.innerHTML = ''; audio.sfx(m.bodyId ? 'report' : 'alarm'); }
    if (m.stage === 'voting') audio.sfx('open');
    lastStage = m.stage; stageChanged = true;
  }
  const caller = P(m.callerId);
  const title = m.stage === 'discussion' ? 'DISCUSS' : voting ? 'WHO IS THE IMPOSTOR?' : 'VOTES ARE IN';
  const why = m.bodyId ? `Body reported by <b>${esc(caller?.name)}</b>` : `Emergency meeting called by <b>${esc(caller?.name)}</b>`;
  if (!$('.m-head', el)) el.innerHTML = `<div class="m-head"><div><h1 id="mT"></h1><div class="m-who" id="mW"></div></div><div class="m-timer" id="mC"></div></div><div class="m-main"><div class="m-grid" id="mG"></div><div class="m-chat"><div class="m-log" id="mL"></div><form id="mF"><input id="mI" maxlength="140" placeholder="${alive ? 'Type a message…' : 'Ghosts can only chat with ghosts'}" autocomplete="off"><button class="btn small green">SEND</button></form></div></div><div style="text-align:center"><button class="btn gray" id="mSkip">SKIP VOTE</button></div>`;
  $('#mT').textContent = title; $('#mW').innerHTML = why;
  const grid = $('#mG'); grid.innerHTML = '';
  grid.classList.toggle('anim', stageChanged); stageChanged = false;
  const votesBy = {}; let skips = [];
  if (results && m.result) for (const v of m.result.votes) { if (v.target === 'skip') skips.push(v.voter); else (votesBy[v.target] ||= []).push(v.voter); }
  for (const p of r.players) {
    const card = document.createElement('div'); card.className = 'm-card' + (p.alive ? '' : ' dead') + (p.id === S.id ? ' me' : '') + (selected === p.id ? ' sel' : '');
    card.appendChild(avatar(p, 56, !p.alive));
    const info = document.createElement('div'); info.style.flex = '1'; info.innerHTML = `<b>${esc(p.name)}</b><span class="tag">${p.id === S.id ? 'you' : p.bot ? 'bot' : ''}${S.role === 'imp' && S.mates.includes(p.id) ? ' · fellow impostor' : ''}${!p.connected ? ' · disconnected' : ''}</span>`; card.appendChild(info);
    if (m.voted.includes(p.id) && !results) { const ok = document.createElement('span'); ok.className = 'ok'; ok.textContent = '✅'; card.appendChild(ok); }
    if (results) { const vs = document.createElement('div'); vs.className = 'votes'; (votesBy[p.id] || []).forEach((id) => { const i = document.createElement('i'); i.style.background = hexOf(P(id)?.color); vs.appendChild(i); }); card.appendChild(vs); }
    if (voting && alive && m.myVote === null && p.alive && p.id !== S.id) {
      card.onclick = () => { selected = p.id; audio.sfx('click'); renderMeeting(); };
      if (selected === p.id) { const cf = document.createElement('div'); cf.className = 'confirm'; cf.innerHTML = '<button class="btn small green">✔ VOTE</button><button class="btn small gray">✖</button>'; cf.firstChild.onclick = (e) => { e.stopPropagation(); net.send({ t: 'vote', target: p.id }); audio.sfx('vote'); selected = null; }; cf.lastChild.onclick = (e) => { e.stopPropagation(); selected = null; renderMeeting(); }; card.appendChild(cf); }
    }
    grid.appendChild(card);
  }
  const skip = $('#mSkip');
  skip.classList.toggle('hidden', !(voting && alive && m.myVote === null));
  skip.onclick = () => { net.send({ t: 'vote', target: 'skip' }); audio.sfx('vote'); };
  if (results && skips.length) { const d = document.createElement('div'); d.className = 'm-card'; d.style.cursor = 'default'; d.innerHTML = `<b>Skipped</b>`; const vs = document.createElement('div'); vs.className = 'votes'; skips.forEach((id) => { const i = document.createElement('i'); i.style.background = hexOf(P(id)?.color); vs.appendChild(i); }); d.appendChild(vs); grid.appendChild(d); }
  if (voting && alive && m.myVote !== null) $('#mW').innerHTML += ' · <b>Vote cast ✔</b>';
  renderChat();
  const form = $('#mF'); form.onsubmit = (e) => { e.preventDefault(); const t = $('#mI').value.trim(); if (t) net.send({ t: 'chat', text: t }); $('#mI').value = ''; };
  $('#mI').disabled = !alive && false;
  const end = performance.now() + m.left;
  const upd = () => {
    const el = $('#mC'); if (!el) return;
    const left = Math.max(0, Math.ceil((end - performance.now()) / 1000));
    el.textContent = left + 's'; el.classList.toggle('low', left <= 10);
  }; upd(); clearInterval(timerId); timerId = setInterval(upd, 250);
  if (m.stage === 'results' && !ejectShown && false) ejectShown = true;
  if (m.stage === 'eject') showEject(m.result); else if (m.stage !== 'eject') hideSplash();
}
export function resetMeeting() { lastStage = ''; chatLog = []; selected = null; clearInterval(timerId); ejectShown = false; $('#meeting').innerHTML = ''; }
function renderChat() {
  const log = $('#mL'); if (!log) return;
  log.innerHTML = chatLog.map((c) => { const p = P(c.id); return `<p class="${c.dead ? 'ghost' : ''}"><b style="color:${hexOf(p?.color)};-webkit-text-stroke:.5px #000">${esc(p?.name)}</b>: ${esc(c.text)}</p>`; }).join('');
  log.scrollTop = log.scrollHeight;
}
bus.on('chat', (m) => { if (S.phase !== 'meeting') return; chatLog.push(m); if (chatLog.length > 80) chatLog.shift(); renderChat(); });

// ---------------------------------------------------------------- splash screens
const sp = () => $('#splash');
export function hideSplash() { sp().className = 'hidden'; sp().style.background = ''; sp().innerHTML = ''; }
let ejectKey = '';
function showEject(res) {
  const key = JSON.stringify(res?.ejected); if (!sp().classList.contains('hidden') && ejectKey === key) return; ejectKey = key;
  const e = res?.ejected;
  sp().style.background = ''; sp().className = 'eject'; sp().innerHTML = `<div class="stars"></div><div class="eject-stage"></div><h2 id="ejT"></h2><h2 id="ejS" style="opacity:.85"></h2>`;
  if (e) { const cv = avatar(e, 110); cv.style.borderRadius = '0'; cv.style.background = 'none'; cv.style.border = 'none'; $('.eject-stage').appendChild(cv); audio.sfx('eject'); }
  const line1 = e ? `${e.name} was ejected.` : (res?.tie ? 'No one was ejected. (Tie)' : 'No one was ejected. (Skipped)');
  const line2 = e && e.wasImp !== null ? `${e.name} ${e.wasImp ? 'was' : 'was not'} an Impostor.` : '';
  const line3 = res?.impsLeft != null ? `${res.impsLeft} Impostor${res.impsLeft === 1 ? '' : 's'} remain${res.impsLeft === 1 ? 's' : ''}.` : '';
  let i = 0; const T = $('#ejT'); const type = () => { if (!T || !T.isConnected) return; T.textContent = line1.slice(0, ++i); if (i < line1.length) setTimeout(type, 45); else { $('#ejS').textContent = [line2, line3].filter(Boolean).join('  ·  '); } };
  setTimeout(type, e ? 1400 : 300);
}

export function showRole(m) {
  if (!m.introMs) return;
  const imp = m.role === 'imp';
  sp().style.background = ''; sp().className = 'role' + (imp ? ' imp' : '');
  sp().innerHTML = `<h2>${imp ? 'Sabotage. Blend in. Take them out.' : 'Finish your tasks. Find the impostor.'}</h2><h1 style="color:${imp ? '#ff5d5d' : '#8fe6f6'}">${imp ? 'IMPOSTOR' : 'CREWMATE'}</h1><div class="sp-chars" id="spc"></div><h2 style="margin-top:14px">${imp ? (m.mates.length > 1 ? 'Your partner is shown below' : 'You are the only impostor') : `There ${S.room.settings.impostors > 1 ? 'are impostors' : 'is an impostor'} among us`}</h2>`;
  const list = imp ? m.mates.map(P).filter(Boolean) : S.room.players;
  for (const p of list) { const w = document.createElement('div'); w.style.textAlign = 'center'; w.appendChild(avatar(p, 80)); const n = document.createElement('div'); n.style.cssText = 'font-weight:800;color:' + (imp ? '#ff8a8a' : '#eaf6ff'); n.textContent = p.name; w.appendChild(n); $('#spc').appendChild(w); }
  audio.sfx('role');
  setTimeout(() => { if (sp().classList.contains('role')) hideSplash(); }, m.introMs - 300);
}

export function showEnd() {
  const r = S.room?.result; if (!r) return;
  const win = (r.winner === 'imp') === (S.role === 'imp');
  sp().className = win ? 'victory' : 'defeat'; sp().style.background = win ? 'radial-gradient(circle,#2f6a3c,#0a1a10)' : 'radial-gradient(circle,#6a2f2f,#1a0a0a)';
  const host = S.room.hostId === S.id;
  sp().innerHTML = `<h1>${win ? 'VICTORY' : 'DEFEAT'}</h1><h2>${r.winner === 'imp' ? 'The Impostors win' : 'The Crew wins'} — ${esc(r.reason)}</h2><div class="end-list">${r.roles.map((x) => `<div class="${x.role}" data-id="${x.id}"><span class="av"></span>${esc(x.name)}<small>${x.role === 'imp' ? 'IMPOSTOR' : 'Crewmate'}</small></div>`).join('')}</div>${host ? '<button class="btn gold" id="toL">BACK TO LOBBY</button>' : '<p>Returning to the lobby shortly…</p>'}`;
  $$('.end-list [data-id]').forEach((d) => { const x = r.roles.find((q) => q.id === +d.dataset.id); $('.av', d).appendChild(avatar(x, 70, !x.alive)); });
  if ($('#toL')) $('#toL').onclick = () => net.send({ t: 'toLobby' });
  audio.sfx(win ? 'win' : 'lose');
}
