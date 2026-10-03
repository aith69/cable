import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../server/sessions.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixed = () => ({ correct: 'cat', options: ['pizza', 'cat', 'car'] });

function hosted(options = {}) {
  const sm = new SessionManager({ challenge: fixed, ...options });
  const owner = {};
  const { id } = sm.create(owner, 'send');
  const { code } = sm.issueCode(id, owner);
  return { sm, owner, id, code };
}

test('issueCode: formato, idempotenza e solo il proprietario', () => {
  const sm = new SessionManager();
  const owner = {};
  const { id } = sm.create(owner, 'send');
  const a = sm.issueCode(id, owner);
  assert.match(a.code, /^\d{6}$/);
  assert.equal(sm.issueCode(id, owner).code, a.code);
  assert.equal(sm.issueCode(id, {}).error, 'no_session');
  assert.equal(sm.issueCode('inesistente', owner).error, 'no_session');
  sm.join(id, {});
  assert.equal(sm.issueCode(id, owner).error, 'busy');
  sm.closeAll();
});

test('issueCode: il timer riparte da zero alla prima emissione', async () => {
  const sm = new SessionManager({ ttlMs: 300 });
  const owner = {};
  const { id } = sm.create(owner, 'send');
  await sleep(200);
  const first = sm.issueCode(id, owner);
  assert.ok(first.expiresInMs > 250);
  await sleep(200); // 400 ms in totale: la sessione originale sarebbe già scaduta
  assert.equal(sm.size, 1);
  const again = sm.issueCode(id, owner);
  assert.equal(again.code, first.code);
  assert.ok(again.expiresInMs < first.expiresInMs, 'il timer non deve ripartire una seconda volta');
  sm.closeAll();
});

test('joinByCode: sfida, busy e cancelPending', () => {
  const { sm, owner, id, code } = hosted();
  const g1 = {};
  const g2 = {};
  const wrong = code === '000000' ? '000001' : '000000';
  assert.equal(sm.joinByCode(wrong, g1).error, 'not_found');
  assert.equal(sm.joinByCode(code, owner).error, 'own_session');
  const res = sm.joinByCode(code, g1);
  assert.deepEqual(res.options, ['pizza', 'cat', 'car']);
  assert.equal(res.correct, 'cat');
  assert.equal(sm.joinByCode(code, g2).error, 'busy');
  assert.equal(sm.cancelPending(id, g2), null);
  assert.equal(sm.cancelPending(id, g1), res.session);
  assert.ok(sm.joinByCode(code, g2).session);
  sm.closeAll();
});

test('verify corretto aggancia il guest e invalida il codice', () => {
  const { sm, owner, id, code } = hosted();
  const g1 = {};
  const { session } = sm.joinByCode(code, g1);
  const ok = sm.verify(id, g1, 'cat');
  assert.equal(ok.session.guest, g1);
  assert.equal(session.pending, null);
  assert.equal(sm.joinByCode(code, {}).error, 'not_found');
  assert.equal(sm.peerOf(id, owner), g1);
  sm.closeAll();
});

test('verify sbagliato chiude la sessione', () => {
  const { sm, owner, id, code } = hosted();
  const g1 = {};
  sm.joinByCode(code, g1);
  assert.equal(sm.verify(id, {}, 'cat').error, 'no_pending');
  assert.equal(sm.size, 1);
  const bad = sm.verify(id, g1, 'pizza');
  assert.equal(bad.error, 'wrong');
  assert.equal(bad.session.owner, owner);
  assert.equal(sm.size, 0);
  assert.equal(sm.joinByCode(code, {}).error, 'not_found');
});

test('join tramite id con verifica in corso: busy', () => {
  const { sm, id, code } = hosted();
  sm.joinByCode(code, {});
  assert.equal(sm.join(id, {}).error, 'busy');
  sm.closeAll();
});

test('join tramite QR invalida il codice', () => {
  const { sm, id, code } = hosted();
  assert.ok(sm.join(id, {}).session);
  assert.equal(sm.joinByCode(code, {}).error, 'not_found');
  sm.closeAll();
});
