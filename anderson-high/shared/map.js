// Anderson High School — two floors + a lobby, built from the reference image.
//
// Geometry is authored in *reference-image pixels* (the supplied two-floor map picture,
// Floor-1 coordinates; Floor 2 is aligned onto the same coordinate system so the three
// staircases line up exactly). One grid cell = 10 image px = CELL world units.
//
// Cell values:  0 = wall/void (solid)   1 = walkable floor   2 = obstacle (desk, tree...) (solid)

import { CELL, COLS, ROWS, FLOOR_1, FLOOR_2, FLOOR_LOBBY } from './constants.js';

export const OX = 10, OY = 80, PXC = 10;

export const ROOM = {
  NONE: 0, SPANISH: 1, ENGLISH: 2, SCIENCE: 3, COURTYARD: 4, CAFETERIA: 5, GYM: 6, MAIN: 7,
  NORTH: 8, WEST: 9, EAST: 10, HISTORY: 11, MATH: 12, UPPER: 13, STAIR: 14, LOBBY: 15,
  OVERLOOK: 250, GARDEN: 251,
};
export const ROOM_NAMES = {
  0: 'Outside', 1: 'Spanish Hall', 2: 'English Hall', 3: 'Science Hall', 4: 'Courtyard',
  5: 'Cafeteria', 6: 'Aux Gym', 7: 'Main Hall', 8: 'North Hall', 9: 'West Hall', 10: 'East Hall',
  11: 'History Hall', 12: 'Math Hall', 13: 'Upper Hall', 14: 'Staircase', 15: 'Lobby',
};

const toC = (x) => Math.round((x - OX) / PXC);
const toR = (y) => Math.round((y - OY) / PXC);
/** image px -> world units */
export const P = (x, y) => ({ x: ((x - OX) / PXC) * CELL, y: ((y - OY) / PXC) * CELL });
const rc = ([x0, y0, x1, y1]) => {
  const c0 = toC(x0), r0 = toR(y0);
  return [c0, r0, Math.max(toC(x1), c0 + 1), Math.max(toR(y1), r0 + 1)];
};
/** image-px rect -> world rect {x0,y0,x1,y1} */
export const R = ([x0, y0, x1, y1]) => {
  const a = P(x0, y0), b = P(x1, y1);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
};

function newFloor(id, name) {
  return {
    id, name,
    grid: new Uint8Array(COLS * ROWS),
    room: new Uint8Array(COLS * ROWS),
    objects: [], doors: [], labels: [], vents: [], stairVisuals: [],
    bounds: null,
  };
}
function carve(f, rect, id) {
  const [c0, r0, c1, r1] = rc(rect);
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) { f.grid[r * COLS + c] = 1; f.room[r * COLS + c] = id; }
}
function carveCells(f, c0, r0, c1, r1, id) {
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) { f.grid[r * COLS + c] = 1; f.room[r * COLS + c] = id; }
}
function mark(f, rect, id) { // tag void cells (overlook / garden) without making them walkable
  const [c0, r0, c1, r1] = rc(rect);
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) f.room[r * COLS + c] = id;
}
function block(f, rect, kind, extra = {}) {
  const [c0, r0, c1, r1] = rc(rect);
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (f.grid[r * COLS + c] === 1) f.grid[r * COLS + c] = 2;
  f.objects.push({ kind, c0, r0, c1, r1, ...extra });
}
function blockCells(f, c0, r0, c1, r1, kind, extra = {}) {
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (f.grid[r * COLS + c] === 1) f.grid[r * COLS + c] = 2;
  f.objects.push({ kind, c0, r0, c1, r1, ...extra });
}
function scenery(f, rect, kind, extra = {}) { // drawn but changes no collision
  const [c0, r0, c1, r1] = rc(rect);
  f.objects.push({ kind, c0, r0, c1, r1, scenery: true, ...extra });
}
function door(f, rect, axis) { // opening already carved; register for drawing
  const [c0, r0, c1, r1] = rc(rect);
  f.doors.push({ c0, r0, c1, r1, axis });
}
function label(f, text, x, y, size = 1) { f.labels.push({ text, ...P(x, y), size }); }
// furniture snapped to whole cells around a centre point (image px)
function blockCentered(f, cx, cy, wc, hc, kind, extra = {}) {
  const c0 = Math.round((cx - OX) / PXC - wc / 2), r0 = Math.round((cy - OY) / PXC - hc / 2);
  blockCells(f, c0, r0, c0 + wc, r0 + hc, kind, extra);
}
const desk = (f, cx, cy, wc = 3, hc = 2, kind = 'desk') => blockCentered(f, cx, cy, wc, hc, kind);

