import { buildZip } from './zip.js';
import { $, showScreen } from './ui.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The real preparation screen: a ring that fills up, with "zip" in the middle. */
export function screenUi() {
  const setProgress = (fraction) => {
    const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
    $('ring-fill').style.strokeDashoffset = String(100 - percent);
  };
  return {
    show(onCancel) {
      $('prepare-cancel').onclick = onCancel;
      setProgress(0);
      showScreen('prepare');
    },
    setProgress,
  };
}

/**
 * Zips `files`, showing the preparation screen only if it takes longer than `delayMs` (small
 * selections never flash it), and keeping it for at least `minShowMs` once shown.
 * Resolves to { file, shown } or, if the user cancelled, { cancelled: true, shown }.
 * Rejects if the zip cannot be built (the caller decides what to show).
 * `ui` is { show(onCancel), setProgress(fraction) }: see screenUi().
 */
export async function prepareZip(files, { ui, delayMs = 300, minShowMs = 350, build = buildZip, now = Date.now } = {}) {
  const controller = new AbortController();
  let fraction = 0;
  let shownAt = null;

  const timer = setTimeout(() => {
    shownAt = now();
    ui.show(() => controller.abort());
    ui.setProgress(fraction);
  }, delayMs);

  try {
    const file = await build(files, {
      signal: controller.signal,
      onProgress: (done, total) => {
        fraction = total > 0 ? done / total : 1;
        if (shownAt !== null) ui.setProgress(fraction);
      },
    });
    if (shownAt !== null) {
      const wait = minShowMs - (now() - shownAt);
      if (wait > 0) await sleep(wait);
    }
    if (controller.signal.aborted) return { cancelled: true, shown: shownAt !== null };
    return { file, shown: shownAt !== null };
  } catch (err) {
    if (err?.name === 'AbortError') return { cancelled: true, shown: shownAt !== null };
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
