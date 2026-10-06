import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  crc32,
  crc32Update,
  entryName,
  uniqueEntryNames,
  dosDateTime,
  defaultZipName,
  buildZip,
  MAX_ENTRIES,
} from '../public/js/zip.js';

const exec = promisify(execFile);

/** Reads a ZIP file written by buildZip (no comment, no Zip64) with a parser independent of zip.js. */
function parseZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50, 'record finale mancante');
  const count = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  assert.equal(centralOffset + centralSize, end);
  const entries = [];
  let p = centralOffset;
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(p), 0x02014b50);
    const nameLength = bytes.readUInt16LE(p + 28);
    const offset = bytes.readUInt32LE(p + 42);
    const size = bytes.readUInt32LE(p + 24);
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    const localNameLength = bytes.readUInt16LE(offset + 26);
    const dataStart = offset + 30 + localNameLength;
    entries.push({
      name: bytes.toString('utf8', p + 46, p + 46 + nameLength),
      localName: bytes.toString('utf8', offset + 30, dataStart),
      flags: bytes.readUInt16LE(p + 8),
      method: bytes.readUInt16LE(p + 10),
      crc: bytes.readUInt32LE(p + 16),
      compressedSize: bytes.readUInt32LE(p + 20),
      size,
      data: bytes.subarray(dataStart, dataStart + size),
    });
    p += 46 + nameLength;
  }
  assert.equal(p, end);
  return entries;
}

const pattern = (length, step = 7) => Buffer.from(Array.from({ length }, (_, i) => (i * step) % 256));
const fake = (size, extra = {}) => ({
  name: 'f.bin',
  size,
  lastModified: 0,
  slice() {
    throw new Error('non deve leggere');
  },
  ...extra,
});

function sampleFiles() {
  return [
    new File(['hello'], 'ciao.txt', { lastModified: Date.UTC(2026, 9, 5, 12, 0, 0) }),
    new File([pattern(70_000)], 'foto è ☃ 🎉.bin'),
    new File(['пример'], 'пример.txt'),
    new File(['日本語'], '日本語.txt'),
    new File([], 'vuoto.txt'),
    new File(['uno'], 'ciao.txt'),
  ];
}
const SAMPLE_NAMES = ['ciao.txt', 'foto è ☃ 🎉.bin', 'пример.txt', '日本語.txt', 'vuoto.txt', 'ciao (2).txt'];

test('crc32: vettori noti e calcolo a blocchi', () => {
  assert.equal(crc32(Buffer.alloc(0)), 0);
  assert.equal(crc32(Buffer.from('a')), 0xe8b7be43);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const data = pattern(10_000, 13);
  let crc = 0;
  for (let i = 0; i < data.length; i += 777) crc = crc32Update(crc, data.subarray(i, i + 777));
  assert.equal(crc, crc32(data));
});

test('entryName: percorsi sicuri, caratteri vietati, nomi lunghi', () => {
  assert.equal(entryName('../../etc/passwd'), 'etc/passwd');
  assert.equal(entryName('a/./b//c'), 'a/b/c');
  assert.equal(entryName('a:b*c?.txt'), 'a_b_c_.txt');
  assert.equal(entryName('x\\y.txt'), 'x_y.txt');
  assert.equal(entryName('con\u0000trol\n.txt'), 'control.txt');
  for (const bad of ['', '..', '/', null, undefined]) assert.equal(entryName(bad), 'file', String(bad));
  assert.equal(entryName('.gitignore'), '.gitignore');
  assert.equal(entryName('nome. '), 'nome');
  assert.equal(entryName('foto è ☃ 🎉.bin'), 'foto è ☃ 🎉.bin');
  const long = entryName('x'.repeat(300) + '.pdf');
  assert.equal(Array.from(long).length, 120);
  assert.ok(long.endsWith('.pdf'));
});

test('uniqueEntryNames: duplicati con numero, senza distinguere maiuscole', () => {
  assert.deepEqual(uniqueEntryNames(['a.txt', 'a.txt', 'A.TXT', 'b', 'b']), [
    'a.txt',
    'a (2).txt',
    'A (3).TXT',
    'b',
    'b (2)',
  ]);
  assert.deepEqual(uniqueEntryNames(['.env', '.env']), ['.env', '.env (2)']);
  assert.deepEqual(uniqueEntryNames(['d/a.txt', 'd/a.txt', 'a.txt']), ['d/a.txt', 'd/a (2).txt', 'a.txt']);
});

test('dosDateTime e nome predefinito', () => {
  const stamp = dosDateTime(new Date(2026, 9, 5, 12, 34, 56));
  assert.equal(stamp.time, (12 << 11) | (34 << 5) | 28);
  assert.equal(stamp.date, (46 << 9) | (10 << 5) | 5);
  assert.equal(dosDateTime(new Date(1970, 0, 1)).date >> 9, 0, 'prima del 1980 si ferma al 1980');
  assert.equal(defaultZipName(new Date(2026, 9, 5)), 'files-2026-10-05.zip');
});

