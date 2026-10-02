import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttemptLimiter } from '../server/ratelimit.js';

test('blocca dopo max fallimenti e indica quanto aspettare', () => {
  let t = 0;
  const limiter = new AttemptLimiter({ max: 3, windowMs: 60_000, now: () => t });
  for (t of [0, 1000, 2000]) {
    assert.equal(limiter.check('ip').allowed, true);
    limiter.fail('ip');
  }
  const gate = limiter.check('ip');
  assert.equal(gate.allowed, false);
  assert.equal(gate.retryAfterMs, 58_000);
});

test('si sblocca quando il fallimento più vecchio esce dalla finestra', () => {
  let t = 0;
  const limiter = new AttemptLimiter({ max: 3, windowMs: 60_000, now: () => t });
  for (t of [0, 1000, 2000]) limiter.fail('ip');
  t = 59_999;
  assert.equal(limiter.check('ip').allowed, false);
  t = 60_000;
  assert.equal(limiter.check('ip').allowed, true);
});

test('le chiavi sono indipendenti e sweep libera la memoria', () => {
  let t = 0;
  const limiter = new AttemptLimiter({ max: 3, windowMs: 1000, now: () => t });
  for (let i = 0; i < 3; i++) limiter.fail('a');
  assert.equal(limiter.check('a').allowed, false);
  assert.equal(limiter.check('b').allowed, true);
  t = 5000;
  limiter.sweep();
  assert.equal(limiter.size, 0);
});
