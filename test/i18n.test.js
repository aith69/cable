import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { candidates, loadTranslations, createTranslator } from '../public/js/i18n.js';
import { createServer } from '../server/server.js';

const localesDir = join(fileURLToPath(import.meta.url), '..', '..', 'public', 'locales');

function fakeFetch(files) {
  return async (url) => {
    const name = url.split('/').pop().replace('.json', '');
    if (!Object.hasOwn(files, name)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => files[name] };
  };
}

test('candidates: ordine di preferenza, tag base e fallback', () => {
  assert.deepEqual(candidates(['it-IT', 'en-US']), ['it-IT', 'it', 'en-US', 'en']);
  assert.deepEqual(candidates(['fr', 'de']), ['fr', 'de', 'en']);
  assert.deepEqual(candidates([]), ['en']);
  assert.deepEqual(candidates(['IT-it']), ['IT-it', 'it', 'en']);
});

test('candidates: scarta tag non validi', () => {
  assert.deepEqual(candidates(['../etc/passwd', 'it', 'a b', '', 42]), ['it', 'en']);
});

test('loadTranslations: usa la prima lingua preferita disponibile', async () => {
  const fetchFn = fakeFetch({ en: { a: 'hello' }, it: { a: 'ciao' } });
  const result = await loadTranslations({ languages: ['fr', 'it', 'de'], fetchFn });
  assert.equal(result.lang, 'it');
  assert.equal(result.messages.a, 'ciao');
});

test('loadTranslations: le chiavi mancanti ricadono su en', async () => {
  const fetchFn = fakeFetch({ en: { a: 'hello', b: 'bye' }, it: { a: 'ciao' } });
  const { messages } = await loadTranslations({ languages: ['it'], fetchFn });
  assert.equal(messages.a, 'ciao');
  assert.equal(messages.b, 'bye');
});

test('loadTranslations: nessuna lingua disponibile, si usa en', async () => {
  const fetchFn = fakeFetch({ en: { a: 'hello' } });
  const result = await loadTranslations({ languages: ['fr', 'de'], fetchFn });
  assert.equal(result.lang, 'en');
  assert.equal(result.messages.a, 'hello');
});

test('loadTranslations: errore se manca anche en', async () => {
  await assert.rejects(() => loadTranslations({ languages: ['it'], fetchFn: fakeFetch({}) }));
});

test('createTranslator: parametri e chiave mancante', () => {
  const t = createTranslator({ a: 'Scade tra {seconds} s' });
  assert.equal(t('a', { seconds: 30 }), 'Scade tra 30 s');
  assert.equal(t('a'), 'Scade tra {seconds} s');
  assert.equal(t('inesistente'), 'inesistente');
  assert.equal(t('constructor'), 'constructor');
});

test('tutti i file in locales hanno le stesse chiavi e gli stessi parametri di en', async () => {
  const load = async (file) => JSON.parse(await readFile(join(localesDir, file), 'utf8'));
  const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  const en = await load('en.json');
  const files = (await readdir(localesDir)).filter((f) => f.endsWith('.json'));
  assert.ok(files.includes('en.json'));

  for (const file of files) {
    const data = await load(file);
    assert.deepEqual(Object.keys(data).sort(), Object.keys(en).sort(), `${file}: chiavi diverse da en`);
    for (const [key, value] of Object.entries(data)) {
      assert.equal(typeof value, 'string', `${file}: ${key} non è una stringa`);
      assert.notEqual(value.trim(), '', `${file}: ${key} è vuota`);
      assert.equal(placeholders(value), placeholders(en[key]), `${file}: parametri diversi in ${key}`);
    }
  }
});

test('il server serve i file delle traduzioni', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(`${base}/locales/it.json`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal((await res.json())['home.send'], 'Invia un file');
  assert.equal((await fetch(`${base}/locales/xx.json`)).status, 404);
});
