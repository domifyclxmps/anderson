// Tiny shared store + event bus + DOM helpers (no framework, no build step).
export const S = {
  room: null, id: null, code: null, token: null,
  role: null, mates: [], tasks: [], fake: false,
  phase: 'menu', connected: false, ping: 0,
  dead: false, introUntil: 0,
};

const handlers = new Map();
export const bus = {
  on(e, f) { if (!handlers.has(e)) handlers.set(e, []); handlers.get(e).push(f); return f; },
  emit(e, ...a) { for (const f of handlers.get(e) || []) { try { f(...a); } catch (err) { console.error('handler', e, err); } } },
};

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const player = (id) => S.room?.players.find((p) => p.id === id);

let toastTimer = 0;
export function toast(msg, kind = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}
export function show(el, on = true) { (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on); }
export function mulberry(seed) { // deterministic RNG so every minigame is reproducible from the server seed
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffled(arr, rnd = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
