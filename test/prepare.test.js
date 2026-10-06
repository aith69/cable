import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareZip } from '../public/js/prepare.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeUi() {
  const calls = { show: 0, progress: [], cancel: null };
  return {
    calls,
    show(onCancel) {
      calls.show += 1;
      calls.cancel = onCancel;
    },
    setProgress: (fraction) => calls.progress.push(fraction),
  };
}

test('preparazione veloce: la schermata non compare mai', async () => {
  const ui = fakeUi();
  const result = await prepareZip(['x'], { ui, delayMs: 50, build: async () => 'FILE' });
  assert.deepEqual(result, { file: 'FILE', shown: false });
  await sleep(100);
  assert.equal(ui.calls.show, 0, 'il timer deve essere stato cancellato');
});

test('preparazione lenta: compare una volta sola e segue l\'avanzamento', async () => {
  const ui = fakeUi();
  const build = (files, { onProgress }) =>
    new Promise((resolve) => {
      setTimeout(() => onProgress(50, 100), 30);
      setTimeout(() => {
        onProgress(100, 100);
        resolve('FILE');
      }, 60);
    });
  const result = await prepareZip(['x'], { ui, delayMs: 10, minShowMs: 0, build });
  assert.deepEqual(result, { file: 'FILE', shown: true });
  assert.equal(ui.calls.show, 1);
  assert.deepEqual(ui.calls.progress, [0, 0.5, 1]);
});

test('annullamento: ferma la preparazione e lo segnala', async () => {
  const ui = fakeUi();
  ui.show = (onCancel) => {
    ui.calls.show += 1;
    setTimeout(onCancel, 10);
  };
  const build = (files, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
    });
  const result = await prepareZip(['x'], { ui, delayMs: 10, build });
  assert.deepEqual(result, { cancelled: true, shown: true });
});

test('errore: viene rilanciato, e se arriva prima del ritardo la schermata non compare', async () => {
  const early = fakeUi();
  await assert.rejects(
    prepareZip(['x'], { ui: early, delayMs: 50, build: async () => { throw new Error('boom'); } }),
    /boom/,
  );
  await sleep(80);
  assert.equal(early.calls.show, 0);

  const late = fakeUi();
  await assert.rejects(
    prepareZip(['x'], {
      ui: late,
      delayMs: 10,
      build: () => new Promise((resolve, reject) => setTimeout(() => reject(new Error('boom')), 40)),
    }),
    /boom/,
  );
  assert.equal(late.calls.show, 1);
});

test('una volta comparsa, la schermata resta almeno minShowMs', async () => {
  const ui = fakeUi();
  const started = Date.now();
  await prepareZip(['x'], {
    ui,
    delayMs: 10,
    minShowMs: 120,
    build: () => new Promise((resolve) => setTimeout(() => resolve('FILE'), 30)),
  });
  assert.ok(Date.now() - started >= 125, `troppo breve: ${Date.now() - started} ms`);
});
