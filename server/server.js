import { createServer as createHttpServer } from 'node:http';
import { createStaticHandler } from './static.js';
import { listLocales } from './locales.js';
import { SessionManager } from './sessions.js';
import { AttemptLimiter } from './ratelimit.js';
import { attachSignaling } from './signaling.js';
import config from './config.js';

export function createServer(options = {}) {
  const publicDir = options.publicDir ?? config.publicDir;
  const serveStatic = createStaticHandler(publicDir);

  const server = createHttpServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }

    if (req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ iceServers: options.iceServers ?? config.iceServers }));
    }

    if (req.url === '/api/locales') {
      return listLocales(publicDir).then((locales) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify({ locales }));
      });
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
  const limiter = new AttemptLimiter({
    max: options.codeAttempts ?? config.codeAttempts,
    windowMs: options.codeAttemptWindowMs ?? config.codeAttemptWindowMs,
  });
  const signaling = attachSignaling(server, {
    sessions,
    limiter,
    trustProxy: options.trustProxy ?? config.trustProxy,
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
