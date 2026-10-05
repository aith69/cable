import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepAwake } from '../public/js/wakelock.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeLock() {
  const lock = Object.assign(new EventTarget(), { released: false });
  lock.release = async () => {
    lock.released = true;
    lock.dispatchEvent(new Event('release'));
  };
  return lock;
}

function fakes({ visible = true, reject = false } = {}) {
  const locks = [];
  const nav = {
    wakeLock: {
      request: async () => {
        if (reject) throw new Error('NotAllowedError');
        const lock = fakeLock();
        locks.push(lock);
        return lock;
      },
    },
  };
  const doc = Object.assign(new EventTarget(), { visibilityState: visible ? 'visible' : 'hidden' });
  return { nav, doc, locks };
}

const changeVisibility = (doc, state) => {
  doc.visibilityState = state;
  doc.dispatchEvent(new Event('visibilitychange'));
};

test('wake lock: lo richiede all\'avvio, lo rilascia e non lo riprende più', async () => {
  const { nav, doc, locks } = fakes();
  const awake = keepAwake(nav, doc);
  await tick();
  assert.equal(locks.length, 1);
  assert.equal(locks[0].released, false);

  awake.release();
  await tick();
  assert.equal(locks[0].released, true);

  changeVisibility(doc, 'hidden');
  changeVisibility(doc, 'visible');
  await tick();
  assert.equal(locks.length, 1, 'dopo release() non deve richiederlo di nuovo');
});

test('wake lock: non lo richiede a pagina nascosta, lo richiede quando torna visibile', async () => {
  const { nav, doc, locks } = fakes({ visible: false });
  const awake = keepAwake(nav, doc);
  await tick();
  assert.equal(locks.length, 0);
  changeVisibility(doc, 'visible');
  await tick();
  assert.equal(locks.length, 1);
  awake.release();
});

test('wake lock: se il browser lo toglie (pagina nascosta) lo riprende al ritorno', async () => {
  const { nav, doc, locks } = fakes();
  const awake = keepAwake(nav, doc);
  await tick();
  await locks[0].release(); // il sistema lo rilascia
  changeVisibility(doc, 'hidden');
  await tick();
  assert.equal(locks.length, 1);
  changeVisibility(doc, 'visible');
  await tick();
  assert.equal(locks.length, 2);
  assert.equal(locks[1].released, false);
  awake.release();
});

test('wake lock: release() prima che la richiesta finisca non lascia il blocco attivo', async () => {
  const lock = fakeLock();
  let resolveRequest;
  const nav = { wakeLock: { request: () => new Promise((resolve) => (resolveRequest = () => resolve(lock))) } };
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const awake = keepAwake(nav, doc);
  awake.release();
  resolveRequest();
  await tick();
  assert.equal(lock.released, true);
});

test('wake lock: browser senza supporto o richiesta rifiutata non causano errori', async () => {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const none = keepAwake({}, doc);
  assert.equal(none.supported, false);
  none.release();

  const refused = fakes({ reject: true });
  const awake = keepAwake(refused.nav, refused.doc);
  await tick();
  assert.equal(awake.supported, true);
  assert.equal(refused.locks.length, 0);
  awake.release();
});
