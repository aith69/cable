import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { renderPage, escapeHtml } from '../server/page.js';
import { createServer } from '../server/server.js';

const publicDir = join(fileURLToPath(import.meta.url), '..', '..', 'public');

async function listen(t, options) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('renderPage: sostituisce il nome ovunque e protegge dall\'HTML', () => {
  assert.equal(
    renderPage('<h1>{{name}}</h1><title>{{name}}</title>', { name: 'AirCable' }),
    '<h1>AirCable</h1><title>AirCable</title>',
  );
  assert.equal(escapeHtml('<b>"A" & \'B\'</b>'), '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;');
  assert.equal(renderPage('{{name}}', { name: '$&' }), '$&amp;');
});

test('GET /, /index.html e /?lang=it mostrano il nome configurato', async (t) => {
  const base = await listen(t, { name: 'AirCable' });
  for (const path of ['/', '/index.html', '/?lang=it']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /<title>AirCable<\/title>/);
    assert.match(html, /<h1>AirCable<\/h1>/);
    assert.doesNotMatch(html, /\{\{name\}\}/);
  }
});

test('il nome con caratteri speciali viene escapato', async (t) => {
  const base = await listen(t, { name: '<b>X&Y</b>' });
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<title>&lt;b&gt;X&amp;Y&lt;\/b&gt;<\/title>/);
  assert.doesNotMatch(html, /<b>X/);
});

test('HEAD senza corpo, POST non consentito', async (t) => {
  const base = await listen(t, { name: 'Cable' });
  const head = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) > 0);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
});

test('index.html usa il segnaposto: nessun nome scritto a mano nel titolo', async () => {
  const html = await readFile(join(publicDir, 'index.html'), 'utf8');
  assert.match(html, /<title>\{\{name\}\}<\/title>/);
  assert.match(html, /<h1>\{\{name\}\}<\/h1>/);
  assert.doesNotMatch(html, /app\.title/);
});
