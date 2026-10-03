import WebSocket from 'ws';
import { createServer } from '../server/server.js';

export function connectClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const waiter = waiters.shift();
      if (waiter) waiter(msg);
      else queue.push(msg);
    });
    ws.next = (timeout = 2000) =>
      new Promise((res, rej) => {
        if (queue.length) return res(queue.shift());
        const timer = setTimeout(() => rej(new Error('timeout in attesa di un messaggio')), timeout);
        waiters.push((msg) => {
          clearTimeout(timer);
          res(msg);
        });
      });
    ws.sendJson = (obj) => ws.send(JSON.stringify(obj));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

export async function setup(t, options = {}) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const clients = [];
  t.after(async () => {
    clients.forEach((c) => c.terminate());
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return {
    url,
    async client() {
      const c = await connectClient(url);
      clients.push(c);
      return c;
    },
  };
}
