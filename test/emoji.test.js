import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATEGORIES, EMOJI, categoryOf, makeChallenge } from '../public/js/emoji.js';

test('catalogo: una trentina di emoji, con id e caratteri unici', () => {
  const ids = Object.keys(EMOJI);
  const chars = Object.values(EMOJI);
  const declared = CATEGORIES.reduce((n, c) => n + Object.keys(CATALOG[c]).length, 0);
  assert.equal(ids.length, declared, 'id duplicato tra categorie');
  assert.ok(ids.length >= 30 && ids.length <= 40);
  assert.equal(new Set(chars).size, chars.length);
  assert.ok(CATEGORIES.length >= 6);
  for (const id of ids) assert.ok(categoryOf(id), id);
});

test('catalogo: niente bandiere, selettori di variante o sequenze ZWJ', () => {
  for (const [id, char] of Object.entries(EMOJI)) {
    assert.doesNotMatch(char, /\uFE0F|\u200D|[\u{1F1E6}-\u{1F1FF}]/u, `${id} non è portabile`);
  }
});

test('makeChallenge: tre categorie diverse e risposta tra le opzioni', () => {
  for (let i = 0; i < 500; i++) {
    const { correct, options } = makeChallenge();
    assert.equal(options.length, 3);
    assert.equal(new Set(options.map(categoryOf)).size, 3);
    assert.ok(options.includes(correct));
  }
});

test('makeChallenge: con lo stesso generatore dà lo stesso risultato', () => {
  assert.deepEqual(
    makeChallenge(() => 0),
    makeChallenge(() => 0),
  );
});
