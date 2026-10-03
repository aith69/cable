import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIceServers, DEFAULT_ICE_SERVERS } from '../server/config.js';

test('parseIceServers: default se mancante o non valido', () => {
  assert.deepEqual(parseIceServers(undefined), DEFAULT_ICE_SERVERS);
  assert.deepEqual(parseIceServers(''), DEFAULT_ICE_SERVERS);
  assert.deepEqual(parseIceServers('non json'), DEFAULT_ICE_SERVERS);
  assert.deepEqual(parseIceServers('{"a":1}'), DEFAULT_ICE_SERVERS);
  assert.deepEqual(parseIceServers('[{"x":1}]'), DEFAULT_ICE_SERVERS);
});

test('parseIceServers: accetta una lista valida, anche vuota', () => {
  assert.deepEqual(parseIceServers('[]'), []);
  const turn = [{ urls: 'turn:turn.example.org', username: 'u', credential: 'p' }];
  assert.deepEqual(parseIceServers(JSON.stringify(turn)), turn);
});
