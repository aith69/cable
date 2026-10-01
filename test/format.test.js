import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatSpeed, formatEta, SpeedMeter } from '../public/js/format.js';

test('formatBytes e formatSpeed', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(150 * 1024 * 1024), '150 MB');
  assert.equal(formatBytes(-1), '—');
  assert.equal(formatSpeed(2048), '2.0 KB/s');
});

test('formatEta', () => {
  assert.equal(formatEta(0), '0:00');
  assert.equal(formatEta(5), '0:05');
  assert.equal(formatEta(75), '1:15');
  assert.equal(formatEta(3725), '1:02:05');
  assert.equal(formatEta(Infinity), '—');
});

test('SpeedMeter: velocità, ETA e finestra scorrevole', () => {
  const m = new SpeedMeter();
  assert.equal(m.speed, 0);
  assert.equal(m.eta(100), Infinity);
  m.add(0, 0);
  m.add(1000, 1000);
  assert.equal(m.speed, 1000);
  assert.equal(m.eta(5000), 5);

  const stalled = new SpeedMeter(1000);
  stalled.add(0, 0);
  stalled.add(1000, 1000);
  stalled.add(1000, 2000);
  stalled.add(1000, 3000);
  assert.equal(stalled.speed, 0);
});
