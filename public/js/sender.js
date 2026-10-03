import { CHUNK_SIZE, encodeControl } from './protocol.js';

const HIGH_WATER = 1024 * 1024;
const LOW_WATER = 256 * 1024;

/** Invia `file` sul DataChannel a blocchi, rispettando il buffer. */
export function createSender(channel, file, { onDone, onError }) {
  let offset = 0;
  let cancelled = false;
  channel.bufferedAmountLowThreshold = LOW_WATER;

  const waitDrain = () =>
    new Promise((resolve) => {
      const finish = () => {
        channel.removeEventListener('bufferedamountlow', finish);
        channel.removeEventListener('close', finish);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', finish);
      channel.addEventListener('close', finish);
    });

  async function start() {
    try {
      channel.send(encodeControl({ type: 'meta', name: file.name, size: file.size }));
      while (offset < file.size) {
        if (cancelled || channel.readyState !== 'open') return;
        if (channel.bufferedAmount > HIGH_WATER) {
          await waitDrain();
          continue;
        }
        const end = Math.min(offset + CHUNK_SIZE, file.size);
        const buffer = await file.slice(offset, end).arrayBuffer();
        if (cancelled || channel.readyState !== 'open') return;
        channel.send(buffer);
        offset = end;
      }
      if (!cancelled && channel.readyState === 'open') channel.send(encodeControl({ type: 'end' }));
    } catch {
      if (!cancelled) onError('read_error');
    }
  }

  return {
    start,
    /** Byte realmente partiti (esclusi quelli ancora nel buffer). */
    progress: () => Math.max(0, offset - channel.bufferedAmount),
    onControl(msg) {
      if (msg.type === 'complete') onDone();
      else if (msg.type === 'error') {
        cancelled = true;
        onError(msg.code, msg.max);
      }
    },
    cancel() {
      cancelled = true;
    },
  };
}
