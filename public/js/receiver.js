import { validateMeta } from './protocol.js';

/** Riceve i blocchi, verifica la dimensione e a fine file consegna un Blob. */
export function createReceiver({ maxBytes, send, onMeta, onComplete, onError }) {
  let meta = null;
  let received = 0;
  let finished = false;
  const chunks = [];

  const fail = (code) => {
    if (finished) return;
    finished = true;
    chunks.length = 0;
    send({ type: 'error', code, max: maxBytes });
    onError(code);
  };

  return {
    onControl(msg) {
      if (finished) return;
      if (msg.type === 'meta') {
        if (meta) return fail('bad_message');
        const checked = validateMeta(msg, maxBytes);
        if (checked.error) return fail(checked.error);
        meta = checked;
        onMeta(meta);
      } else if (msg.type === 'end') {
        if (!meta || received !== meta.size) return fail('size_mismatch');
        finished = true;
        const blob = new Blob(chunks, { type: 'application/octet-stream' });
        chunks.length = 0;
        send({ type: 'complete' });
        onComplete(blob, meta);
      }
    },
    onData(buffer) {
      if (finished) return;
      if (!meta) return fail('bad_message');
      received += buffer.byteLength;
      if (received > meta.size) return fail('size_mismatch');
      chunks.push(buffer);
    },
    progress: () => received,
    cancel() {
      finished = true;
      chunks.length = 0;
    },
  };
}
