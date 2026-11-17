// Minimal dependency-free RFC 6455 WebSocket server (text frames only).
// Written by hand so the project runs with plain `node server/index.js` — no npm install needed.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 64 * 1024;

export class WSConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.open = true;
    this.buf = Buffer.alloc(0);
    this.frag = null; // { opcode, chunks }
    socket.setNoDelay(true);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }

  _closed() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
  }

  _onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_PAYLOAD) { this.close(1009); return; }
      if (!masked) { this.close(1002); return; } // clients must mask
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      this._frame(fin, opcode, payload);
      if (!this.open) return;
    }
  }

  _frame(fin, opcode, payload) {
    if (opcode === 0x8) { this.close(1000); return; }
    if (opcode === 0x9) { this._write(0xA, payload); return; }
    if (opcode === 0xA) return;
    if (opcode === 0x1 || opcode === 0x2) {
      if (fin) { this.emit('message', payload.toString('utf8')); return; }
      this.frag = { chunks: [payload] };
    } else if (opcode === 0x0 && this.frag) {
      this.frag.chunks.push(payload);
      if (fin) { const full = Buffer.concat(this.frag.chunks); this.frag = null; if (full.length <= MAX_PAYLOAD) this.emit('message', full.toString('utf8')); }
    }
  }

  _write(opcode, payload) {
    if (!this.open) return false;
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
    else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    header[0] = 0x80 | opcode;
    try { this.socket.write(Buffer.concat([header, payload])); return true; } catch { return false; }
  }

  /** Send a string. Returns false if dropped. `droppable` frames are skipped under back-pressure. */
  send(str, droppable = false) {
    if (!this.open) return false;
    if (droppable && this.socket.writableLength > 256 * 1024) return false;
    return this._write(0x1, Buffer.from(str, 'utf8'));
  }

  ping() { this._write(0x9, Buffer.alloc(0)); }

  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code, 0);
    this._write(0x8, p);
    this.open = false;
    try { this.socket.end(); } catch { /* ignore */ }
    setTimeout(() => { try { this.socket.destroy(); } catch { /* ignore */ } }, 500).unref();
    this.emit('close');
  }
}

/** Handle an http 'upgrade' event. Calls onConnection(conn, req) after the handshake. */
export function handleUpgrade(req, socket, onConnection) {
  const key = req.headers['sec-websocket-key'];
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  onConnection(new WSConnection(socket), req);
}
