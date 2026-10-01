import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseControl,
  sanitizeFileName,
  validateMeta,
  maxReceiveBytes,
} from '../public/js/protocol.js';

test('sanitizeFileName', () => {
  assert.equal(sanitizeFileName('foto.jpg'), 'foto.jpg');
  assert.equal(sanitizeFileName('../../etc/passwd'), '_.._etc_passwd');
  assert.equal(sanitizeFileName('a\u0000b\nc.txt'), 'abc.txt');
  assert.equal(sanitizeFileName(''), 'file');
  assert.equal(sanitizeFileName(undefined), 'file');
  assert.equal(sanitizeFileName('...'), 'file');
  const long = sanitizeFileName('x'.repeat(300) + '.pdf');
  assert.equal(long.length, 180);
  assert.ok(long.endsWith('.pdf'));
});

test('validateMeta', () => {
  assert.deepEqual(validateMeta({ name: 'a.txt', size: 10 }, 100), { name: 'a.txt', size: 10 });
  assert.deepEqual(validateMeta({ name: 'a', size: 101 }, 100), { error: 'too_large' });
  for (const size of [-1, 1.5, '10', null, undefined]) {
    assert.deepEqual(validateMeta({ name: 'a', size }, 100), { error: 'bad_meta' });
  }
  assert.deepEqual(validateMeta(null, 100), { error: 'bad_meta' });
});

test('parseControl', () => {
  assert.deepEqual(parseControl('{"type":"end"}'), { type: 'end' });
  assert.equal(parseControl('non json'), null);
  assert.equal(parseControl('"x"'), null);
  assert.equal(parseControl('{"type":"hack"}'), null);
});

test('maxReceiveBytes: limite più basso su iOS', () => {
  const GiB = 1024 ** 3;
  assert.equal(maxReceiveBytes('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), GiB);
  assert.equal(maxReceiveBytes('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5), GiB);
  assert.equal(maxReceiveBytes('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0), 2 * GiB);
  assert.equal(maxReceiveBytes('Mozilla/5.0 (X11; Linux x86_64)'), 2 * GiB);
});
