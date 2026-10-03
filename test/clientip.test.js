import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, normalizeIp } from '../server/clientip.js';

const req = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });

test('senza proxy fidato X-Real-IP viene ignorato', () => {
  assert.equal(clientIp(req('10.0.0.5', { 'x-real-ip': '1.2.3.4' })), '10.0.0.5');
});

test('con proxy fidato usa X-Real-IP, altrimenti l\'indirizzo della connessione', () => {
  assert.equal(clientIp(req('10.0.0.5', { 'x-real-ip': '1.2.3.4' }), true), '1.2.3.4');
  assert.equal(clientIp(req('10.0.0.5'), true), '10.0.0.5');
});

test('IPv4 mappato e IPv6 raggruppato per /64', () => {
  assert.equal(normalizeIp('::ffff:192.168.1.7'), '192.168.1.7');
  assert.equal(
    normalizeIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'),
    normalizeIp('2001:db8:1:2::1'),
  );
  assert.notEqual(normalizeIp('2001:db8:1:2::1'), normalizeIp('2001:db8:1:3::1'));
});
