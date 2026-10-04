import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { DEFAULTS, DEFAULT_ICE_SERVERS, resolveConfig, loadConfig } from '../server/config.js';

const root = join(fileURLToPath(import.meta.url), '..', '..');

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'cable-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('valori predefiniti senza file né variabili', () => {
  const { values, errors, warnings } = resolveConfig();
  assert.deepEqual(values, DEFAULTS);
  assert.deepEqual(values.iceServers, DEFAULT_ICE_SERVERS);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.notEqual(values.iceServers, DEFAULTS.iceServers, 'i valori non devono condividere i predefiniti');
});

test('il file sovrascrive i predefiniti e le variabili sovrascrivono il file', () => {
  const file = { name: 'AirCable', port: 8080, trustProxy: true };
  const fromFile = resolveConfig({ file });
  assert.equal(fromFile.values.name, 'AirCable');
  assert.equal(fromFile.values.port, 8080);
  assert.equal(fromFile.values.trustProxy, true);
  assert.equal(fromFile.values.host, DEFAULTS.host);

  const both = resolveConfig({ file, env: { PORT: '9000', TRUST_PROXY: 'false' } });
  assert.equal(both.values.port, 9000);
  assert.equal(both.values.trustProxy, false);
  assert.equal(both.values.name, 'AirCable');
});

test('variabili d\'ambiente: numeri, booleani e JSON; i valori vuoti sono ignorati', () => {
  const { values, errors } = resolveConfig({
    env: {
      APP_NAME: 'vwire',
      PORT: ' 8080 ',
      HOST: '127.0.0.1',
      TRUST_PROXY: 'YES',
      SESSION_TTL_MS: '120000',
      MAX_SESSIONS: '50',
      CODE_ATTEMPTS: '5',
      CODE_ATTEMPT_WINDOW_MS: '30000',
      ICE_SERVERS: '[]',
    },
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(values, {
    name: 'vwire',
    port: 8080,
    host: '127.0.0.1',
    trustProxy: true,
    sessionTtlMs: 120000,
    maxSessions: 50,
    codeAttempts: 5,
    codeAttemptWindowMs: 30000,
    iceServers: [],
  });

  const empty = resolveConfig({ file: { port: 8080 }, env: { PORT: '', HOST: '   ' } });
  assert.equal(empty.values.port, 8080);
  assert.equal(empty.values.host, DEFAULTS.host);
});

test('valori non validi: un errore chiaro per ogni chiave', () => {
  const bad = {
    name: ['', 'x'.repeat(31), 42, 'a\nb'],
    port: [0, 65536, '3000', 1.5],
    host: ['', 'due parole'],
    trustProxy: ['yes', 1],
    sessionTtlMs: [999, -5],
    maxSessions: [0],
    codeAttempts: [0],
    codeAttemptWindowMs: [10],
    iceServers: ['stun:x', [{ url: 'x' }], [{ urls: 5 }], {}],
  };
  for (const [key, list] of Object.entries(bad)) {
    for (const value of list) {
      const { errors } = resolveConfig({ file: { [key]: value } });
      assert.equal(errors.length, 1, `${key}=${JSON.stringify(value)}`);
      assert.match(errors[0], new RegExp(`"${key}"`));
    }
  }

  const env = resolveConfig({
    env: { PORT: 'abc', TRUST_PROXY: 'forse', ICE_SERVERS: 'non json', SESSION_TTL_MS: '-1' },
  });
  assert.equal(env.errors.length, 4);
  for (const name of ['PORT', 'TRUST_PROXY', 'ICE_SERVERS', 'SESSION_TTL_MS']) {
    assert.ok(env.errors.some((error) => error.startsWith(`${name}:`)), name);
  }
});

test('chiavi sconosciute: errore; chiavi che iniziano con _: ignorate', () => {
  const typo = resolveConfig({ file: { prot: 3000 } });
  assert.equal(typo.errors.length, 1);
  assert.match(typo.errors[0], /prot/);

  const notes = resolveConfig({ file: { _note: 'testo libero', _altro: 1 } });
  assert.deepEqual(notes.errors, []);
});

test('nome lungo: avviso, ma la configurazione resta valida', () => {
  const long = resolveConfig({ file: { name: 'NomeMoltoLungo' } });
  assert.deepEqual(long.errors, []);
  assert.equal(long.values.name, 'NomeMoltoLungo');
  assert.equal(long.warnings.length, 1);

  assert.equal(resolveConfig({ file: { name: 'Nove char' } }).warnings.length, 0);
  assert.equal(resolveConfig({ file: { name: '  vwire  ' } }).values.name, 'vwire');
});

test('loadConfig: legge il file; un file mancante non è un errore', async (t) => {
  const dir = await tempDir(t);
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ name: 'AirCable', port: 4000 }));

  const config = loadConfig({ env: {}, path, useFile: true });
  assert.equal(config.name, 'AirCable');
  assert.equal(config.port, 4000);
  assert.equal(config.host, DEFAULTS.host);
  assert.deepEqual(config.warnings, []);

  const missing = loadConfig({ env: {}, path: join(dir, 'nessuno.json'), useFile: true });
  assert.equal(missing.name, DEFAULTS.name);
  assert.equal(missing.port, DEFAULTS.port);
});

test('loadConfig: JSON non valido o valori errati fermano l\'avvio', async (t) => {
  const dir = await tempDir(t);
  const run = (name) => () => loadConfig({ env: {}, path: join(dir, name), useFile: true });

  await writeFile(join(dir, 'broken.json'), '{ "port": 3000, }');
  assert.throws(run('broken.json'), /JSON valido/);

  await writeFile(join(dir, 'list.json'), '[1, 2]');
  assert.throws(run('list.json'), /oggetto JSON/);

  await writeFile(join(dir, 'wrong.json'), JSON.stringify({ port: 'abc', colour: 'blu' }));
  assert.throws(run('wrong.json'), (err) => /"port"/.test(err.message) && /colour/.test(err.message));
});

test('loadConfig: CONFIG_FILE inesistente è un errore; useFile=false ignora il file', async (t) => {
  assert.throws(
    () => loadConfig({ env: { CONFIG_FILE: '/non/esiste/config.json' }, useFile: true }),
    /Impossibile leggere/,
  );

  const dir = await tempDir(t);
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ port: 'abc' }));
  assert.equal(loadConfig({ env: {}, path, useFile: false }).port, DEFAULTS.port);
});

test('config.example.json coincide con i valori predefiniti', async () => {
  const example = JSON.parse(await readFile(join(root, 'config.example.json'), 'utf8'));
  assert.deepEqual(example, DEFAULTS);
});
