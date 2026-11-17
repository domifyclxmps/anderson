// Persisted user settings (sound, music, graphics, controls) and the player's profile.
const KEY = 'ah.settings.v1', PKEY = 'ah.profile.v1';

export const DEFAULT_KEYS = { use: 'KeyE', report: 'KeyR', kill: 'KeyQ', sabotage: 'KeyF', vent: 'KeyV', map: 'KeyM' };
const DEFAULTS = { master: 0.8, sfx: 0.9, music: 0.55, musicOn: true, quality: 'high', showFps: false, zoom: 1, joystick: 'auto', keys: { ...DEFAULT_KEYS } };

function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }

export const settings = { ...DEFAULTS, ...(read(KEY) || {}) };
settings.keys = { ...DEFAULT_KEYS, ...(settings.keys || {}) };
const listeners = [];
export const onSettings = (f) => listeners.push(f);
export function saveSettings() { write(KEY, settings); listeners.forEach((f) => f(settings)); }

const adjectives = ['Swift', 'Sleepy', 'Brave', 'Sneaky', 'Lucky', 'Quiet', 'Zesty', 'Mighty'];
const nouns = ['Tiger', 'Panda', 'Falcon', 'Otter', 'Wolf', 'Koala', 'Pigeon', 'Badger'];
export const profile = { name: '', color: Math.floor(Math.random() * 12), hat: 'none', ...(read(PKEY) || {}) };
if (!profile.name) profile.name = adjectives[Math.floor(Math.random() * 8)] + nouns[Math.floor(Math.random() * 8)];
profile.name = profile.name.slice(0, 12);
export function saveProfile() { write(PKEY, profile); }

export const isTouch = () => settings.joystick === 'on' || (settings.joystick === 'auto' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

// per-tab session (so two tabs can be two players, and a refresh reconnects)
export const session = {
  get() { try { return JSON.parse(sessionStorage.getItem('ah.session') || 'null'); } catch { return null; } },
  set(v) { try { sessionStorage.setItem('ah.session', JSON.stringify(v)); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem('ah.session'); } catch { /* ignore */ } },
};
