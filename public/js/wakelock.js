/**
 * Keeps the screen on while a session is open (Screen Wake Lock API, where available).
 * The browser drops the lock whenever the page is hidden, so it is requested again when the page
 * becomes visible. A refusal (battery saver, unsupported browser) is silent: the transfer works anyway.
 * Returns { supported, release() }.
 */
export function keepAwake(nav = globalThis.navigator, doc = globalThis.document) {
  const supported = Boolean(nav?.wakeLock?.request);
  let sentinel = null;
  let pending = false;
  let released = false;

  async function acquire() {
    if (!supported || released || sentinel || pending || doc?.visibilityState === 'hidden') return;
    pending = true;
    try {
      const lock = await nav.wakeLock.request('screen');
      if (released) {
        lock.release().catch(() => {});
      } else {
        sentinel = lock;
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
        });
      }
    } catch {
      /* refused: nothing to do */
    } finally {
      pending = false;
    }
  }

  const onVisible = () => {
    if (doc.visibilityState === 'visible') acquire();
  };
  doc?.addEventListener?.('visibilitychange', onVisible);
  acquire();

  return {
    supported,
    release() {
      released = true;
      doc?.removeEventListener?.('visibilitychange', onVisible);
      const lock = sentinel;
      sentinel = null;
      lock?.release?.().catch(() => {});
    },
  };
}
