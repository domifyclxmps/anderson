// Pre-renders each floor of Anderson High as a "station-school": dark steel decks, glowing trim,
// chunky furniture and hazard-striped doors. Same shared map data the server collides against.
import { CELL, COLS, ROWS } from '/shared/constants.js';
import { FLOORS, STAIRS, ROOM } from '/shared/map.js';

const R = ROOM;
const VOID = '#060b16';

// Each room gets a deck colour pair plus a neon accent used for wall trim and light pools.
const ROOM_STYLE = {
  [R.ENGLISH]:   { a: '#5a7795', b: '#4f6b88', acc: '#8fc0ff' },
  [R.MATH]:      { a: '#5a7795', b: '#4f6b88', acc: '#8fc0ff' },
  [R.SPANISH]:   { a: '#646996', b: '#585d87', acc: '#c3a6ff' },
  [R.HISTORY]:   { a: '#646996', b: '#585d87', acc: '#c3a6ff' },
  [R.SCIENCE]:   { a: '#468296', b: '#3c758a', acc: '#6ff0e0' },
  [R.CAFETERIA]: { a: '#846589', b: '#75587a', acc: '#ffb072' },
  [R.GYM]:       { a: '#655686', b: '#5a4c78', acc: '#ffe27a' },
  [R.COURTYARD]: { a: '#3b7f56', b: '#33714c', acc: '#8cf59c' },
  [R.STAIR]:     { a: '#546889', b: '#4a5d7c', acc: '#a9dcff' },
  [R.LOBBY]:     { a: '#566c8c', b: '#4b617e', acc: '#6fe4f4' },
  [R.MAIN]:      { a: '#526282', b: '#485874', acc: '#6fe4f4' },
  [R.NORTH]:     { a: '#526282', b: '#485874', acc: '#a9dcff' },
  [R.WEST]:      { a: '#526282', b: '#485874', acc: '#a9dcff' },
  [R.EAST]:      { a: '#526282', b: '#485874', acc: '#a9dcff' },
  [R.UPPER]:     { a: '#546889', b: '#4a5d7c', acc: '#a9dcff' },
};
const HALL = ROOM_STYLE[R.MAIN];
const styleOf = (room) => ROOM_STYLE[room] || HALL;

