// Anderson High — HTTP static server + WebSocket game server + matchmaking.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleUpgrade } from './websocket.js';
import { Room } from './room.js';
import { TICK_RATE, MAX_PLAYERS, DEFAULT_SETTINGS } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain',
};

// ------------------------------------------------------------------ rooms / matchmaking
export const rooms = new Map();

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
function createRoom(isPublic) { const r = new Room(newCode(), isPublic); rooms.set(r.code, r); return r; }
function findPublic() {
  let best = null;
  for (const r of rooms.values()) {
    if (r.phase !== 'lobby' || !r.settings.isPublic || r.full || r.humanCount === 0) continue;
    if (!best || r.activeCount > best.activeCount) best = r; // fill the fullest lobby first
  }
  return best;
}

// ------------------------------------------------------------------ http (static files)
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((a, r) => a + r.connectedCount, 0) }));
    return;
  }
  // Browsers still probe the legacy icon path; answer quietly instead of logging a 404.
  if (url.pathname === '/favicon.ico') { res.writeHead(204, { 'content-type': 'image/x-icon', 'cache-control': 'public, max-age=86400' }); res.end(); return; }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  let file;
  if (rel.startsWith('/shared/')) file = path.join(ROOT, rel);
  else file = path.join(ROOT, 'client', rel);
  const norm = path.normalize(file);
  if (!norm.startsWith(path.join(ROOT, 'client')) && !norm.startsWith(path.join(ROOT, 'shared'))) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(norm, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(norm)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ------------------------------------------------------------------ websocket sessions
server.on('upgrade', (req, socket) => {
  handleUpgrade(req, socket, (conn) => onConnection(conn));
});

function onConnection(conn) {
  const session = { room: null, player: null, msgCount: 0, windowStart: Date.now() };
  conn.alive = true;
  conn.on('message', (raw) => {
    const t = Date.now();
    if (t - session.windowStart > 1000) { session.windowStart = t; session.msgCount = 0; }
    if (++session.msgCount > 150) return; // flood guard
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    try { onMessage(conn, session, m); } catch (e) { console.error('handler error', m.t, e); }
  });
  conn.on('close', () => {
    if (session.room && session.player && session.player.conn === conn && !conn.replaced) {
      if (session.leaving) return;
      session.room.disconnect(session.player);
    }
  });
}

const reply = (conn, obj) => conn.send(JSON.stringify(obj));
const err = (conn, msg) => reply(conn, { t: 'err', msg });

function joinRoom(conn, session, room, info) {
  const p = room.addPlayer(conn, info);
  session.room = room; session.player = p;
  reply(conn, { t: 'joined', code: room.code, id: p.id, token: p.token });
  room.broadcastRoom();
}

function onMessage(conn, session, m) {
  if (!session.player) {
    switch (m.t) {
      case 'create': {
        const r = createRoom(!!m.public);
        if (m.max) r.settings.maxPlayers = Math.max(4, Math.min(MAX_PLAYERS, m.max | 0));
        return joinRoom(conn, session, r, m);
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return err(conn, 'No lobby with that code');
        if (r.phase !== 'lobby') return err(conn, 'That game has already started');
        if (r.full) return err(conn, 'That lobby is full');
        return joinRoom(conn, session, r, m);
      }
      case 'quick': {
        let r = findPublic();
        if (!r) r = createRoom(true);
        return joinRoom(conn, session, r, m);
      }
      case 'reconnect': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        const p = r && [...r.players.values()].find((q) => q.token === m.token && !q.left);
        if (!p) return reply(conn, { t: 'reconnectFailed' });
        r.attach(p, conn);
        session.room = r; session.player = p;
        reply(conn, { t: 'joined', code: r.code, id: p.id, token: p.token, reconnected: true });
        r.fullSync(p);
        r.broadcastRoom();
        return;
      }
      case 'ping': return reply(conn, { t: 'pong', c: m.c });
      default: return;
    }
  }
  if (m.t === 'leave') {
    const { room, player } = session;
    session.leaving = true;
    room.removePlayer(player, 'left');
    session.room = null; session.player = null; session.leaving = false;
    reply(conn, { t: 'left' });
    return;
  }
  session.room.handle(session.player, m);
}

// ------------------------------------------------------------------ main loop
const TICK_MS = 1000 / TICK_RATE;
let last = Date.now();
const loop = setInterval(() => {
  const t = Date.now(); last = t;
  for (const [code, r] of rooms) {
    r.tick();
    if (r.emptySince && t - r.emptySince > 30000) { rooms.delete(code); }
    else if (r.activeCount === 0 && t - r.createdAt > 2000) rooms.delete(code);
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`Anderson High server listening on http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) for (const n of list || []) {
    if (n.family === 'IPv4' && !n.internal) console.log(`  Same Wi-Fi / school network:  http://${n.address}:${PORT}`);
  }
});

export function stop() {
  clearInterval(loop);
  for (const r of rooms.values()) for (const p of r.players.values()) p.conn?.close(1001);
  server.close();
}
export { server, PORT };
