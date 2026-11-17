// Shared constants used by BOTH the server and the browser client.

export const CELL = 24;          // world units per grid cell
export const COLS = 80;
export const ROWS = 85;
export const WORLD_W = COLS * CELL;
export const WORLD_H = ROWS * CELL;

export const PLAYER_R = 10;      // collision radius in world units
export const BASE_SPEED = 150;   // world units / second at speed multiplier 1
export const TICK_RATE = 30;     // server simulation ticks per second
export const SNAP_EVERY = 2;     // broadcast every N ticks (=15 Hz)

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;
export const DEFAULT_MAX_PLAYERS = 8;

export const USE_RANGE = 56;      // units to use a task station / button / vent
export const KILL_RANGE = 74;     // units for elimination
export const REPORT_RANGE = 100;  // units to report a body

export const FLOOR_1 = 0;
export const FLOOR_2 = 1;
export const FLOOR_LOBBY = 2;     // pseudo floor index for the waiting area

export const COLORS = [
  { name: 'Crimson',  hex: '#e0413f' },
  { name: 'Ocean',    hex: '#2f6fe0' },
  { name: 'Forest',   hex: '#2f9a4a' },
  { name: 'Sunny',    hex: '#f2c230' },
  { name: 'Tangerine',hex: '#f08a2a' },
  { name: 'Grape',    hex: '#8a4fd6' },
  { name: 'Bubblegum',hex: '#f276b8' },
  { name: 'Mint',     hex: '#4fdcb4' },
  { name: 'Sky',      hex: '#5cc8f0' },
  { name: 'Cocoa',    hex: '#8a5a3a' },
  { name: 'Slate',    hex: '#5b6577' },
  { name: 'Snow',     hex: '#f1f1f1' },
];

export const HATS = ['none', 'cap', 'beanie', 'headphones', 'glasses', 'bow', 'crown', 'headband', 'flower', 'gradcap'];

export const DEFAULT_SETTINGS = {
  maxPlayers: DEFAULT_MAX_PLAYERS,
  impostors: 1,
  isPublic: false,
  speed: 1,            // movement multiplier
  killCooldown: 25,    // seconds
  tasksPerPlayer: 5,
  discussionTime: 15,
  voteTime: 35,
  emergencyMeetings: 1,
  confirmEjects: true,
  crewVision: 1,       // multiplier
  impVision: 1.4,
};

export const SETTING_LIMITS = {
  maxPlayers: [MIN_PLAYERS, MAX_PLAYERS],
  impostors: [1, 2],
  speed: [0.75, 1.5],
  killCooldown: [10, 60],
  tasksPerPlayer: [2, 8],
  discussionTime: [0, 60],
  voteTime: [15, 120],
  emergencyMeetings: [0, 3],
  crewVision: [0.5, 1.5],
  impVision: [0.75, 2],
};

export const VISION_BASE = 330;     // world units radius of normal vision
export const LIGHTS_OUT_VISION = 0.3; // multiplier on crew vision during a lights-out sabotage
export const SABOTAGE_COOLDOWN = 30;  // seconds
export const FIRE_TIME = 45;          // seconds to fix the fire drill
export const START_KILL_DELAY = 10;   // seconds before first kill allowed
export const EMERGENCY_DELAY = 12;    // seconds after start/meeting before the button works
export const VENT_COOLDOWN = 1;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
