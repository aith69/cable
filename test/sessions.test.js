import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../server/sessions.js';

test('create genera id lunghi e diversi', () => {
  const sm = new SessionManager();
  const a = sm.create({}, 'send');
  const b = sm.create({}, 'send');
  assert.ok(a.id.length >= 22);
  assert.notEqual(a.id, b.id);
  sm.closeAll();
});

test('rispetta il limite massimo di sessioni', () => {
  const sm = new SessionManager({ maxSessions: 2 });
  assert.ok(sm.create({}, 'send'));
  assert.ok(sm.create({}, 'send'));
  assert.equal(sm.create({}, 'send'), null);
  sm.closeAll();
});

test('join, full e leave', () => {
  const sm = new SessionManager();
  const owner = {};
  const guest = {};
  const { id } = sm.create(owner, 'send');
  assert.equal(sm.join('inesistente', guest).error, 'not_found');
  assert.equal(sm.join(id, owner).error, 'own_session');
  assert.ok(sm.join(id, guest).session);
  assert.equal(sm.join(id, {}).error, 'full');
  assert.equal(sm.peerOf(id, owner), guest);
  assert.equal(sm.leave(id, guest), owner);
  assert.equal(sm.size, 0);
});

test('la sessione scade se nessuno si aggancia', async () => {
  const sm = new SessionManager({ ttlMs: 50 });
  const expired = new Promise((resolve) => sm.once('expired', resolve));
  const { id } = sm.create({}, 'send');
  const session = await expired;
  assert.equal(session.id, id);
  assert.equal(sm.size, 0);
});
