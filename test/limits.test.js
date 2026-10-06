import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIB,
  DEFAULT_MAX_TRANSFER_MB,
  totalSize,
  checkSize,
  receiveLimit,
  parseServerConfig,
} from '../public/js/limits.js';
import { DEFAULTS } from '../server/config.js';

const file = (mb) => ({ size: mb * MIB });

test('checkSize: tre file da 200 MB superano il limite di 500 MB, due no', () => {
  const over = checkSize([file(200), file(200), file(200)], 500 * MIB);
  assert.equal(over.ok, false);
  assert.equal(over.total, 600 * MIB);
  assert.equal(over.max, 500 * MIB);
  assert.equal(checkSize([file(200), file(200)], 500 * MIB).ok, true);
});

test('checkSize: il limite è inclusivo, un file vuoto passa, un byte in più no', () => {
  assert.equal(checkSize([file(500)], 500 * MIB).ok, true);
  assert.equal(checkSize([{ size: 500 * MIB + 1 }], 500 * MIB).ok, false);
  assert.equal(checkSize([{ size: 0 }], 500 * MIB).ok, true);
  assert.equal(checkSize([], 500 * MIB).ok, true);
});

test('totalSize: ignora le dimensioni non numeriche', () => {
  assert.equal(totalSize([{ size: 10 }, { size: undefined }, { size: 'abc' }, {}]), 10);
});

test('receiveLimit: vale il più basso, e senza configurazione vale quello del dispositivo', () => {
  assert.equal(receiveLimit(2048 * MIB, 512 * MIB), 512 * MIB);
  assert.equal(receiveLimit(1024 * MIB, 2048 * MIB), 1024 * MIB);
  assert.equal(receiveLimit(1024 * MIB, undefined), 1024 * MIB);
  assert.equal(receiveLimit(1024 * MIB, NaN), 1024 * MIB);
  assert.equal(receiveLimit(1024 * MIB, 0), 1024 * MIB);
});

test('parseServerConfig: valori validi, mancanti o strani', () => {
  const ice = [{ urls: 'stun:x' }];
  assert.deepEqual(parseServerConfig({ iceServers: ice, maxTransferMb: 100 }), {
    iceServers: ice,
    maxTransferBytes: 100 * MIB,
  });
  for (const bad of [null, undefined, {}, { maxTransferMb: 'abc' }, { maxTransferMb: -5 }, { maxTransferMb: 0 }]) {
    const result = parseServerConfig(bad);
    assert.equal(result.maxTransferBytes, DEFAULT_MAX_TRANSFER_MB * MIB, JSON.stringify(bad));
    assert.deepEqual(result.iceServers, []);
  }
});

test('il limite predefinito della pagina coincide con quello del server', () => {
  assert.equal(DEFAULT_MAX_TRANSFER_MB, DEFAULTS.maxTransferMb);
});
