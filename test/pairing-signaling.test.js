import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers/ws.js';
import { categoryOf } from '../public/js/emoji.js';

const format = (code) => `${code.slice(0, 3)} - ${code.slice(3)}`;
/** Tre codici sbagliati, tutti diversi da quello vero. */
const wrongCodes = (code) => [1, 2, 3].map((k) => String((Number(code[0]) + k) % 10) + code.slice(1));

async function host(env, mode = 'send') {
  const owner = await env.client();
  owner.sendJson({ type: 'create', mode });
  const created = await owner.next();
  owner.sendJson({ type: 'request-code' });
  const { code } = await owner.next();
  return { owner, created, code };
}

/** Host con codice + guest che lo inserisce: restano pendenti la sfida e la richiesta di verifica. */
async function startVerification(env, mode = 'send') {
  const h = await host(env, mode);
  const guest = await env.client();
  guest.sendJson({ type: 'join-code', code: h.code });
  const challenge = await guest.next();
  const request = await h.owner.next();
  return { ...h, guest, challenge, request };
}

test('request-code: 6 cifre, stesso codice se richiesto di nuovo', async (t) => {
  const env = await setup(t);
  const owner = await env.client();
  owner.sendJson({ type: 'request-code' });
  assert.deepEqual(await owner.next(), { type: 'error', code: 'no_session' });
  owner.sendJson({ type: 'create', mode: 'send' });
  await owner.next();
  owner.sendJson({ type: 'request-code' });
  const first = await owner.next();
  assert.equal(first.type, 'code');
  assert.match(first.code, /^\d{6}$/);
  assert.ok(first.expiresInMs > 0 && first.expiresInMs <= 60000);
  owner.sendJson({ type: 'request-code' });
  assert.equal((await owner.next()).code, first.code);
});

test('flusso completo: codice formattato, verifica e signal inoltrato', async (t) => {
  const env = await setup(t);
  const h = await host(env, 'send');
  const guest = await env.client();
  guest.sendJson({ type: 'join-code', code: format(h.code) });
  const challenge = await guest.next();
  assert.equal(challenge.type, 'challenge');
  assert.equal(challenge.options.length, 3);
  assert.deepEqual(Object.keys(challenge).sort(), ['options', 'type'], 'la risposta giusta non deve arrivare al guest');
  const request = await h.owner.next();
  assert.equal(request.type, 'verify-request');
  assert.ok(challenge.options.includes(request.emoji));

  guest.sendJson({ type: 'verify', emoji: request.emoji });
  assert.deepEqual(await guest.next(), { type: 'joined', role: 'receive' });
  assert.deepEqual(await h.owner.next(), { type: 'peer-joined', role: 'send' });
  h.owner.sendJson({ type: 'signal', data: { sdp: 'x' } });
  assert.deepEqual(await guest.next(), { type: 'signal', data: { sdp: 'x' } });
});

test('le tre opzioni appartengono a categorie diverse', async (t) => {
  const env = await setup(t);
  const { challenge } = await startVerification(env);
  const categories = challenge.options.map(categoryOf);
  assert.ok(categories.every(Boolean));
  assert.equal(new Set(categories).size, 3);
});

test('emoji sbagliato: sessione chiusa e codice non più valido', async (t) => {
  const env = await setup(t);
  const v = await startVerification(env);
  const wrong = v.challenge.options.find((id) => id !== v.request.emoji);
  v.guest.sendJson({ type: 'verify', emoji: wrong });
  assert.deepEqual(await v.guest.next(), { type: 'error', code: 'verify_failed' });
  assert.deepEqual(await v.owner.next(), { type: 'verify-failed' });
  const other = await env.client();
  other.sendJson({ type: 'join-code', code: v.code });
  assert.deepEqual(await other.next(), { type: 'error', code: 'code_not_found' });
});

test('codici inesistenti: dopo 3 tentativi scatta il limite, anche per il codice giusto', async (t) => {
  const env = await setup(t);
  const h = await host(env);
  const guest = await env.client();
  for (const wrong of wrongCodes(h.code)) {
    guest.sendJson({ type: 'join-code', code: wrong });
    assert.deepEqual(await guest.next(), { type: 'error', code: 'code_not_found' });
  }
  guest.sendJson({ type: 'join-code', code: h.code });
  const blocked = await guest.next();
  assert.equal(blocked.type, 'error');
  assert.equal(blocked.code, 'rate_limited');
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60000);

  // Il limite è per indirizzo, non per connessione.
  const second = await env.client();
  second.sendJson({ type: 'join-code', code: h.code });
  assert.equal((await second.next()).code, 'rate_limited');
});

test('il QR resta valido dopo la generazione del codice, e poi il codice decade', async (t) => {
  const env = await setup(t);
  const h = await host(env, 'receive');
  const guest = await env.client();
  guest.sendJson({ type: 'join', id: h.created.id });
  assert.deepEqual(await guest.next(), { type: 'joined', role: 'send' });
  assert.deepEqual(await h.owner.next(), { type: 'peer-joined', role: 'receive' });
  const late = await env.client();
  late.sendJson({ type: 'join-code', code: h.code });
  assert.deepEqual(await late.next(), { type: 'error', code: 'code_not_found' });
});

test('verifica in corso: un secondo dispositivo riceve busy', async (t) => {
  const env = await setup(t);
  const v = await startVerification(env);
  const second = await env.client();
  second.sendJson({ type: 'join-code', code: v.code });
  assert.deepEqual(await second.next(), { type: 'error', code: 'busy' });
});

test('il dispositivo in verifica esce: l\'host è avvisato e il codice resta valido', async (t) => {
  const env = await setup(t);
  const v = await startVerification(env);
  v.guest.close();
  assert.deepEqual(await v.owner.next(), { type: 'verify-cancelled' });
  const next = await env.client();
  next.sendJson({ type: 'join-code', code: v.code });
  assert.equal((await next.next()).type, 'challenge');
});

test('l\'host esce durante la verifica: il guest riceve peer-left', async (t) => {
  const env = await setup(t);
  const v = await startVerification(env);
  v.owner.close();
  assert.deepEqual(await v.guest.next(), { type: 'peer-left' });
});

test('scadenza durante la verifica: expired a entrambi', async (t) => {
  const env = await setup(t, { sessionTtlMs: 400 });
  const v = await startVerification(env);
  assert.deepEqual(await v.owner.next(), { type: 'expired' });
  assert.deepEqual(await v.guest.next(), { type: 'expired' });
});

test('codice malformato: bad_message e non conta come tentativo', async (t) => {
  const env = await setup(t);
  const h = await host(env);
  const guest = await env.client();
  for (const bad of ['12345', 'abcdef', '', 123456, null]) {
    guest.sendJson({ type: 'join-code', code: bad });
    assert.deepEqual(await guest.next(), { type: 'error', code: 'bad_message' });
  }
  for (const wrong of wrongCodes(h.code)) {
    guest.sendJson({ type: 'join-code', code: wrong });
    assert.deepEqual(await guest.next(), { type: 'error', code: 'code_not_found' });
  }
});
