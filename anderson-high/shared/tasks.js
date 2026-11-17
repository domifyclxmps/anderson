// School task catalogue + interactive stations (sabotage fixes, emergency button).
import { P, FLOORS } from './map.js';
import { FLOOR_1, FLOOR_2 } from './constants.js';

// game = which minigame the client opens (see client/js/minigames.js)
const T = (id, name, floor, x, y, game, room, desc) => ({ id, name, floor, ...P(x, y), game, room, desc });

export const TASKS = [
  // Cafeteria
  T('cafe_clean',   'Clean a table',            FLOOR_1, 645, 300, 'wipe',      'Cafeteria',    'Scrub the spills off the table'),
  T('cafe_trays',   'Organize cafeteria trays', FLOOR_1, 745, 525, 'order',     'Cafeteria',    'Stack the trays smallest to largest'),
  T('cafe_restock', 'Restock supplies',         FLOOR_1, 710, 155, 'bins',      'Cafeteria',    'Put each item on the right shelf'),
  // Science Hall
  T('sci_exp',      'Laboratory experiment',    FLOOR_1, 105, 840, 'sequence',  'Science Hall', 'Add the reagents in the right order'),
  T('sci_equip',    'Organize lab equipment',   FLOOR_1, 105, 770, 'bins',      'Science Hall', 'Sort the equipment into its drawers'),
  T('sci_chem',     'Sort the sample bottles',  FLOOR_1, 105, 700, 'bins',      'Science Hall', 'Sort the bottles by colour'),
  // Spanish Hall
  T('spa_vocab',    'Trace the hall wiring',    FLOOR_1, 385, 150, 'wires',     'Spanish Hall', 'Connect each wire to its matching terminal'),
  T('spa_mats',     'Sort classroom supplies',  FLOOR_1, 420, 195, 'bins',      'Spanish Hall', 'Put each supply in the right bin'),
  // English Hall
  T('eng_books',    'Organize books',           FLOOR_1, 95, 360, 'order',      'English Hall', 'Shelve the books thinnest to thickest'),
  T('eng_vocab',    'Reroute the signal wires', FLOOR_1, 95, 470, 'wires',      'English Hall', 'Connect each wire to its matching terminal'),
  // History Hall (floor 2)
  T('his_docs',     'Stack the archive crates', FLOOR_2, 385, 150, 'order',     'History Hall', 'Stack the crates lightest to heaviest'),
  T('his_dates',    'Replace the burnt fuses',  FLOOR_2, 420, 195, 'fuses',     'History Hall', 'Match each fuse to its socket'),
  // Math Hall (floor 2)
  T('math_puzzle',  'Calibrate the thermostats', FLOOR_2, 100, 385, 'dials',    'Math Hall',    'Turn every dial to its target reading'),
  T('math_eq',      'Balance the power dials',  FLOOR_2, 100, 440, 'dials',     'Math Hall',    'Turn every dial to its target reading'),
  // Aux Gym
  T('gym_equip',    'Organize sports equipment', FLOOR_1, 690, 610, 'bins',     'Aux Gym',      'Put each ball in the right crate'),
  T('gym_supplies', 'Collect gym supplies',     FLOOR_1, 700, 770, 'collect',   'Aux Gym',      'Grab all the loose gear'),
];
export const TASK_BY_ID = Object.fromEntries(TASKS.map((t) => [t.id, t]));

/** Interactive non-task stations. */
export const STATIONS = {
  emergency: { id: 'emergency', name: 'Emergency Bell', floor: FLOOR_1, ...FLOORS[FLOOR_1].emergency },
  fix_lights: { id: 'fix_lights', name: 'Electrical Panel', floor: FLOOR_1, ...P(300, 674), game: 'switches' },
  fire_a: { id: 'fire_a', name: 'Fire Panel A', floor: FLOOR_1, ...P(105, 650), game: 'keypad' },
  fire_b: { id: 'fire_b', name: 'Fire Panel B', floor: FLOOR_1, ...P(700, 536), game: 'keypad' },
};

export const SABOTAGES = {
  lights: { id: 'lights', name: 'Lights Out', desc: 'Crew vision collapses until the electrical panel is fixed' },
  fire: { id: 'fire', name: 'Fire Drill', desc: 'Both fire panels must be reset before time runs out' },
};

/** Fake task list for impostors: names only. */
export function pickTasks(count, rng = Math.random) {
  const pool = TASKS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.min(count, pool.length)).map((t) => t.id);
}