function bbox(f, room) {
  let c0 = COLS, r0 = ROWS, c1 = -1, r1 = -1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (f.room[r * COLS + c] === room) { if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r; }
  return c1 < 0 ? null : { x: c0 * CELL, y: r0 * CELL, w: (c1 - c0 + 1) * CELL, h: (r1 - r0 + 1) * CELL };
}
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function outlineText(c, text, x, y, size, fill = '#eaf6ff', stroke = '#050b16') {
  c.font = `800 ${size}px "Baloo 2","Fredoka","Trebuchet MS",Verdana,sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.lineWidth = size * 0.3; c.strokeStyle = stroke; c.strokeText(text, x, y);
  c.fillStyle = fill; c.fillText(text, x, y);
}
const hazard = (c, x, y, w, h, step = 12) => {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = '#f2c230'; c.fillRect(x, y, w, h);
  c.fillStyle = '#1b2233';
  for (let i = -h; i < w + h; i += step * 2) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + step, y + h); c.lineTo(x + i + step + h, y); c.lineTo(x + i + h, y); c.closePath(); c.fill(); }
  c.restore();
};

// ---------------------------------------------------------------- furniture
function drawObject(c, o, f) {
  const x = o.c0 * CELL, y = o.r0 * CELL, w = (o.c1 - o.c0) * CELL, h = (o.r1 - o.r0) * CELL;
  const room = f.room[Math.min(ROWS - 1, o.r0) * COLS + Math.min(COLS - 1, o.c0)];
  const style = styleOf(room);
  const sh = (dy = 5) => { c.fillStyle = 'rgba(0,0,0,.38)'; rr(c, x + 3, y + dy, w, h, 6); c.fill(); };
  const metal = (rad = 6) => {
    c.fillStyle = '#111c2c'; rr(c, x, y, w, h, rad); c.fill();
    c.fillStyle = '#33465f'; rr(c, x + 2, y + 2, w - 4, h - 4, Math.max(2, rad - 2)); c.fill();
    c.fillStyle = 'rgba(255,255,255,.1)'; rr(c, x + 3, y + 3, w - 6, Math.max(2, h * 0.22), Math.max(2, rad - 3)); c.fill();
  };
  switch (o.kind) {
    case 'desk': {
      sh(); metal(5);
      c.fillStyle = '#8ea3bd'; rr(c, x + 4, y + 4, w - 8, h - 10, 4); c.fill();
      c.fillStyle = '#c3d3e6'; rr(c, x + 5, y + 5, w - 10, 3, 2); c.fill();
      c.fillStyle = '#101b2a'; rr(c, x + w * 0.18, y + h * 0.34, w * 0.3, h * 0.3, 2); c.fill();
      c.fillStyle = style.acc; c.fillRect(x + w * 0.22, y + h * 0.4, w * 0.22, 2);
      c.fillStyle = '#f2c230'; c.fillRect(x + w * 0.62, y + h * 0.38, w * 0.16, h * 0.14);
      break;
    }
    case 'ctable': {
      sh(); metal(5);
      c.fillStyle = '#7f8ea6'; rr(c, x + 3, y + 3, w - 6, h - 10, 4); c.fill();
      c.fillStyle = '#a9bcd2'; rr(c, x + 4, y + 4, w - 8, 3, 2); c.fill();
      c.fillStyle = '#e84545'; rr(c, x + w * 0.16, y + 8, 15, 10, 2); c.fill();
      c.fillStyle = '#ffd75e'; rr(c, x + w * 0.6, y + 8, 15, 10, 2); c.fill();
      break;
    }
    case 'lockers': {
      sh(4); const vert = o.vertical; const n = Math.max(2, Math.round((vert ? h : w) / 26));
      const cols = ['#e84545', '#3b82f6', '#2ea36b', '#f2c230', '#b45df0', '#4fd6e8'];
      for (let i = 0; i < n; i++) {
        const lx = vert ? x + 1 : x + 1 + (i * (w - 2)) / n, ly = vert ? y + 1 + (i * (h - 2)) / n : y + 1;
        const lw = vert ? w - 2 : (w - 2) / n - 2, lh = vert ? (h - 2) / n - 2 : h - 2;
        c.fillStyle = '#0c1524'; rr(c, lx, ly, lw, lh, 3); c.fill();
        c.fillStyle = cols[i % cols.length]; rr(c, lx + 1.5, ly + 1.5, lw - 3, lh - 3, 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(lx + 3, ly + 3, lw - 6, 2);
        c.fillStyle = 'rgba(0,0,0,.35)'; if (vert) c.fillRect(lx + lw - 7, ly + lh / 2, 2, 6); else c.fillRect(lx + lw / 2, ly + lh - 8, 6, 2);
      }
      c.strokeStyle = '#070e1a'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      break;
    }
    case 'cabinet': case 'shelf': {
      sh(4); metal(4);
      c.fillStyle = '#22344a'; rr(c, x + 3, y + 3, w - 6, h - 6, 3); c.fill();
      const vert = h > w; const n = Math.max(2, Math.round((vert ? h : w) / 18));
      c.fillStyle = '#4c6b8f';
      for (let i = 1; i < n; i++) vert ? c.fillRect(x + 4, y + (i * h) / n, w - 8, 2) : c.fillRect(x + (i * w) / n, y + 4, 2, h - 8);
      c.fillStyle = '#5be0d0'; c.fillRect(x + 5, y + 5, 5, 5);
      c.fillStyle = '#ffd75e'; c.fillRect(x + w - 11, y + h - 11, 5, 5);
      break;
    }
    case 'bench': {
      sh(4);
      if (room === R.SCIENCE) {
        metal(4);
        c.fillStyle = '#7d93ad'; rr(c, x + 3, y + 3, w - 6, h - 7, 3); c.fill();
        const cols = ['#5be0d0', '#7fb2ff', '#ffd75e', '#b998ff'];
        for (let i = 0; i < Math.min(4, Math.floor(Math.max(w, h) / 22)); i++) { c.fillStyle = cols[i % 4]; c.beginPath(); c.arc(w > h ? x + 12 + i * 20 : x + w / 2, w > h ? y + h / 2 : y + 12 + i * 20, 5, 0, 7); c.fill(); }
      } else {
        metal(4);
        c.fillStyle = '#6b4a2f'; rr(c, x + 2, y + 2, w - 4, h - 6, 3); c.fill();
        c.fillStyle = '#9a6c45'; rr(c, x + 3, y + 3, w - 6, 4, 2); c.fill();
      }
      break;
    }
    case 'planter': {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
      c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(cx + 2, cy + 4, r, r * 0.8, 0, 0, 7); c.fill();
      c.fillStyle = '#0d1726'; c.beginPath(); c.arc(cx, cy, r * 0.9, 0, 7); c.fill();
      c.fillStyle = '#38618a'; c.beginPath(); c.arc(cx, cy, r * 0.78, 0, 7); c.fill();
      c.fillStyle = '#2f9b5c'; for (let i = 0; i < 7; i++) { const a = i * 0.9; c.beginPath(); c.arc(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42, r * 0.4, 0, 7); c.fill(); }
      c.fillStyle = '#63d98a'; c.beginPath(); c.arc(cx - 2, cy - 2, r * 0.3, 0, 7); c.fill();
      break;
    }
    case 'hoop': {
      const cx = x + w / 2;
      c.fillStyle = '#0f1a2b'; rr(c, x + 2, y + h - 12, w - 4, 10, 3); c.fill();
      c.fillStyle = '#cfe0f2'; rr(c, cx - 22, y + h - 10, 44, 6, 2); c.fill();
      c.strokeStyle = '#ff8a3c'; c.lineWidth = 3.5; c.beginPath(); c.arc(cx, y + h - 19, 9, 0, 7); c.stroke();
      c.strokeStyle = '#dff0ff'; c.lineWidth = 1.2; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(cx + i * 5, y + h - 16); c.lineTo(cx + i * 2.5, y + h - 6); c.stroke(); }
      break;
    }
    case 'stage': {
      c.fillStyle = 'rgba(0,0,0,.4)'; rr(c, x + 4, y + 8, w - 8, h - 6, 8); c.fill();
      c.fillStyle = '#0f1a2b'; rr(c, x, y, w, h, 8); c.fill();
      c.fillStyle = '#2c3f60'; rr(c, x + 4, y + 4, w - 8, h - 14, 5); c.fill();
      c.fillStyle = '#1a2740'; rr(c, x + 8, y + 8, w - 16, h - 24, 4); c.fill();
      const cols = ['#5bd6e8', '#ffd75e', '#ff6b6b'];
      for (let i = 0; i < 9; i++) { c.fillStyle = cols[i % 3]; c.beginPath(); c.arc(x + 20 + i * ((w - 40) / 8), y + h - 9, 3.2, 0, 7); c.fill(); }
      break;
    }
    case 'kitchen': {
      c.fillStyle = '#0f1a2b'; rr(c, x, y, w, h, 5); c.fill();
      c.fillStyle = '#3a506d'; rr(c, x + 3, y + 3, w - 6, h * 0.5, 3); c.fill();
      c.fillStyle = '#16233a'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + 24 + i * 34, y + 14, 7, 0, 7); c.fill(); }
      c.fillStyle = '#5bd6e8'; for (let i = 0; i < 4; i++) c.fillRect(x + 19 + i * 34, y + 11, 10, 2);
      hazard(c, x + 6, y + h - 10, w - 12, 5, 7);
      break;
    }
    case 'bleacher': {
      c.fillStyle = '#0f1a2b'; c.fillRect(x, y, w, h);
      for (let i = 0; i < h; i += 8) { c.fillStyle = i % 16 ? '#3b4d69' : '#4a5f7d'; c.fillRect(x + 1, y + i, w - 2, 5); }
      break;
    }
    case 'panel': {
      c.fillStyle = '#0f1a2b'; rr(c, x - 2, y - 6, w + 4, h + 12, 4); c.fill();
      c.fillStyle = '#2f4560'; rr(c, x, y - 4, w, h + 8, 3); c.fill();
      c.fillStyle = '#5be0d0'; for (let i = 0; i < 4; i++) c.fillRect(x + 5 + i * 7, y, 4, 4);
      c.fillStyle = '#ff6b6b'; c.fillRect(x + 5, y + 7, 22, 2);
      break;
    }
    default: break;
  }
}

function drawTrunk(c, o) {
  const cx = (o.c0 + o.c1) / 2 * CELL, cy = (o.r0 + o.r1) / 2 * CELL;
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx + 3, cy + 10, 26, 18, 0, 0, 7); c.fill();
  c.fillStyle = '#0d1726'; rr(c, cx - 7, cy - 4, 14, 20, 4); c.fill();
  c.fillStyle = '#3f6b52'; rr(c, cx - 5, cy - 2, 10, 16, 3); c.fill();
}

// ---------------------------------------------------------------- one floor
export function buildArt(fi, k) {
  const f = FLOORS[fi], b = f.bounds, pad = CELL * 2;
  const x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
  const c = cv.getContext('2d');
  c.scale(k, k); c.translate(-x0, -y0);
  c.fillStyle = VOID; c.fillRect(x0, y0, w, h);

  // Starfield beyond the hull.
  let seed = 1337 * (fi + 3);
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 240; i++) {
    const sx = x0 + rnd() * w, sy = y0 + rnd() * h, a = 0.15 + rnd() * 0.5;
    c.fillStyle = `rgba(190,225,255,${a})`; c.fillRect(sx, sy, 2, 2);
  }

  const g = f.grid, at = (cc, rr_) => (cc < 0 || rr_ < 0 || cc >= COLS || rr_ >= ROWS ? 0 : g[rr_ * COLS + cc]);
  const rm = (cc, rr_) => f.room[rr_ * COLS + cc];
  const isOpen = (cc, rr_) => at(cc, rr_) === 0 && (rm(cc, rr_) === R.OVERLOOK || rm(cc, rr_) === R.GARDEN);
  const nearFloor = (cc, rr_) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (at(cc + dc, rr_ + dr) !== 0) return true; return false; };
  const roomAcc = (cc, rr_) => styleOf(rm(cc, rr_)).acc;

  // --- open regions you can look into but not walk
  for (const room of [R.OVERLOOK, R.GARDEN]) {
    const bb = bbox(f, room); if (!bb) continue;
    const over = room === R.OVERLOOK;
    c.fillStyle = over ? '#20402f' : '#1d4a2e'; c.fillRect(bb.x, bb.y, bb.w, bb.h);
    c.save(); c.beginPath(); c.rect(bb.x, bb.y, bb.w, bb.h); c.clip();
    if (over) {
      c.strokeStyle = 'rgba(160,190,205,.35)'; c.lineCap = 'round'; c.lineWidth = CELL * 1.5;
      const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
      c.beginPath(); c.moveTo(cx, bb.y); c.lineTo(cx, bb.y + bb.h); c.moveTo(bb.x, bb.y); c.lineTo(bb.x + bb.w, bb.y + bb.h); c.moveTo(bb.x + bb.w, bb.y); c.lineTo(bb.x, bb.y + bb.h); c.stroke();
      c.fillStyle = 'rgba(12,30,24,.6)';
      for (const [tx, ty] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.78], [0.8, 0.78]]) { c.beginPath(); c.arc(bb.x + bb.w * tx, bb.y + bb.h * ty, 34, 0, 7); c.fill(); }
    } else {
      c.fillStyle = '#2d7a4b'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(bb.x + bb.w * (0.15 + i * 0.23), bb.y + bb.h * 0.55, 30, 0, 7); c.fill(); }
      c.fillStyle = '#20362a'; for (let i = 0; i < 4; i++) c.fillRect(bb.x + bb.w * (0.15 + i * 0.23) - 4, bb.y + bb.h * 0.55 + 12, 8, 26);
    }
    c.restore();
    c.strokeStyle = 'rgba(8,16,28,.55)'; c.lineWidth = 6; c.strokeRect(bb.x + 3, bb.y + 3, bb.w - 6, bb.h - 6);
  }

  // --- deck tiles
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    if (!at(cc, r)) continue;
    const st = styleOf(rm(cc, r)), x = cc * CELL, y = r * CELL;
    c.fillStyle = (cc + r) & 1 ? st.a : st.b; c.fillRect(x, y, CELL + 0.5, CELL + 0.5);
    c.fillStyle = 'rgba(255,255,255,.055)'; c.fillRect(x + 1, y + 1, CELL - 2, 1.5);
    c.fillStyle = 'rgba(3,7,14,.28)'; c.fillRect(x, y + CELL - 1.5, CELL + 0.5, 1.5); c.fillRect(x + CELL - 1.5, y, 1.5, CELL);
  }

  // --- courtyard paths + pond
  const ct = bbox(f, R.COURTYARD);
  if (ct && fi === 0) {
    c.save(); c.beginPath(); c.rect(ct.x, ct.y, ct.w, ct.h); c.clip();
    c.strokeStyle = 'rgba(150,175,196,.5)'; c.lineCap = 'round'; c.lineWidth = CELL * 2.1;
    const cx = ct.x + ct.w / 2, cy = ct.y + ct.h / 2;
    c.beginPath(); c.moveTo(cx, ct.y); c.lineTo(cx, ct.y + ct.h); c.stroke();
    c.lineWidth = CELL * 1.5; c.beginPath(); c.moveTo(ct.x, ct.y); c.lineTo(ct.x + ct.w, ct.y + ct.h); c.moveTo(ct.x + ct.w, ct.y); c.lineTo(ct.x, ct.y + ct.h); c.stroke();
    c.fillStyle = '#3f5f78'; c.beginPath(); c.arc(cx, cy, CELL * 2.6, 0, 7); c.fill();
    c.fillStyle = '#2b8fa8'; c.beginPath(); c.arc(cx, cy, CELL * 1.8, 0, 7); c.fill();
    c.fillStyle = '#6fd8e8'; c.beginPath(); c.arc(cx - 7, cy - 7, CELL * 0.55, 0, 7); c.fill();
    c.restore();
  }
  // --- gym court
  const gm = bbox(f, R.GYM);
  if (gm && fi === 0) {
    c.save(); c.strokeStyle = 'rgba(240,220,150,.55)'; c.lineWidth = 3;
    const m = CELL * 1.2, X = gm.x + m, Y = gm.y + m, W = gm.w - m * 2, H = gm.h - m * 2;
    c.strokeRect(X, Y, W, H);
    c.beginPath(); c.moveTo(X, Y + H * 0.32); c.lineTo(X + W, Y + H * 0.32); c.stroke();
    c.beginPath(); c.arc(X + W / 2, Y + H * 0.32, W * 0.22, 0, Math.PI); c.stroke();
    const kw = W * 0.4; c.strokeRect(X + (W - kw) / 2, Y + H - H * 0.34, kw, H * 0.34);
    c.beginPath(); c.arc(X + W / 2, Y + H - H * 0.34, kw / 2, Math.PI, 0); c.stroke();
    c.restore();
  }

  // --- wall shadow cast onto the deck
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    if (!at(cc, r)) continue;
    const x = cc * CELL, y = r * CELL;
    if (at(cc, r - 1) === 0 && !isOpen(cc, r - 1)) { c.fillStyle = 'rgba(4,9,18,.35)'; c.fillRect(x, y, CELL, 11); }
    if (at(cc - 1, r) === 0 && !isOpen(cc - 1, r)) { c.fillStyle = 'rgba(4,9,18,.28)'; c.fillRect(x, y, 9, CELL); }
    if (at(cc + 1, r) === 0 && !isOpen(cc + 1, r)) { c.fillStyle = 'rgba(4,9,18,.2)'; c.fillRect(x + CELL - 7, y, 7, CELL); }
  }

  // --- hull walls: dark plate, bevelled steel, rivets and a glowing accent strip
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    if (at(cc, r) !== 0 || isOpen(cc, r) || !nearFloor(cc, r)) continue;
    const x = cc * CELL, y = r * CELL;
    let acc = null;
    for (const [dc, dr] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) if (at(cc + dc, r + dr) !== 0) { acc = roomAcc(cc + dc, r + dr); break; }
    c.fillStyle = '#070e1a'; c.fillRect(x, y, CELL + 0.6, CELL + 0.6);
    c.fillStyle = '#2b4160'; c.fillRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
    c.fillStyle = '#3a5679'; c.fillRect(x + 3, y + 3, CELL - 6, CELL - 8);
    c.fillStyle = 'rgba(255,255,255,.09)'; c.fillRect(x + 3, y + 3, CELL - 6, 2);
    c.fillStyle = '#101d2e'; c.fillRect(x + CELL - 5, y + 5, 2, 2); c.fillRect(x + 5, y + CELL - 5, 2, 2);
    if (acc) {
      c.fillStyle = acc; c.globalAlpha = 0.85;
      if (at(cc, r + 1) !== 0) c.fillRect(x + 3, y + CELL - 4, CELL - 6, 2.5);
      if (at(cc, r - 1) !== 0) c.fillRect(x + 3, y + 1, CELL - 6, 1.5);
      if (at(cc - 1, r) !== 0) c.fillRect(x + 1, y + 3, 1.5, CELL - 6);
      if (at(cc + 1, r) !== 0) c.fillRect(x + CELL - 2.5, y + 3, 1.5, CELL - 6);
      c.globalAlpha = 1;
    }
  }
  // railings around the open courtyard below
  c.strokeStyle = 'rgba(160,205,225,.65)'; c.lineWidth = 4;
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    if (!isOpen(cc, r)) continue;
    const x = cc * CELL, y = r * CELL;
    c.beginPath();
    if (at(cc, r - 1) !== 0) { c.moveTo(x, y + 2); c.lineTo(x + CELL, y + 2); }
    if (at(cc, r + 1) !== 0) { c.moveTo(x, y + CELL - 2); c.lineTo(x + CELL, y + CELL - 2); }
    if (at(cc - 1, r) !== 0) { c.moveTo(x + 2, y); c.lineTo(x + 2, y + CELL); }
    if (at(cc + 1, r) !== 0) { c.moveTo(x + CELL - 2, y); c.lineTo(x + CELL - 2, y + CELL); }
    c.stroke();
  }

  // --- doors: hazard airlock gates
  for (const d of f.doors) {
    const x = d.c0 * CELL, y = d.r0 * CELL, w = (d.c1 - d.c0) * CELL, h = (d.r1 - d.r0) * CELL;
    c.fillStyle = 'rgba(6,12,22,.55)'; c.fillRect(x, y, w, h);
    if (d.axis === 'h') hazard(c, x, y, 7, h, 6), hazard(c, x + w - 7, y, 7, h, 6);
    else hazard(c, x, y, w, 7, 6), hazard(c, x, y + h - 7, w, 7, 6);
  }

  // --- furniture
  for (const o of f.objects) { if (o.kind === 'tree') drawTrunk(c, o); else drawObject(c, o, f); }

  // --- ceiling light pools in rooms/halls
  for (const room of [R.SPANISH, R.ENGLISH, R.SCIENCE, R.CAFETERIA, R.GYM, R.MAIN, R.HISTORY, R.MATH, R.NORTH, R.UPPER]) {
    const bb = bbox(f, room); if (!bb || bb.w < CELL * 3) continue;
    const acc = styleOf(room).acc, n = Math.max(1, Math.round(bb.w / (CELL * 5)));
    c.save(); c.beginPath(); c.rect(bb.x, bb.y, bb.w, bb.h); c.clip();
    for (let i = 0; i < n; i++) {
      const lx = bb.x + (bb.w * (i + 0.5)) / n, ly = bb.y + bb.h * ((i % 2) ? 0.4 : 0.6);
      const grd = c.createRadialGradient(lx, ly, 4, lx, ly, CELL * 2.4);
      grd.addColorStop(0, acc + '38'); grd.addColorStop(1, acc + '00');
      c.fillStyle = grd; c.fillRect(lx - CELL * 2.4, ly - CELL * 2.4, CELL * 4.8, CELL * 4.8);
      c.fillStyle = acc; c.globalAlpha = 0.55; rr(c, lx - 7, ly - 3, 14, 6, 3); c.fill(); c.globalAlpha = 1;
    }
    c.restore();
  }

  // --- stairs
  if (fi < 2) for (const s of STAIRS) {
    const v = s.visual, w2 = v.x1 - v.x0, h2 = v.y1 - v.y0;
    c.fillStyle = 'rgba(4,10,20,.55)'; rr(c, v.x0 - 2, v.y0 - 2, w2 + 4, h2 + 4, 8); c.fill();
    c.fillStyle = '#16263c'; rr(c, v.x0, v.y0, w2, h2, 6); c.fill();
    const steps = Math.max(4, Math.round(h2 / 16));
    for (let i = 0; i < steps; i++) {
      const yy = v.y0 + 4 + (i * (h2 - 8)) / steps, sh = (h2 - 8) / steps;
      c.fillStyle = i % 2 ? '#3c5675' : '#486485'; c.fillRect(v.x0 + 6, yy + 1, w2 - 12, sh - 2);
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(v.x0 + 6, yy + 1, w2 - 12, 1.5);
      c.fillStyle = 'rgba(4,10,20,.5)'; c.fillRect(v.x0 + 6, yy + sh - 3, w2 - 12, 2);
    }
    c.strokeStyle = '#5bd6e8'; c.lineWidth = 3; c.strokeRect(v.x0 + 3, v.y0 + 3, w2 - 6, h2 - 6);
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    c.fillStyle = '#ffd75e'; c.strokeStyle = '#0a1220'; c.lineWidth = 3;
    c.beginPath();
    if (fi === 0) { c.moveTo(cx, cy - 16); c.lineTo(cx + 16, cy + 9); c.lineTo(cx - 16, cy + 9); }
    else { c.moveTo(cx, cy + 16); c.lineTo(cx + 16, cy - 9); c.lineTo(cx - 16, cy - 9); }
    c.closePath(); c.fill(); c.stroke();
    outlineText(c, `STAIRS ${s.id}`, cx, v.y1 + (s.id === 3 ? 20 : -16), 15, '#eaf6ff');
  }

  // --- room name plates
  for (const l of f.labels) {
    const size = 30 * (l.size || 1);
    c.font = `800 ${size}px "Baloo 2","Fredoka","Trebuchet MS",Verdana,sans-serif`;
    const tw = c.measureText(l.text).width;
    c.fillStyle = 'rgba(6,12,24,.58)'; rr(c, l.x - tw / 2 - 14, l.y - size * 0.72, tw + 28, size * 1.44, 10); c.fill();
    c.strokeStyle = 'rgba(150,205,235,.35)'; c.lineWidth = 2; rr(c, l.x - tw / 2 - 14, l.y - size * 0.72, tw + 28, size * 1.44, 10); c.stroke();
    outlineText(c, l.text, l.x, l.y, size);
  }
  return { cv, x0, y0, w, h, k };
}

const cache = new Map();
export function getArt(fi, quality = 'high') {
  const k = quality === 'low' ? 0.7 : quality === 'medium' ? 1 : 1.35;
  const key = fi + ':' + k;
  if (!cache.has(key)) { for (const kk of [...cache.keys()]) if (kk.startsWith(fi + ':')) cache.delete(kk); cache.set(key, buildArt(fi, k)); }
  return cache.get(key);
}
export function drawArt(ctx, art, vx0, vy0, vx1, vy1, alpha = 1) {
  const sx = Math.max(art.x0, vx0), sy = Math.max(art.y0, vy0);
  const ex = Math.min(art.x0 + art.w, vx1), ey = Math.min(art.y0 + art.h, vy1);
  if (ex <= sx || ey <= sy) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(art.cv, (sx - art.x0) * art.k, (sy - art.y0) * art.k, (ex - sx) * art.k, (ey - sy) * art.k, sx, sy, ex - sx, ey - sy);
  ctx.globalAlpha = 1;
}

/** Tree canopies are drawn above players (dynamic layer). */
export function drawCanopies(ctx, fi, t) {
  for (const o of FLOORS[fi].objects) {
    if (o.kind !== 'tree') continue;
    const cx = (o.c0 + o.c1) / 2 * CELL, cy = (o.r0 + o.r1) / 2 * CELL - 14, sw = Math.sin(t * 0.8 + cx) * 1.2;
    ctx.fillStyle = 'rgba(2,12,8,.45)'; ctx.beginPath(); ctx.arc(cx + 5, cy + 8, 40, 0, 7); ctx.fill();
    ctx.fillStyle = '#1f6b45'; ctx.beginPath(); ctx.arc(cx + sw, cy, 38, 0, 7); ctx.fill();
    ctx.fillStyle = '#2c8a58'; ctx.beginPath(); ctx.arc(cx - 10 + sw, cy - 8, 24, 0, 7); ctx.arc(cx + 14 + sw, cy - 2, 20, 0, 7); ctx.fill();
    ctx.fillStyle = '#4cc47d'; ctx.beginPath(); ctx.arc(cx - 14 + sw, cy - 14, 11, 0, 7); ctx.fill();
  }
}