test('buildZip: struttura corretta, nomi UTF-8, duplicati, checksum e contenuto', async () => {
  const files = sampleFiles();
  const zip = await buildZip(files, { chunkSize: 4096 });
  assert.match(zip.name, /^files-\d{4}-\d{2}-\d{2}\.zip$/);
  assert.equal(zip.type, 'application/zip');

  const bytes = Buffer.from(await zip.arrayBuffer());
  assert.equal(bytes.length, zip.size);
  const entries = parseZip(bytes);
  assert.deepEqual(entries.map((e) => e.name), SAMPLE_NAMES);
  for (const [i, entry] of entries.entries()) {
    const original = Buffer.from(await files[i].arrayBuffer());
    assert.equal(entry.localName, entry.name);
    assert.ok(entry.flags & 0x0800, `${entry.name}: manca il flag UTF-8`);
    assert.equal(entry.method, 0);
    assert.equal(entry.compressedSize, entry.size);
    assert.equal(entry.size, original.length);
    assert.equal(entry.crc, crc32(original), `${entry.name}: checksum`);
    assert.ok(entry.data.equals(original), `${entry.name}: contenuto`);
  }
});

test('buildZip: percorsi con cartelle e nome scelto', async () => {
  const zip = await buildZip(
    [{ file: new File(['x'], 'a.txt'), path: 'foto/2026/a.txt' }, { file: new File(['y'], 'b.txt'), path: '../b.txt' }],
    { name: 'mio.zip' },
  );
  assert.equal(zip.name, 'mio.zip');
  const entries = parseZip(Buffer.from(await zip.arrayBuffer()));
  assert.deepEqual(entries.map((e) => e.name), ['foto/2026/a.txt', 'b.txt']);
});

test('buildZip: avanzamento a blocchi, da 0 al totale', async () => {
  const calls = [];
  await buildZip([new File([pattern(5000)], 'a.bin')], {
    chunkSize: 1000,
    onProgress: (done, total) => calls.push([done, total]),
  });
  assert.deepEqual(calls, [[0, 5000], [1000, 5000], [2000, 5000], [3000, 5000], [4000, 5000], [5000, 5000]]);
});

test('buildZip: annullamento durante la lettura e prima di cominciare', async () => {
  const controller = new AbortController();
  await assert.rejects(
    buildZip([new File([pattern(10_000)], 'a.bin')], {
      chunkSize: 1000,
      signal: controller.signal,
      onProgress: (done) => {
        if (done >= 3000) controller.abort();
      },
    }),
    (err) => err.name === 'AbortError',
  );
  await assert.rejects(
    buildZip([new File(['x'], 'a.txt')], { signal: AbortSignal.abort() }),
    (err) => err.name === 'AbortError',
  );
});

test('buildZip: nessun file, troppi file, file cambiato durante la lettura', async () => {
  await assert.rejects(buildZip([]), { name: 'ZipError', code: 'empty' });

  const many = Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => new File([], `f${i}`));
  await assert.rejects(buildZip(many), { name: 'ZipError', code: 'too_many' });

  const changed = fake(10, { slice: () => ({ arrayBuffer: async () => new ArrayBuffer(3) }) });
  await assert.rejects(buildZip([changed]), { name: 'ZipError', code: 'changed' });
});

test('buildZip: rifiuta quello che non entra nel formato semplice, senza leggere nulla', async () => {
  await assert.rejects(buildZip([fake(2 ** 32)]), { code: 'too_large' });
  await assert.rejects(buildZip([fake(NaN)]), { code: 'too_large' });
  await assert.rejects(buildZip([fake(2 ** 31), fake(2 ** 31)]), { code: 'too_large' });
});

test('lo zip viene letto e verificato da python (e unzip, se c\'è)', async (t) => {
  const have = (cmd, args) => exec(cmd, args).then(() => true, () => false);
  if (!(await have('python3', ['--version']))) return t.skip('python3 non trovato');

  const dir = await mkdtemp(join(tmpdir(), 'cable-zip-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = [...sampleFiles(), new File([pattern(3 * 1024 * 1024 + 123, 11)], 'grande.bin')];
  const path = join(dir, 'test.zip');
  await writeFile(path, Buffer.from(await (await buildZip(files)).arrayBuffer()));

  const env = { PATH: process.env.PATH, PYTHONIOENCODING: 'utf-8' };
  const script =
    'import json, sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); ' +
    'print(json.dumps({"names": z.namelist(), "bad": z.testzip()}, ensure_ascii=False))';
  const { stdout } = await exec('python3', ['-c', script, path], { env });
  const result = JSON.parse(stdout);
  assert.deepEqual(result.names, [...SAMPLE_NAMES, 'grande.bin']);
  assert.equal(result.bad, null);

  await exec('python3', ['-m', 'zipfile', '-t', path], { env });
  if (await have('sh', ['-c', 'command -v unzip'])) await exec('unzip', ['-tq', path]);
});
