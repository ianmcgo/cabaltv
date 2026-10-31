const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const roomName = s => clean(s, 40).toLowerCase().replace(/[^a-z0-9-]/g, '');
const HISTORY = 50;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const origin = req.headers.get('Origin') || '';
      const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (allowed.length && !allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });
      return env.HUB.get(env.HUB.idFromName('hub')).fetch(req);
    }
    return new Response('Cabal Coffers TV social hub', { headers: { 'content-type': 'text/plain' } });
  }
};

export class Hub {
  constructor(state) {
    this.state = state;
    this.countsTimer = null;
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ room: '', last: 0, win: 0, n: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  sockets() {
    return this.state.getWebSockets().filter(ws => ws.readyState === 1);
  }

  counts() {
    const m = {};
    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.room) m[a.room] = (m[a.room] || 0) + 1;
    }
    return m;
  }

  send(ws, o) {
    try { ws.send(JSON.stringify(o)); } catch (e) {}
  }

  toRoom(room, o) {
    const s = JSON.stringify(o);
    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.room === room) { try { ws.send(s); } catch (e) {} }
    }
  }

  queueCounts() {
    if (this.countsTimer) return;
    this.countsTimer = setTimeout(() => {
      this.countsTimer = null;
      const s = JSON.stringify({ t: 'counts', counts: this.counts() });
      for (const ws of this.sockets()) { try { ws.send(s); } catch (e) {} }
    }, 1000);
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const a = ws.deserializeAttachment() || {};

    if (m.t === 'join') {
      const room = roomName(m.room);
      if (!room) return;
      a.room = room;
      ws.serializeAttachment(a);
      const msgs = (await this.state.storage.get('h:' + room)) || [];
      this.send(ws, { t: 'history', room, msgs });
      this.send(ws, { t: 'counts', counts: this.counts() });
      this.queueCounts();
      return;
    }

    if (m.t === 'chat') {
      if (!a.room) return;
      const now = Date.now();
      if (now - a.win > 20000) { a.win = now; a.n = 0; }
      if (now - a.last < 1200 || a.n >= 8) {
        ws.serializeAttachment(a);
        this.send(ws, { t: 'err', msg: 'Slow down a little.' });
        return;
      }
      const text = clean(m.text, 200);
      if (!text) return;
      const name = clean(m.name, 20) || 'anon';
      a.last = now;
      a.n++;
      ws.serializeAttachment(a);
      const msg = { id: crypto.randomUUID().slice(0, 8), name, text, ts: now };
      const key = 'h:' + a.room;
      const h = (await this.state.storage.get(key)) || [];
      h.push(msg);
      while (h.length > HISTORY) h.shift();
      await this.state.storage.put(key, h);
      this.toRoom(a.room, { t: 'chat', room: a.room, msg });
      return;
    }

    if (m.t === 'ping') this.send(ws, { t: 'pong' });
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch (e) {}
    this.queueCounts();
  }

  async webSocketError() {
    this.queueCounts();
  }
}
