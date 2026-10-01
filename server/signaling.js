import { WebSocketServer } from 'ws';

const MODES = new Set(['send', 'receive']);
const opposite = (mode) => (mode === 'send' ? 'receive' : 'send');

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function fail(ws, code) {
  send(ws, { type: 'error', code });
}

export function attachSignaling(
  httpServer,
  { sessions, maxMessageBytes = 64 * 1024, path = '/ws', heartbeatMs = 30_000 },
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes });

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = null;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      /* url non valido */
    }
    if (pathname !== path) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  sessions.on('expired', (session) => {
    session.owner.sessionId = null;
    send(session.owner, { type: 'expired' });
  });

  function leave(ws) {
    if (!ws.sessionId) return;
    const other = sessions.leave(ws.sessionId, ws);
    ws.sessionId = null;
    if (other) {
      other.sessionId = null;
      send(other, { type: 'peer-left' });
    }
  }

  const handlers = {
    create(ws, msg) {
      if (ws.sessionId) return fail(ws, 'already_in_session');
      if (!MODES.has(msg.mode)) return fail(ws, 'bad_message');
      const session = sessions.create(ws, msg.mode);
      if (!session) return fail(ws, 'busy');
      ws.sessionId = session.id;
      send(ws, {
        type: 'created',
        id: session.id,
        mode: session.mode,
        expiresInMs: sessions.ttlMs,
      });
    },

    join(ws, msg) {
      if (ws.sessionId) return fail(ws, 'already_in_session');
      const { session, error } = sessions.join(msg.id, ws);
      if (error) return fail(ws, error);
      ws.sessionId = session.id;
      send(ws, { type: 'joined', role: opposite(session.mode) });
      send(session.owner, { type: 'peer-joined', role: session.mode });
    },

    signal(ws, msg) {
      if (!ws.sessionId) return fail(ws, 'no_session');
      if (msg.data === null || typeof msg.data !== 'object') return fail(ws, 'bad_message');
      const peer = sessions.peerOf(ws.sessionId, ws);
      if (!peer) return fail(ws, 'no_peer');
      send(peer, { type: 'signal', data: msg.data });
    },

    leave(ws) {
      leave(ws);
      send(ws, { type: 'left' });
    },
  };

  wss.on('connection', (ws) => {
    ws.sessionId = null;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return fail(ws, 'bad_message');
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return fail(ws, 'bad_message');
      }
      if (!msg || typeof msg.type !== 'string' || !Object.hasOwn(handlers, msg.type)) {
        return fail(ws, 'bad_message');
      }
      handlers[msg.type](ws, msg);
    });

    ws.on('close', () => leave(ws));
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  function shutdown() {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    sessions.closeAll();
  }

  return { wss, shutdown };
}
