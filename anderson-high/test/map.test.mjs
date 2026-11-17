import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOORS, STAIRS, SPAWNS } from '../shared/map.js';
import { TASKS, STATIONS } from '../shared/tasks.js';
import { collides, stairAt } from '../shared/physics.js';
import { COLS, ROWS, CELL, PLAYER_R } from '../shared/constants.js';

// BFS over cell centres (4-neighbour, circle clearance) — crossing a stair trigger switches floor.
function reach() {
  const seen = [new Set(), new Set(), new Set()];
  const q = [[0, Math.floor(SPAWNS[0].x / CELL), Math.floor(SPAWNS[0].y / CELL)]];
  seen[0].add(q[0][2] * COLS + q[0][1]);
  const ok = (f, c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !collides(FLOORS[f].grid, (c + .5) * CELL, (r + .5) * CELL);
  while (q.length) {
    const [f, c, r] = q.shift();
    const st = stairAt((c + .5) * CELL, (r + .5) * CELL);
    if (st && f < 2) { const nf = 1 - f; const k = r * COLS + c; if (!seen[nf].has(k) && ok(nf, c, r)) { seen[nf].add(k); q.push([nf, c, r]); } }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = nr * COLS + nc;
      if (ok(f, nc, nr) && !seen[f].has(k)) { seen[f].add(k); q.push([f, nc, nr]); }
    }
  }
  return seen;
}
const seen = reach();
const reachable = (f, x, y) => seen[f].has(Math.floor(y / CELL) * COLS + Math.floor(x / CELL));

test('exactly three staircases', () => assert.equal(STAIRS.length, 3));
test('spawns are free and in the cafeteria', () => {
  for (const s of SPAWNS) { assert.ok(!collides(FLOORS[0].grid, s.x, s.y), `spawn ${s.x},${s.y} blocked`); assert.ok(reachable(0, s.x, s.y)); }
});
test('every task station is standable and reachable', () => {
  for (const t of TASKS) {
    assert.ok(!collides(FLOORS[t.floor].grid, t.x, t.y), `${t.id} blocked`);
    assert.ok(reachable(t.floor, t.x, t.y), `${t.id} unreachable`);
  }
});
test('stations reachable', () => {
  for (const s of Object.values(STATIONS)) { assert.ok(!collides(FLOORS[s.floor].grid, s.x, s.y), `${s.id} blocked`); assert.ok(reachable(s.floor, s.x, s.y), `${s.id} unreachable`); }
});
test('vents standable + reachable', () => {
  for (const f of FLOORS.slice(0, 2)) for (const v of f.vents) { assert.ok(!collides(f.grid, v.x, v.y), `vent ${v.id} blocked`); assert.ok(reachable(f.id, v.x, v.y), `vent ${v.id} unreachable`); }
});
test('each stair is walkable on both floors and reachable from both', () => {
  for (const s of STAIRS) {
    const x = (s.trigger.x0 + s.trigger.x1) / 2, y = (s.trigger.y0 + s.trigger.y1) / 2;
    for (const f of [0, 1]) { assert.ok(!collides(FLOORS[f].grid, x, y), `stair ${s.id} blocked on floor ${f}`); assert.ok(reachable(f, x, y)); }
  }
});
test('all of floor 2 walkable area connected to floor 1', () => {
  let total = 0, got = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!collides(FLOORS[1].grid, (c + .5) * CELL, (r + .5) * CELL)) { total++; if (seen[1].has(r * COLS + c)) got++; }
  assert.equal(got, total, `floor2 cells reachable ${got}/${total}`);
});
test('floor 1 walkable area connected', () => {
  let total = 0, got = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!collides(FLOORS[0].grid, (c + .5) * CELL, (r + .5) * CELL)) { total++; if (seen[0].has(r * COLS + c)) got++; }
  assert.equal(got, total, `floor1 cells reachable ${got}/${total}`);
});
test('science hall has no second floor', () => {
  const sci = FLOORS[1].room; for (let i = 0; i < sci.length; i++) assert.notEqual(sci[i], 3);
});
