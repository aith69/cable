/** Conta i tentativi falliti per chiave in una finestra scorrevole. */
export class AttemptLimiter {
  constructor({ max = 3, windowMs = 60_000, now = Date.now } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.attempts = new Map();
  }

  get size() {
    return this.attempts.size;
  }

  #recent(key) {
    const limit = this.now() - this.windowMs;
    const list = (this.attempts.get(key) ?? []).filter((t) => t > limit);
    if (list.length) this.attempts.set(key, list);
    else this.attempts.delete(key);
    return list;
  }

  check(key) {
    const list = this.#recent(key);
    if (list.length < this.max) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: list[0] + this.windowMs - this.now() };
  }

  fail(key) {
    const list = this.#recent(key);
    list.push(this.now());
    this.attempts.set(key, list);
  }

  /** Elimina le chiavi scadute, per non far crescere la memoria. */
  sweep() {
    for (const key of [...this.attempts.keys()]) this.#recent(key);
  }
}