// ------------------------------------------------------------------ geometry shared by both floors
const STAIR_DEFS = [
  { id: 1, name: 'Staircase 1', hint: 'Cafeteria / Spanish Hall', alcove: [573, 100, 620, 232], trigger: [575, 100, 620, 172] },
  { id: 2, name: 'Staircase 2', hint: 'English / Spanish Hall', alcove: [170, 100, 218, 232], trigger: [172, 100, 218, 172] },
  { id: 3, name: 'Staircase 3', hint: 'Courtyard', alcove: [352, 540, 428, 600], trigger: [354, 540, 426, 576] },
];
export const STAIRS = STAIR_DEFS.map((s) => ({
  id: s.id, name: s.name, hint: s.hint,
  trigger: R(s.trigger), visual: R(s.alcove), margin: 34,
}));

// ------------------------------------------------------------------ FLOOR 1
function buildFloor1() {
  const f = newFloor(FLOOR_1, 'Floor 1');
  // English Hall strip + west link, Science Hall (long hallway, floor 1 only)
  carve(f, [35, 100, 160, 500], ROOM.ENGLISH);
  carve(f, [35, 500, 135, 615], ROOM.ENGLISH);
  carve(f, [30, 615, 175, 915], ROOM.SCIENCE);
  // north hall + stair alcoves
  carve(f, [160, 232, 625, 268], ROOM.NORTH);
  carve(f, [170, 100, 218, 232], ROOM.STAIR);
  carve(f, [573, 100, 620, 232], ROOM.STAIR);
  // Spanish Hall (upper middle) + its door
  carve(f, [230, 105, 555, 222], ROOM.SPANISH);
  carve(f, [345, 222, 450, 232], ROOM.SPANISH); door(f, [345, 222, 450, 232], 'h');
  // courtyard (central) with three doors
  carve(f, [225, 278, 555, 530], ROOM.COURTYARD);
  carve(f, [365, 268, 425, 278], ROOM.COURTYARD); door(f, [365, 268, 425, 278], 'h');
  carve(f, [215, 430, 225, 490], ROOM.COURTYARD); door(f, [215, 430, 225, 490], 'v');
  carve(f, [555, 430, 565, 490], ROOM.COURTYARD); door(f, [555, 430, 565, 490], 'v');
  // side corridors around the courtyard
  carve(f, [175, 268, 215, 540], ROOM.WEST);
  carve(f, [565, 268, 625, 560], ROOM.EAST);
  // big south hall
  carve(f, [135, 540, 640, 690], ROOM.MAIN);
  // Cafeteria (upper right)
  carve(f, [625, 140, 795, 558], ROOM.CAFETERIA);
  // Aux Gym (right) + doors
  carve(f, [645, 568, 795, 875], ROOM.GYM);
  carve(f, [690, 558, 750, 568], ROOM.GYM); door(f, [690, 558, 750, 568], 'h');
  carve(f, [635, 590, 645, 680], ROOM.GYM); door(f, [635, 590, 645, 680], 'v');
  // doorway into Science Hall from the west link
  door(f, [35, 600, 135, 618], 'h');
  // glass-walled garden under the main hall (scenery only)
  mark(f, [215, 690, 565, 795], ROOM.GARDEN);

  // --- Spanish Hall furniture
  for (const [x, y] of [[262, 155], [300, 155], [262, 195], [300, 195], [493, 155], [530, 155], [493, 195], [530, 195]]) desk(f, x, y);
  block(f, [235, 105, 345, 125], 'lockers'); block(f, [480, 105, 553, 125], 'lockers');
  // --- English Hall
  block(f, [36, 215, 60, 275], 'lockers', { vertical: true });
  block(f, [36, 295, 60, 345], 'lockers', { vertical: true });
  block(f, [36, 385, 60, 445], 'lockers', { vertical: true });
  desk(f, 101, 261); desk(f, 101, 311); desk(f, 114, 433);
  block(f, [37, 105, 70, 130], 'cabinet');
  // --- Cafeteria tables (two columns x two groups) + kitchen counter (scenery on wall cells)
  for (const y0 of [205, 245, 285, 390, 430, 470]) {
    block(f, [658, y0, 712, y0 + 23], 'ctable');
    block(f, [737, y0, 777, y0 + 23], 'ctable');
  }
  scenery(f, [640, 98, 785, 138], 'kitchen');
  // --- Courtyard trees
  for (const [x, y] of [[330, 300], [450, 300], [255, 390], [530, 390], [335, 470], [445, 470]]) blockCentered(f, x, y, 3, 3, 'tree');
  // --- Science Hall benches + shelves
  block(f, [32, 770, 70, 800], 'bench'); block(f, [32, 810, 70, 840], 'bench');
  block(f, [32, 850, 70, 880], 'bench'); block(f, [32, 885, 100, 912], 'bench');
  for (const y of [700, 760, 820, 870]) block(f, [145, y, 172, y + 36], 'shelf');
  // --- Main hall planters + panel
  block(f, [236, 592, 256, 612], 'planter'); block(f, [540, 592, 560, 612], 'planter');
  block(f, [195, 598, 215, 618], 'planter'); block(f, [585, 598, 605, 618], 'planter');
  scenery(f, [285, 690, 317, 700], 'panel');
  // --- Gym
  block(f, [706, 822, 736, 846], 'hoop');
  scenery(f, [650, 860, 790, 874], 'bleacher');

  // --- labels (positions from the reference image)
  label(f, 'SPANISH HALL', 398, 172); label(f, 'ENGLISH HALL', 112, 372);
  label(f, 'COURTYARD', 393, 428); label(f, 'CAFETERIA', 702, 358);
  label(f, 'SCIENCE HALL', 100, 712); label(f, 'AUX GYM', 720, 702);
  label(f, 'MAIN HALL', 400, 648, 0.8);

  f.emergency = P(643, 352);
  f.vents = [
    { id: 1, ...P(410, 118) }, { id: 2, ...P(95, 150) }, { id: 3, ...P(780, 170) },
    { id: 4, ...P(60, 668) }, { id: 5, ...P(780, 592) },
  ];
  return f;
}

