import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSender } from '../public/js/sender.js';
import { createReceiver } from '../public/js/receiver.js';
import { parseControl } from '../public/js/protocol.js';

function makeFile(size, name = 'test.bin') {
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i++) bytes[i] = i % 251;
  const file = new Blob([bytes]);
  file.name = name;
  return { file, bytes };
}

/** Collega mittente e ricevente con un canale finto, senza rete. */
function run(file, maxBytes = 1e9) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const channel = Object.assign(new EventTarget(), {
      readyState: 'open',
      bufferedAmount: 0,
      bufferedAmountLowThreshold: 0,
    });
    let sender;
    const receiver = createReceiver({
      maxBytes,
      send: (msg) => sender.onControl(msg),
      onMeta: () => {},
      onComplete: (blob, meta) => finish({ ok: true, blob, meta }),
      onError: (code) => finish({ ok: false, code, side: 'receiver' }),
    });
    channel.send = (data) => {
      if (typeof data === 'string') receiver.onControl(parseControl(data));
      else receiver.onData(data);
    };
    sender = createSender(channel, file, {
      onDone: () => {},
      onError: (code, max) => finish({ ok: false, code, max, side: 'sender' }),
    });
    sender.start();
  });
}

test('sender → receiver: il file arriva identico (anche vuoto e a più blocchi)', async () => {
  for (const size of [0, 1, 65536, 200_001]) {
    const { file, bytes } = makeFile(size);
    const result = await run(file);
    assert.equal(result.ok, true, `size ${size}`);
    assert.equal(result.meta.name, 'test.bin');
    assert.equal(result.meta.size, size);
    assert.ok(Buffer.from(await result.blob.arrayBuffer()).equals(bytes), `contenuto diverso (${size})`);
  }
});

test('file troppo grande: il ricevente rifiuta e il mittente riceve il limite', async () => {
  const { file } = makeFile(100);
  const result = await run(file, 10);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'too_large');
  assert.equal(result.max, 10);
});

test('receiver: dimensione diversa da quella annunciata', () => {
  const sent = [];
  let error = null;
  const r = createReceiver({
    maxBytes: 100,
    send: (msg) => sent.push(msg),
    onMeta() {},
    onComplete() {
      assert.fail('non deve completare');
    },
    onError: (code) => {
      error = code;
    },
  });
  r.onControl({ type: 'meta', name: 'a', size: 10 });
  r.onData(new ArrayBuffer(5));
  r.onControl({ type: 'end' });
  assert.equal(error, 'size_mismatch');
  assert.equal(sent.at(-1).code, 'size_mismatch');
});
