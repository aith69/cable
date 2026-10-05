import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFiles, pickDroppedFile } from '../public/js/drop.js';

const fileItem = (isFile = true) => ({ kind: 'file', webkitGetAsEntry: () => ({ isFile }) });

test('hasFiles: solo i trascinamenti di file', () => {
  assert.equal(hasFiles({ types: ['Files'] }), true);
  assert.equal(hasFiles({ types: ['text/plain', 'Files'] }), true);
  assert.equal(hasFiles({ types: ['text/plain'] }), false);
  assert.equal(hasFiles({ types: { length: 1, 0: 'Files' } }), true, 'elenco simile a un array');
  assert.equal(hasFiles({}), false);
  assert.equal(hasFiles(undefined), false);
});

test('pickDroppedFile: un solo file', () => {
  const file = { name: 'a.txt' };
  assert.deepEqual(pickDroppedFile({ files: [file], items: [fileItem()] }), { file });
});

test('pickDroppedFile: nessun file, più file, cartella', () => {
  assert.deepEqual(pickDroppedFile({ files: [], items: [] }), { error: 'empty' });
  assert.deepEqual(pickDroppedFile(undefined), { error: 'empty' });
  assert.deepEqual(
    pickDroppedFile({ files: [{}, {}], items: [fileItem(), fileItem()] }),
    { error: 'multiple' },
  );
  assert.deepEqual(pickDroppedFile({ files: [{ name: 'cartella' }], items: [fileItem(false)] }), { error: 'folder' });
});

test('pickDroppedFile: browser senza webkitGetAsEntry, e testo trascinato insieme', () => {
  const file = { name: 'a.txt' };
  assert.deepEqual(pickDroppedFile({ files: [file], items: [{ kind: 'file' }] }), { file });
  assert.deepEqual(
    pickDroppedFile({ files: [file], items: [{ kind: 'string' }, fileItem()] }),
    { file },
  );
});
