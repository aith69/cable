import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { EMOJI } from '../public/js/emoji.js';

const publicDir = join(fileURLToPath(import.meta.url), '..', '..', 'public');
const jsDir = join(publicDir, 'js');

const html = await readFile(join(publicDir, 'index.html'), 'utf8');
const en = JSON.parse(await readFile(join(publicDir, 'locales', 'en.json'), 'utf8'));
const sources = await Promise.all(
  (await readdir(jsDir))
    .filter((f) => f.endsWith('.js'))
    .map(async (f) => [f, await readFile(join(jsDir, f), 'utf8')]),
);

test('ogni $(id) e showScreen(nome) negli script esiste in index.html', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const screens = new Set([...html.matchAll(/data-screen="([^"]+)"/g)].map((m) => m[1]));
  for (const [file, source] of sources) {
    for (const m of source.matchAll(/\$\('([\w-]+)'\)/g)) {
      assert.ok(ids.has(m[1]), `${file}: l'elemento #${m[1]} non esiste in index.html`);
    }
    for (const m of source.matchAll(/showScreen\('([\w-]+)'\)/g)) {
      assert.ok(screens.has(m[1]), `${file}: la schermata "${m[1]}" non esiste in index.html`);
    }
  }
});

test('le chiavi data-i18n di index.html esistono in en.json', () => {
  for (const m of html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)) {
    assert.ok(Object.hasOwn(en, m[1]), `index.html: chiave mancante in en.json: ${m[1]}`);
  }
});

test('le chiavi di traduzione citate negli script esistono in en.json', () => {
  const prefixes = new Set(Object.keys(en).map((key) => key.split('.')[0]));
  for (const [file, source] of sources) {
    for (const m of source.matchAll(/'(\w+\.\w+)'/g)) {
      if (!prefixes.has(m[1].split('.')[0])) continue;
      assert.ok(Object.hasOwn(en, m[1]), `${file}: chiave mancante in en.json: ${m[1]}`);
    }
  }
});

test('ogni emoji del catalogo ha un nome tradotto', () => {
  for (const id of Object.keys(EMOJI)) {
    assert.ok(Object.hasOwn(en, `emoji.${id}`), `manca emoji.${id} in en.json`);
  }
});

test('ogni pulsante di index.html è usato da almeno uno script (nessun pulsante senza gestore)', () => {
  const buttonIds = [...html.matchAll(/<button\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(buttonIds.length >= 10, 'pochi pulsanti trovati: la regola di ricerca non funziona?');
  for (const id of buttonIds) {
    const used = sources.some(([, source]) => source.includes(`$('${id}')`));
    assert.ok(used, `il pulsante #${id} non è usato da nessuno script: manca il gestore?`);
  }
});