// ------------------------------------------------------------------ FLOOR 2
function buildFloor2() {
  const f = newFloor(FLOOR_2, 'Floor 2');
  carve(f, [35, 100, 160, 268], ROOM.UPPER);               // north-west landing above English Hall
  carve(f, [35, 280, 160, 480], ROOM.MATH);                 // Math Hall (directly above English Hall)
  carve(f, [160, 380, 175, 430], ROOM.MATH); door(f, [160, 380, 175, 430], 'v');
  carve(f, [160, 232, 640, 268], ROOM.UPPER);               // upper north hall
  carve(f, [170, 100, 218, 232], ROOM.STAIR);
  carve(f, [573, 100, 620, 232], ROOM.STAIR);
  carve(f, [230, 105, 555, 222], ROOM.HISTORY);             // History Hall (directly above Spanish Hall)
  carve(f, [345, 222, 450, 232], ROOM.HISTORY); door(f, [345, 222, 450, 232], 'h');
  carve(f, [175, 268, 215, 540], ROOM.UPPER);               // gallery around the courtyard void
  carve(f, [565, 268, 640, 540], ROOM.UPPER);
  carve(f, [135, 540, 640, 690], ROOM.UPPER);               // upper south hall
  mark(f, [225, 278, 555, 530], ROOM.OVERLOOK);             // open to the courtyard below

  for (const [x, y] of [[262, 155], [300, 155], [262, 195], [300, 195], [493, 155], [530, 155], [493, 195], [530, 195]]) desk(f, x, y);
  block(f, [235, 105, 345, 125], 'lockers'); block(f, [480, 105, 553, 125], 'lockers');
  // Math Hall desks
  for (const [x, y] of [[60, 305], [60, 345], [138, 305], [138, 345]]) desk(f, x, y, 4, 2);
  block(f, [37, 440, 60, 478], 'lockers', { vertical: true });
  block(f, [37, 105, 70, 130], 'cabinet');
  block(f, [236, 592, 256, 612], 'planter'); block(f, [540, 592, 560, 612], 'planter');
  block(f, [195, 598, 215, 618], 'planter'); block(f, [585, 598, 605, 618], 'planter');

  label(f, 'HISTORY HALL', 398, 172); label(f, 'MATH HALL', 100, 262 + 0);
  label(f, 'UPPER HALL', 400, 250, 0.7);
  label(f, 'COURTYARD (OPEN BELOW)', 390, 405, 0.8);
  f.vents = [{ id: 6, ...P(410, 118) }, { id: 7, ...P(110, 462) }];
  return f;
}

