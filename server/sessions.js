import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';

/**
 * Gestisce le sessioni di aggancio tra due peer.
 * I peer sono oggetti opachi (qui saranno i WebSocket).
 * Emette 'expired' quando una sessione non viene agganciata in tempo.
 */
export class SessionManager extends EventEmitter {
  constructor({ ttlMs = 60_000, maxSessions = 1000 } = {}) {
    super();
    this.ttlMs = ttlMs;
    this.maxSessions = maxSessions;
    this.sessions = new Map();
  }

  get size() {
    return this.sessions.size;
  }

  create(owner, mode) {
    if (this.sessions.size >= this.maxSessions) return null;
    const id = randomBytes(16).toString('base64url');
    const session = { id, mode, owner, guest: null, timer: null };
    session.timer = setTimeout(() => {
      this.sessions.delete(id);
      this.emit('expired', session);
    }, this.ttlMs);
    session.timer.unref();
    this.sessions.set(id, session);
    return session;
  }

  join(id, guest) {
    const session = typeof id === 'string' ? this.sessions.get(id) : undefined;
    if (!session) return { error: 'not_found' };
    if (session.guest) return { error: 'full' };
    if (session.owner === guest) return { error: 'own_session' };
    clearTimeout(session.timer);
    session.timer = null;
    session.guest = guest;
    return { session };
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
    clearTimeout(session.timer);
    this.sessions.delete(id);
    return other;
  }

  closeAll() {
    for (const session of this.sessions.values()) clearTimeout(session.timer);
    this.sessions.clear();
  }
}
