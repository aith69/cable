import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

export function createStaticHandler(root) {
  const base = resolve(root);

  return async function serveStatic(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }

    let pathname;
    try {
      pathname = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    } catch {
      return send(res, 400, 'Bad request');
    }
    if (pathname.includes('\0')) return send(res, 400, 'Bad request');

    let file = resolve(base, '.' + pathname);
    if (file !== base && !file.startsWith(base + sep)) {
      return send(res, 404, 'Not found');
    }

    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        file = join(file, 'index.html');
        info = await stat(file);
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch {
      send(res, 404, 'Not found');
    }
  };
}
