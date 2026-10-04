import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/server.js';

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
});

test('GET /health risponde ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET / serve index.html', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /<title[^>]*>vWire<\/title>/);
});

test('file inesistente: 404', async () => {
  const res = await fetch(`${base}/non-esiste.js`);
  assert.equal(res.status, 404);
});

test('path traversal bloccato', async () => {
  const res = await fetch(`${base}/..%2fpackage.json`);
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /"name"/);
});

test('byte nullo rifiutato', async () => {
  const res = await fetch(`${base}/index.html%00`);
  assert.equal(res.status, 400);
});

test('metodo POST non consentito', async () => {
  const res = await fetch(`${base}/`, { method: 'POST' });
  assert.equal(res.status, 405);
});
