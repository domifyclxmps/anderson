// All sound is synthesised with WebAudio (no asset files): sound effects + procedural background music.
import { settings, onSettings } from './settings.js';

let ctx = null, master, sfxBus, musBus, noiseBuf;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function ensure() {
  if (ctx) return true;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
  master = ctx.createGain(); sfxBus = ctx.createGain(); musBus = ctx.createGain();
  sfxBus.connect(master); musBus.connect(master); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  apply();
  return true;
}
function apply() {
  if (!ctx) return;
  master.gain.value = settings.master; sfxBus.gain.value = settings.sfx;
  musBus.gain.value = settings.musicOn ? settings.music * 0.45 : 0;
}
onSettings(apply);

function tone(f, dur, type = 'sine', vol = 0.15, o = {}) {
  const t = ctx.currentTime + (o.delay || 0);
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f + o.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(o.bus || sfxBus);
  osc.start(t); osc.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.15, o = {}) {
  const t = ctx.currentTime + (o.delay || 0);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.value = o.freq || 1500;
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
  src.start(t); src.stop(t + dur + 0.05);
}

const SFX = {
  click() { tone(720, 0.05, 'square', 0.07); },
  hover() { tone(980, 0.025, 'sine', 0.03); },
  back() { tone(440, 0.07, 'square', 0.07, { slide: -120 }); },
  pop() { tone(520, 0.09, 'sine', 0.12, { slide: 380 }); },
  join() { tone(523, 0.1, 'triangle', 0.12); tone(784, 0.14, 'triangle', 0.12, { delay: 0.09 }); },
  leave() { tone(523, 0.1, 'triangle', 0.1); tone(392, 0.16, 'triangle', 0.1, { delay: 0.09 }); },
  step() { noise(0.05, 0.05, { freq: 500 }); },
  open() { tone(420, 0.1, 'triangle', 0.1, { slide: 260 }); },
  good() { tone(660, 0.08, 'triangle', 0.1); },
  bad() { tone(160, 0.18, 'sawtooth', 0.09, { slide: -50 }); },
  task() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, { delay: i * 0.07 })); },
  stairs() { noise(0.35, 0.09, { freq: 300, sweep: 1800, type: 'bandpass' }); tone(300, 0.3, 'sine', 0.06, { slide: 300 }); },
  kill() { noise(0.25, 0.3, { freq: 900 }); tone(110, 0.3, 'sawtooth', 0.2, { slide: -70 }); },
  die() { tone(330, 0.5, 'sawtooth', 0.14, { slide: -250 }); noise(0.4, 0.15, { freq: 700 }); },
  alarm() { for (let i = 0; i < 6; i++) tone(i % 2 ? 640 : 880, 0.16, 'square', 0.11, { delay: i * 0.17 }); },
  report() { tone(196, 0.5, 'sawtooth', 0.18); tone(246, 0.5, 'sawtooth', 0.14, { delay: 0.02 }); noise(0.3, 0.08, { freq: 2200 }); },
  vote() { tone(880, 0.07, 'square', 0.08); tone(1175, 0.1, 'square', 0.08, { delay: 0.06 }); },
  eject() { noise(1.2, 0.2, { freq: 300, sweep: 4000, type: 'bandpass' }); tone(500, 1.2, 'sine', 0.1, { slide: -420 }); },
  sabotage() { for (let i = 0; i < 4; i++) { tone(300, 0.22, 'sawtooth', 0.14, { delay: i * 0.3, slide: 200 }); } },
  fixed() { [392, 523, 659].forEach((f, i) => tone(f, 0.2, 'sine', 0.13, { delay: i * 0.08 })); },
  vent() { noise(0.25, 0.14, { freq: 600, type: 'bandpass' }); tone(180, 0.2, 'square', 0.05); },
  role() { tone(98, 1.2, 'sawtooth', 0.15); tone(147, 1.2, 'sawtooth', 0.1, { delay: 0.01 }); noise(0.6, 0.1, { freq: 400 }); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, { delay: i * 0.11 })); },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.1, { delay: i * 0.2 })); },
  start() { for (let i = 0; i < 4; i++) { noise(0.08, 0.2, { freq: 200, delay: i * 0.22 }); tone(80, 0.12, 'sine', 0.2, { delay: i * 0.22 }); } },
};

// ---------------------------------------------------------------- music
const MODES = {
  menu: { bpm: 112, prog: [57, 53, 48, 55], minor: false, arp: true, drums: 1 },
  game: { bpm: 84, prog: [45, 41, 43, 40], minor: true, arp: false, drums: 0 },
  tense: { bpm: 132, prog: [45, 45, 44, 43], minor: true, arp: true, drums: 2 },
  meeting: { bpm: 100, prog: [50, 46, 43, 45], minor: true, arp: true, drums: 1 },
};
let mode = null, timer = 0, step = 0, nextT = 0;
function playStep(m, s, t) {
  const bar = Math.floor(s / 16) % m.prog.length, k = s % 16, root = m.prog[bar];
  const at = t - ctx.currentTime;
  if (k % 4 === 0 || (m.drums === 2 && k % 2 === 0)) tone(mtof(root - 12), 0.28, 'triangle', 0.5, { bus: musBus, delay: at });
  if (m.arp && k % 2 === 0) {
    const iv = m.minor ? [0, 3, 7, 12, 7, 3, 10, 7] : [0, 4, 7, 12, 7, 4, 9, 7];
    tone(mtof(root + 12 + iv[(k / 2) % 8]), 0.2, 'square', 0.1, { bus: musBus, delay: at });
  }
  if (!m.arp && k === 0) { tone(mtof(root + 12), 1.6, 'sine', 0.22, { bus: musBus, delay: at }); tone(mtof(root + (m.minor ? 15 : 16)), 1.6, 'sine', 0.14, { bus: musBus, delay: at }); }
  if (m.drums && k % 8 === 0) { noise(0.1, 0.5, { freq: 160, bus: musBus, delay: at }); }
  if (m.drums && k % 4 === 2) noise(0.05, 0.14, { freq: 6000, type: 'highpass', bus: musBus, delay: at });
}
function pump() {
  const m = MODES[mode]; if (!m || !ctx) return;
  if (ctx.state === 'running') {
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.35) { playStep(m, step++, nextT); nextT += 60 / m.bpm / 4; }
  }
  timer = setTimeout(pump, 120);
}

export const audio = {
  unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); if (mode && !timer) pump(); },
  sfx(n) { if (!ensure() || ctx.state !== 'running') return; try { SFX[n]?.(); } catch { /* ignore */ } },
  music(m) {
    if (m === mode) return;
    mode = m; step = 0; clearTimeout(timer); timer = 0;
    if (m && ensure()) { nextT = 0; pump(); }
  },
};