// ------------------------------------------------------------------ LOBBY (waiting area)
function buildLobby() {
  const f = newFloor(FLOOR_LOBBY, 'Lobby');
  carveCells(f, 24, 28, 58, 54, ROOM.LOBBY);
  // stage / bleachers / lockers along the back wall
  blockCells(f, 32, 28, 50, 32, 'stage');
  blockCells(f, 24, 28, 28, 36, 'lockers', { vertical: true });
  blockCells(f, 54, 28, 58, 36, 'lockers', { vertical: true });
  blockCells(f, 24, 48, 27, 54, 'bench'); blockCells(f, 55, 48, 58, 54, 'bench');
  blockCells(f, 40, 40, 42, 42, 'planter');
  blockCells(f, 30, 38, 32, 40, 'planter'); blockCells(f, 50, 38, 52, 40, 'planter');
  f.labels.push({ text: 'ANDERSON HIGH', x: 41 * CELL, y: 36 * CELL, size: 1.2 });
  f.labels.push({ text: 'WAITING AREA', x: 41 * CELL, y: 38.6 * CELL, size: 0.6 });
  f.lobbySpawn = { x0: 31 * CELL, y0: 43 * CELL, x1: 51 * CELL, y1: 52 * CELL };
  return f;
}

function finish(f) {
  let minC = COLS, minR = ROWS, maxC = 0, maxR = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (f.grid[r * COLS + c]) {
    if (c < minC) minC = c; if (c > maxC) maxC = c; if (r < minR) minR = r; if (r > maxR) maxR = r;
  }
  f.bounds = { x0: minC * CELL, y0: minR * CELL, x1: (maxC + 1) * CELL, y1: (maxR + 1) * CELL };
  return f;
}

export const FLOORS = [finish(buildFloor1()), finish(buildFloor2()), finish(buildLobby())];

/** Where the 10 players start: two rows in the Cafeteria aisle. */
export const SPAWNS = [];
for (let i = 0; i < 10; i++) SPAWNS.push(P(672 + (i % 5) * 26, i < 5 ? 330 : 372));

export function roomAt(floor, x, y) {
  const f = FLOORS[floor]; if (!f) return 0;
  const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 0;
  return f.room[r * COLS + c];
}
export function roomName(floor, x, y) { return ROOM_NAMES[roomAt(floor, x, y)] || 'Hallway'; }

// ------------------------------------------------------------------ vents (impostor-only secret routes)
export const VENT_LINKS = [[1, 6], [1, 3], [1, 2], [2, 7], [2, 4], [3, 5]];
export const ALL_VENTS = [];
for (const f of FLOORS.slice(0, 2)) for (const v of f.vents) ALL_VENTS.push({ id: v.id, floor: f.id, x: v.x, y: v.y, links: [] });
for (const [a, b] of VENT_LINKS) {
  ALL_VENTS.find((v) => v.id === a).links.push(b);
  ALL_VENTS.find((v) => v.id === b).links.push(a);
}
