import { createServer as createHttpServer } from 'node:http';
import { createStaticHandler } from './static.js';
import { SessionManager } from './sessions.js';
import { attachSignaling } from './signaling.js';
import config from './config.js';

export function createServer(options = {}) {
  const serveStatic = createStaticHandler(options.publicDir ?? config.publicDir);

  const server = createHttpServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }

    serveStatic(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  const sessions = new SessionManager({
    ttlMs: options.sessionTtlMs ?? config.sessionTtlMs,
    maxSessions: options.maxSessions ?? config.maxSessions,
  });
  const signaling = attachSignaling(server, {
    sessions,
    maxMessageBytes: config.maxMessageBytes,
  });

  // Le connessioni WebSocket tengono aperto il server: le chiudiamo prima.
  const close = server.close.bind(server);
  server.close = (callback) => {
    signaling.shutdown();
    return close(callback);
  };

  return server;
}
