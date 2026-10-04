import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const exec = promisify(execFile);
const root = join(fileURLToPath(import.meta.url), '..', '..');
const script = join(root, 'deploy', 'install.sh');
const tool = join(root, 'scripts', 'make-config.js');
const env = { PATH: process.env.PATH, NODE_ENV: 'test' };

async function result(command, args) {
  try {
    const { stdout, stderr } = await exec(command, args, { env, cwd: root });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}
const install = (...args) => result('bash', [script, ...args]);
const configTool = (...args) => result(process.execPath, [tool, ...args]);

test('install.sh: la sintassi è valida', async () => {
  assert.equal((await result('bash', ['-n', script])).code, 0);
});

test('install.sh --help elenca le opzioni', async () => {
  const r = await install('--help');
  assert.equal(r.code, 0);
  for (const option of ['--yes', '--set', '--service', '--dry-run', '--uninstall', '--with-dev']) {
    assert.ok(r.stdout.includes(option), option);
  }
});

test('install.sh: opzione sconosciuta', async () => {
  const r = await install('--boh');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /unknown option/);
});

test('install.sh: nome del servizio non valido', async () => {
  const r = await install('--dry-run', '--yes', '--service', 'Nome Sbagliato!');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /invalid service name/);
});

test('install.sh --dry-run: elenca le azioni e non cambia nulla', async () => {
  const r = await install(
    '--dry-run', '--yes', '--service', 'demo-test', '--user', 'demouser',
    '--set', 'name=Demo', '--set', 'port=4555', '--set', 'trustProxy=true',
  );
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\]/);
  assert.match(r.stdout, /"port": 4555/);
  assert.match(r.stdout, /"trustProxy": true/);
  assert.match(r.stdout, /demo-test\.service/);
  assert.match(r.stdout, /useradd/);
  await assert.rejects(access('/etc/systemd/system/demo-test.service'));
});

test('install.sh --print-unit: utente, cartella e node nell\'unit', async () => {
  const r = await install('--print-unit', '--service', 'demo-test', '--user', 'demouser');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^User=demouser$/m);
  assert.match(r.stdout, /^Group=demouser$/m);
  assert.ok(r.stdout.includes(`WorkingDirectory=${root}\n`));
  assert.match(r.stdout, /^ExecStart=\S*node server\/index\.js$/m);
  assert.match(r.stdout, /^Description=.*demo-test/m);
  assert.match(r.stdout, /^NoNewPrivileges=true$/m);
});

test('install.sh: impostazione non valida', async () => {
  const r = await install('--dry-run', '--yes', '--set', 'port=abc');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /port/);
});

test('install.sh --uninstall: servizio inesistente', async () => {
  const r = await install('--dry-run', '--uninstall', '--yes', '--service', 'servizio-che-non-esiste');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not found/);
});

test('make-config --get: valori predefiniti', async () => {
  assert.equal((await configTool('--get', 'port')).stdout.trim(), '3000');
  assert.equal(
    (await configTool('--get', 'iceServers')).stdout.trim(),
    '[{"urls":"stun:stun.l.google.com:19302"}]',
  );
});

test('make-config: genera il config.json solo con i valori indicati', async () => {
  const r = await configTool('name=Demo', 'port=4000', 'trustProxy=true', 'host=');
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { name: 'Demo', port: 4000, trustProxy: true });
});

test('make-config: valori e chiavi non validi', async () => {
  assert.equal((await configTool('port=abc')).code, 1);
  assert.equal((await configTool('colour=blu')).code, 1);
  assert.equal((await configTool('--get', 'nope')).code, 1);
});
