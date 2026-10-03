import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from '../server/server.js';

const publicDir = join(fileURLToPath(import.meta.url), '..', '..', 'public');

async function referencedUrls() {
  const html = await readFile(join(publicDir, 'index.html'), 'utf8');
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
}

test('index.html usa solo risorse locali (nessuna CDN)', async () => {
  const urls = await referencedUrls();
  assert.ok(urls.length > 0);
  for (const url of urls) assert.ok(url.startsWith('/'), `risorsa non locale: ${url}`);
});

test('tutte le risorse di index.html sono servite (build eseguita)', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const url of await referencedUrls()) {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, `${url} non trovato (hai lanciato npm run build?)`);
    await res.arrayBuffer();
  }
});
