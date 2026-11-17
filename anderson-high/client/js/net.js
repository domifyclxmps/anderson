// WebSocket client with automatic reconnection. Messages are JSON {t: type, ...}.
import { S, bus, toast } from './state.js';
import { session } from './settings.js';

let ws = null, retry = 0, queue = [], pingTimer = 0, closedByUs = false;
const url = () => window.AH_SERVER || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

export const net = {
  connect() {
    closedByUs = false;
    ws = new WebSocket(url());
    ws.onopen = () => {
      retry = 0; S.connected = true; bus.emit('conn', true);
      const s = session.get();
      if (s) ws.send(JSON.stringify({ t: 'reconnect', code: s.code, token: s.token }));
      for (const m of queue.splice(0)) ws.send(m);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => net.send({ t: 'ping', c: performance.now() }), 2000);
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') { S.ping = Math.round(performance.now() - m.c); return; }
      bus.emit('msg', m); bus.emit(m.t, m);
    };
    ws.onclose = () => {
      S.connected = false; clearInterval(pingTimer); bus.emit('conn', false);
      if (closedByUs) return;
      const wait = Math.min(5000, 400 * 2 ** retry++);
      setTimeout(() => net.connect(), wait);
    };
    ws.onerror = () => { /* onclose follows */ };
  },
  send(o) {
    const s = JSON.stringify(o);
    if (ws && ws.readyState === 1) ws.send(s);
    else if (o.t !== 'input' && o.t !== 'ping') queue.push(s);
  },
  get ready() { return ws && ws.readyState === 1; },
};
