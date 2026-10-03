import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pickLocale, directionOf, isLocaleTag, loadTranslations } from '../public/js/i18n.js';
import { listLocales } from '../server/locales.js';
import { createServer } from '../server/server.js';

const localesDir = join(fileURLToPath(import.meta.url), '..', '..', 'public', 'locales');

const AVAILABLE = [
  'ar', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'hu', 'id', 'it', 'ja',
  'ko', 'nb-NO', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'th', 'tr', 'uk', 'vi', 'zh-CN', 'zh-TW',
];
const pick = (languages, available = AVAILABLE) => pickLocale(languages, available);

async function listen(t, options) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('pickLocale: ordine di preferenza, maiuscole e fallback', () => {
  assert.equal(pick(['fr-CA', 'de']), 'fr');
  assert.equal(pick(['xx', 'de']), 'de');
  assert.equal(pick(['en-US', 'it']), 'en');
  assert.equal(pick(['IT-it']), 'it');
  assert.equal(pick([]), 'en');
  assert.equal(pick(['sw', 'xx']), 'en');
});

test('pickLocale: varianti regionali verso il file disponibile', () => {
  assert.equal(pick(['pt-PT']), 'pt-BR');
  assert.equal(pick(['pt']), 'pt-BR');
  assert.equal(pick(['nb-no']), 'nb-NO');
  assert.equal(pick(['nb']), 'nb-NO');
});

test('pickLocale: cinese semplificato e tradizionale', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hans-CN', 'zh-SG']) assert.equal(pick([tag]), 'zh-CN', tag);
  for (const tag of ['zh-TW', 'zh-Hant', 'zh-Hant-TW', 'zh-HK', 'zh-MO']) assert.equal(pick([tag]), 'zh-TW', tag);
  assert.equal(pick(['zh'], ['en', 'zh-TW']), 'zh-TW');
});

test('pickLocale: alias di codici vecchi e norvegese', () => {
  assert.equal(pick(['iw']), 'he');
  assert.equal(pick(['in-ID']), 'id');
  assert.equal(pick(['no']), 'nb-NO');
  assert.equal(pick(['nn-NO']), 'nb-NO');
});

test('pickLocale: tag non validi ignorati', () => {
  assert.equal(pick(['../etc/passwd', 'a b', '', 42, 'it']), 'it');
  assert.equal(isLocaleTag('pt-BR'), true);
  assert.equal(isLocaleTag('it (1)'), false);
  assert.equal(isLocaleTag('x'), false);
});

test('directionOf: lingue da destra a sinistra', () => {
  for (const lang of ['ar', 'AR', 'ar-EG', 'he', 'fa']) assert.equal(directionOf(lang), 'rtl', lang);
  for (const lang of ['it', 'en', 'zh-CN', 'pt-BR', 'ja']) assert.equal(directionOf(lang), 'ltr', lang);
});

test('loadTranslations: usa l\'elenco del server e non richiede file inesistenti', async () => {
  const files = { en: { a: 'hello', b: 'bye' }, 'pt-BR': { a: 'olá' } };
  const make = (requested) => async (url) => {
    requested.push(url);
    if (url === '/api/locales') return { ok: true, json: async () => ({ locales: ['en', 'pt-BR'] }) };
    const name = url.split('/').pop().replace('.json', '');
    return Object.hasOwn(files, name)
      ? { ok: true, json: async () => files[name] }
      : { ok: false, json: async () => ({}) };
  };

  const first = [];
  const result = await loadTranslations({ languages: ['pt-PT', 'en'], fetchFn: make(first) });
  assert.equal(result.lang, 'pt-BR');
  assert.equal(result.messages.a, 'olá');
  assert.equal(result.messages.b, 'bye');
  assert.deepEqual([...first].sort(), ['/api/locales', '/locales/en.json', '/locales/pt-BR.json']);

  const second = [];
  const fallback = await loadTranslations({ languages: ['fr'], fetchFn: make(second) });
  assert.equal(fallback.lang, 'en');
  assert.deepEqual([...second].sort(), ['/api/locales', '/locales/en.json']);
});

test('/api/locales: elenca solo i file json con un nome valido', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cable-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'locales'));
  for (const name of ['en.json', 'it.json', 'pt-BR.json', 'x.json', 'a b.json', 'notes.txt', 'it.json.bak']) {
    await writeFile(join(dir, 'locales', name), '{}');
  }

  const base = await listen(t, { publicDir: dir });
  const res = await fetch(`${base}/api/locales`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual((await res.json()).locales, ['en', 'it', 'pt-BR']);
  assert.deepEqual(await listLocales(join(dir, 'nessuna-cartella')), []);
});

test('public/locales: nomi dei file validi e tutti elencati dal server', async (t) => {
  const names = (await readdir(localesDir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  for (const name of names) {
    assert.ok(isLocaleTag(name), `nome non valido: ${name}.json (usa un tag come it, pt-BR, zh-TW)`);
  }
  const base = await listen(t);
  const { locales } = await (await fetch(`${base}/api/locales`)).json();
  assert.deepEqual(locales, [...names].sort());
  assert.ok(locales.includes('en'));
});
