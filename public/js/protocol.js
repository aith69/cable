export const CHUNK_SIZE = 64 * 1024;
export const MAX_NAME_LENGTH = 180;

const CONTROL_TYPES = new Set(['meta', 'end', 'complete', 'error', 'cancel']);

export const encodeControl = (obj) => JSON.stringify(obj);

/** Messaggio di controllo valido oppure null. */
export function parseControl(text) {
  try {
    const msg = JSON.parse(text);
    if (msg && typeof msg.type === 'string' && CONTROL_TYPES.has(msg.type)) return msg;
  } catch {
    /* json non valido */
  }
  return null;
}

/** Il nome arriva dall'altro dispositivo: va ripulito prima di usarlo per il download. */
export function sanitizeFileName(name) {
  let s = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/^\.+/, '');
  if (s.length > MAX_NAME_LENGTH) {
    const dot = s.lastIndexOf('.');
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : '';
    s = s.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
  }
  return s || 'file';
}

export function validateMeta(meta, maxBytes) {
  if (!meta || !Number.isSafeInteger(meta.size) || meta.size < 0) return { error: 'bad_meta' };
  if (meta.size > maxBytes) return { error: 'too_large' };
  return { name: sanitizeFileName(meta.name), size: meta.size };
}

/** Limite di memoria per la ricezione: più basso su iOS, dove il browser termina le pagine troppo pesanti. */
export function maxReceiveBytes(userAgent = '', maxTouchPoints = 0) {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios ? 1024 ** 3 : 2 * 1024 ** 3;
}
