import { EventEmitter } from 'node:events';
import { randomBytes, randomInt } from 'node:crypto';
import { makeChallenge } from '../public/js/emoji.js';

const CODE_DIGITS = 6;

/**
 * Sessioni di aggancio tra due peer. I peer sono oggetti opachi (i WebSocket).
 * Un peer può agganciarsi con l'id (QR) oppure con il codice a 6 cifre,
 * che richiede la verifica dell'emoji prima di diventare guest.
 * Emette 'expired' quando una sessione non viene agganciata in tempo.
 */
export class SessionManager extends EventEmitter {
  constructor({ ttlMs = 60_000, maxSessions = 1000, challenge = makeChallenge, clock = Date.now } = {}) {
    super();
    this.ttlMs = ttlMs;
    this.maxSessions = maxSessions;
    this.challenge = challenge;
    this.clock = clock;
    this.sessions = new Map();
    this.codes = new Map();
  }

  get size() {
    return this.sessions.size;
  }

  get(id) {
    return this.sessions.get(id);
  }

  #arm(session) {
    clearTimeout(session.timer);
    session.expiresAt = this.clock() + this.ttlMs;
    session.timer = setTimeout(() => {
      this.#remove(session);
      this.emit('expired', session);
    }, this.ttlMs);
    session.timer.unref();
  }

  #remove(session) {
    clearTimeout(session.timer);
    session.timer = null;
    this.sessions.delete(session.id);
    if (session.code) this.codes.delete(session.code);
  }

  /** Il guest è confermato: il timer si ferma e il codice non vale più. */
  #seal(session, guest) {
    clearTimeout(session.timer);
    session.timer = null;
    session.guest = guest;
    session.pending = null;
    if (session.code) {
      this.codes.delete(session.code);
      session.code = null;
    }
  }

  create(owner, mode) {
    if (this.sessions.size >= this.maxSessions) return null;
    const id = randomBytes(16).toString('base64url');
    const session = {
      id,
      mode,
      owner,
      guest: null,
      pending: null,
      code: null,
      timer: null,
      expiresAt: 0,
    };
    this.sessions.set(id, session);
    this.#arm(session);
    return session;
  }

  /** Aggancio tramite id (QR). */
  join(id, guest) {
    const session = typeof id === 'string' ? this.sessions.get(id) : undefined;
    if (!session) return { error: 'not_found' };
    if (session.guest) return { error: 'full' };
    if (session.pending) return { error: 'busy' };
    if (session.owner === guest) return { error: 'own_session' };
    this.#seal(session, guest);
    return { session };
  }

  /** Genera il codice a 6 cifre. Il timer riparte solo la prima volta. */
  issueCode(id, owner) {
    const session = this.sessions.get(id);
    if (!session || session.owner !== owner) return { error: 'no_session' };
    if (session.guest || session.pending) return { error: 'busy' };
    if (!session.code) {
      let code = null;
      for (let i = 0; i < 20 && !code; i++) {
        const candidate = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
        if (!this.codes.has(candidate)) code = candidate;
      }
      if (!code) return { error: 'busy' };
      session.code = code;
      this.codes.set(code, session.id);
      this.#arm(session);
    }
    return { code: session.code, expiresInMs: Math.max(0, session.expiresAt - this.clock()) };
  }

  /** Il guest ha inserito il codice: parte la verifica dell'emoji. */
  joinByCode(code, guest) {
    const id = typeof code === 'string' ? this.codes.get(code) : undefined;
    const session = id ? this.sessions.get(id) : undefined;
    if (!session) return { error: 'not_found' };
    if (session.pending) return { error: 'busy' };
    if (session.owner === guest) return { error: 'own_session' };
    const { correct, options } = this.challenge();
    session.pending = { guest, correct };
    return { session, correct, options };
  }

  /** Emoji corretto: il guest entra. Sbagliato: la sessione viene chiusa. */
  verify(id, guest, emoji) {
    const session = this.sessions.get(id);
    if (!session || !session.pending || session.pending.guest !== guest) {
      return { error: 'no_pending' };
    }
    if (typeof emoji === 'string' && emoji === session.pending.correct) {
      this.#seal(session, guest);
      return { session };
    }
    this.#remove(session);
    return { error: 'wrong', session };
  }

  /** Il guest in verifica se ne va: la sessione resta, il codice anche. */
  cancelPending(id, guest) {
    const session = this.sessions.get(id);
    if (!session || session.pending?.guest !== guest) return null;
    session.pending = null;
    return session;
  }

  peerOf(id, peer) {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.owner === peer) return session.guest;
    if (session.guest === peer) return session.owner;
    return null;
  }

  /** Chiude la sessione e restituisce l'altro peer (o null). */
  leave(id, peer) {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.owner !== peer && session.guest !== peer) return null;
    const other = session.owner === peer ? session.guest : session.owner;
    this.#remove(session);
    return other;
  }

  closeAll() {
    for (const session of this.sessions.values()) clearTimeout(session.timer);
    this.sessions.clear();
    this.codes.clear();
  }
}
