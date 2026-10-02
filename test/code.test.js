import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitsOf, formatCode } from '../public/js/code.js';

test('digitsOf: solo cifre, al massimo 6', () => {
  assert.equal(digitsOf('123 - 456'), '123456');
  assert.equal(digitsOf('12a3'), '123');
  assert.equal(digitsOf('1234567890'), '123456');
  assert.equal(digitsOf(null), '');
  assert.equal(digitsOf(undefined), '');
});

test('formatCode: separatore dopo la terza cifra', () => {
  assert.equal(formatCode(''), '');
  assert.equal(formatCode('12'), '12');
  assert.equal(formatCode('123'), '123');
  assert.equal(formatCode('1234'), '123 - 4');
  assert.equal(formatCode('123456'), '123 - 456');
  assert.equal(formatCode('123 - 456'), '123 - 456');
  assert.equal(formatCode('123 - '), '123');
});
