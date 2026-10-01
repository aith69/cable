import { createServer as createHttpServer } from 'node:http';
import { createStaticHandler } from './static.js';
import config from './config.js';

export function createServer(options = {}) {
  const serveStatic = createStaticHandler(options.publicDir ?? config.publicDir);

  return createHttpServer((req, res) => {
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
}
