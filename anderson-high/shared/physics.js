// Movement + collision, shared by the server (authoritative) and the client (prediction).
import { CELL, COLS, ROWS, PLAYER_R } from './constants.js';
import { FLOORS, STAIRS } from './map.js';

const solid = (grid, c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS || grid[r * COLS + c] !== 1;

export function collides(grid, x, y, R = PLAYER_R) {
  const c0 = Math.floor((x - R) / CELL), c1 = Math.floor((x + R) / CELL);
  const r0 = Math.floor((y - R) / CELL), r1 = Math.floor((y + R) / CELL);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!solid(grid, c, r)) continue;
    const nx = Math.max(c * CELL, Math.min(x, (c + 1) * CELL));
    const ny = Math.max(r * CELL, Math.min(y, (r + 1) * CELL));
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy < R * R) return true;
  }
  return false;
}

/** Move a circle by (dx,dy) sliding along walls. Ghosts (noclip) only stay inside the building bounds. */
export function stepMove(floorIdx, x, y, dx, dy, noclip = false) {
  const f = FLOORS[floorIdx];
  if (noclip) {
    const b = f.bounds;
    return [Math.max(b.x0 + PLAYER_R, Math.min(b.x1 - PLAYER_R, x + dx)), Math.max(b.y0 + PLAYER_R, Math.min(b.y1 - PLAYER_R, y + dy))];
  }
  const g = f.grid;
  let nx = x, ny = y;
  if (dx !== 0 && !collides(g, x + dx, y)) nx = x + dx;
  if (dy !== 0 && !collides(g, nx, y + dy)) ny = y + dy;
  return [nx, ny];
}

/** Line of sight: only true walls/void block it (furniture does not). */
export function lineClear(floorIdx, x0, y0, x1, y1) {
  const g = FLOORS[floorIdx].grid;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const c = Math.floor((x0 + (x1 - x0) * t) / CELL), r = Math.floor((y0 + (y1 - y0) * t) / CELL);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS || g[r * COLS + c] === 0) return false;
  }
  return true;
}

export function walkableAt(floorIdx, x, y) { return !collides(FLOORS[floorIdx].grid, x, y); }

export function inRect(rc, x, y, m = 0) { return x >= rc.x0 - m && x <= rc.x1 + m && y >= rc.y0 - m && y <= rc.y1 + m; }

/** Stair under the point (the trigger zone), or null. */
export function stairAt(x, y) {
  for (const s of STAIRS) if (inRect(s.trigger, x, y)) return s;
  return null;
}
/** Is the point still near a stair trigger (used to release the stair lock)? */
export function nearStair(x, y) {
  for (const s of STAIRS) if (inRect(s.trigger, x, y, s.margin)) return true;
  return false;
}
