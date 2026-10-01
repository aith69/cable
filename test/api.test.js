import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/server.js';

test('GET /api/config restituisce gli iceServers', async (t) => {
  const iceServers = [{ urls: 'stun:example.org:3478' }];
  const server = createServer({ iceServers });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });

  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/config`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { iceServers });
});
