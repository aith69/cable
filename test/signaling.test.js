import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createServer } from '../server/server.js';

function connectClient(url) {
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

async function setup(t, options = {}) {
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

/** Crea una sessione e aggancia un secondo client. */
async function pair(env, mode = 'send') {
  const owner = await env.client();
  owner.sendJson({ type: 'create', mode });
  const created = await owner.next();
  const guest = await env.client();
  guest.sendJson({ type: 'join', id: created.id });
  return { owner, guest, created, joined: await guest.next(), peerJoined: await owner.next() };
}

test('create restituisce id e durata', async (t) => {
  const env = await setup(t);
  const owner = await env.client();
  owner.sendJson({ type: 'create', mode: 'send' });
  const msg = await owner.next();
  assert.equal(msg.type, 'created');
  assert.equal(msg.mode, 'send');
  assert.ok(msg.id.length >= 22);
  assert.equal(msg.expiresInMs, 60000);
});

test('join: i due peer ricevono i ruoli corretti', async (t) => {
  const env = await setup(t);
  const { joined, peerJoined } = await pair(env, 'send');
  assert.deepEqual(joined, { type: 'joined', role: 'receive' });
  assert.deepEqual(peerJoined, { type: 'peer-joined', role: 'send' });
});

test('ruoli invertiti se il creatore riceve', async (t) => {
  const env = await setup(t);
  const { joined, peerJoined } = await pair(env, 'receive');
  assert.equal(joined.role, 'send');
  assert.equal(peerJoined.role, 'receive');
});

test('signal inoltrato in entrambe le direzioni', async (t) => {
  const env = await setup(t);
  const { owner, guest } = await pair(env);
  owner.sendJson({ type: 'signal', data: { sdp: 'offerta' } });
  assert.deepEqual(await guest.next(), { type: 'signal', data: { sdp: 'offerta' } });
  guest.sendJson({ type: 'signal', data: { sdp: 'risposta' } });
  assert.deepEqual(await owner.next(), { type: 'signal', data: { sdp: 'risposta' } });
});

test('join con id inesistente: not_found', async (t) => {
  const env = await setup(t);
  const guest = await env.client();
  guest.sendJson({ type: 'join', id: 'non-esiste' });
  assert.deepEqual(await guest.next(), { type: 'error', code: 'not_found' });
});

test('un terzo dispositivo non può agganciarsi: full', async (t) => {
  const env = await setup(t);
  const { created } = await pair(env);
  const third = await env.client();
  third.sendJson({ type: 'join', id: created.id });
  assert.deepEqual(await third.next(), { type: 'error', code: 'full' });
});

test('quando un peer esce, l\'altro viene avvisato', async (t) => {
  const env = await setup(t);
  const { owner, guest, created } = await pair(env);
  guest.close();
  assert.deepEqual(await owner.next(), { type: 'peer-left' });
  const late = await env.client();
  late.sendJson({ type: 'join', id: created.id });
  assert.deepEqual(await late.next(), { type: 'error', code: 'not_found' });
});

test('leave esplicito avvisa l\'altro peer', async (t) => {
  const env = await setup(t);
  const { owner, guest } = await pair(env);
  guest.sendJson({ type: 'leave' });
  assert.deepEqual(await guest.next(), { type: 'left' });
  assert.deepEqual(await owner.next(), { type: 'peer-left' });
});

test('sessione non agganciata scade', async (t) => {
  const env = await setup(t, { sessionTtlMs: 150 });
  const owner = await env.client();
  owner.sendJson({ type: 'create', mode: 'send' });
  const created = await owner.next();
  assert.deepEqual(await owner.next(), { type: 'expired' });
  const guest = await env.client();
  guest.sendJson({ type: 'join', id: created.id });
  assert.deepEqual(await guest.next(), { type: 'error', code: 'not_found' });
});

test('sessione agganciata NON scade: nessun limite durante il trasferimento', async (t) => {
  const env = await setup(t, { sessionTtlMs: 150 });
  const { owner, guest } = await pair(env);
  await new Promise((resolve) => setTimeout(resolve, 400));
  owner.sendJson({ type: 'signal', data: { ok: true } });
  assert.deepEqual(await guest.next(), { type: 'signal', data: { ok: true } });
});

test('signal senza peer: no_peer', async (t) => {
  const env = await setup(t);
  const owner = await env.client();
  owner.sendJson({ type: 'create', mode: 'send' });
  await owner.next();
  owner.sendJson({ type: 'signal', data: {} });
  assert.deepEqual(await owner.next(), { type: 'error', code: 'no_peer' });
});

test('messaggi non validi: bad_message', async (t) => {
  const env = await setup(t);
  const c = await env.client();
  c.send('non è json');
  assert.deepEqual(await c.next(), { type: 'error', code: 'bad_message' });
  c.sendJson({ type: 'create', mode: 'sconosciuto' });
  assert.deepEqual(await c.next(), { type: 'error', code: 'bad_message' });
  c.sendJson({ type: 'constructor' });
  assert.deepEqual(await c.next(), { type: 'error', code: 'bad_message' });
});

test('percorso WebSocket diverso da /ws rifiutato', async (t) => {
  const env = await setup(t);
  const url = env.url.replace('/ws', '/altro');
  await assert.rejects(() => connectClient(url));
});
