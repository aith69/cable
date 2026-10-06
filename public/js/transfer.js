import { createPeer } from './rtc.js';
import { createSender } from './sender.js';
import { createReceiver } from './receiver.js';
import { encodeControl, parseControl, maxReceiveBytes } from './protocol.js';
import { SpeedMeter, formatBytes, formatSpeed, formatEta } from './format.js';
import { saveBlob } from './download.js';
import { receiveLimit } from './limits.js';
import { $, showScreen } from './ui.js';

const CONNECT_TIMEOUT_MS = 20_000;

/**
 * Gestisce WebRTC e trasferimento dopo che i due dispositivi si sono agganciati.
 * role: 'send' | 'receive'. onEnd(chiaveMessaggio | null, parametri, azioneSalva).
 */
export function runTransfer(ctx, { sig, initiator, role, file = null, onEnd }) {
  const { t } = ctx;
  const meter = new SpeedMeter();
  const el = {
    status: $('transfer-status'),
    file: $('transfer-file'),
    progress: $('transfer-progress'),
    fill: $('progress-fill'),
    speed: $('stat-speed'),
    eta: $('stat-eta'),
    bytes: $('stat-bytes'),
  };

  let ended = false;
  let opened = false;
  let started = false;
  let channel = null;
  let worker = null;
  let ticker = null;
  let totalBytes = 0;
  let selected = file;

  el.status.textContent = t('transfer.connecting');
  el.file.hidden = true;
  el.progress.hidden = true;
  el.fill.style.width = '0%';
  el.speed.textContent = '—';
  el.eta.textContent = '—';
  el.bytes.textContent = '';
  $('transfer-stop').onclick = () => end(null, {}, { notify: true });

  const connectTimer = setTimeout(() => {
    if (!opened) end('transfer.failed');
  }, CONNECT_TIMEOUT_MS);

  function sendControl(msg) {
    try {
      if (channel?.readyState === 'open') channel.send(encodeControl(msg));
    } catch {
      /* canale in chiusura */
    }
  }

  function end(key, params = {}, { notify = false, linger = 0, action = null } = {}) {
    if (ended) return;
    ended = true;
    clearTimeout(connectTimer);
    clearInterval(ticker);
    worker?.cancel?.();
    if (notify) sendControl({ type: 'cancel' });
    const delay = linger || (notify ? 300 : 0);
    if (delay) setTimeout(() => peer.close(), delay);
    else peer.close();
    onEnd(key, params, action);
  }

  function fail(code, max) {
    if (code === 'too_large') return end('transfer.tooLarge', { max: formatBytes(max) });
    end('error.generic', {}, { notify: code === 'read_error' });
  }

  function update() {
    if (!worker) return;
    const done = Math.min(worker.progress(), totalBytes);
    meter.add(done);
    el.fill.style.width = `${totalBytes ? (done / totalBytes) * 100 : 100}%`;
    el.speed.textContent = formatSpeed(meter.speed);
    el.eta.textContent = formatEta(meter.eta(totalBytes - done));
    el.bytes.textContent = t('transfer.sizeOf', {
      done: formatBytes(done),
      total: formatBytes(totalBytes),
    });
  }

  function showProgress(name, total) {
    totalBytes = total;
    el.status.textContent = t(role === 'send' ? 'transfer.sending' : 'transfer.receiving');
    el.file.textContent = t('file.selected', { name });
    el.file.hidden = false;
    el.progress.hidden = false;
    ticker = setInterval(update, 250);
    update();
  }

  function maybeStart() {
    if (ended || started || role !== 'send' || !opened || !selected) return;
    started = true;
    worker = createSender(channel, selected, {
      onDone: () => end('transfer.done'),
      onError: fail,
    });
    showProgress(selected.name, selected.size);
    worker.start();
  }

  function onOpen() {
    if (opened || ended) return;
    opened = true;
    clearTimeout(connectTimer);
    if (role === 'receive') {
      const limit = receiveLimit(
        maxReceiveBytes(navigator.userAgent, navigator.maxTouchPoints),
        ctx.maxTransferBytes,
      );
      worker = createReceiver({
        maxBytes: limit,
        send: sendControl,
        onMeta: (meta) => showProgress(meta.name, meta.size),
        onComplete: (blob, meta) => {
          saveBlob(blob, meta.name);
          end('transfer.done', {}, { linger: 1500, action: () => saveBlob(blob, meta.name) });
        },
        onError: (code) => fail(code, limit),
      });
      el.status.textContent = t('transfer.waiting');
    } else {
      maybeStart();
    }
  }

  function onMessage(event) {
    if (ended) return;
    const data = event.data;
    if (typeof data === 'string') {
      const msg = parseControl(data);
      if (!msg) return;
      if (msg.type === 'cancel') return end('transfer.cancelledByPeer');
      worker?.onControl(msg);
    } else if (data instanceof ArrayBuffer) {
      worker?.onData?.(data);
    }
  }

  function setupChannel(ch) {
    channel = ch;
    ch.onopen = onOpen;
    ch.onclose = () => end('transfer.interrupted');
    ch.onmessage = onMessage;
    if (ch.readyState === 'open') onOpen();
  }

  const peer = createPeer({
    sig,
    initiator,
    iceServers: ctx.iceServers,
    onChannel: setupChannel,
    onState: (state) => {
      if (state === 'failed') end('transfer.failed');
    },
  });
  peer.start().catch(() => end('transfer.failed'));

  return {
    show: () => showScreen('transfer'),
    signal: (data) => peer.handleSignal(data),
    /** Il guest che invia sceglie il file dopo l'aggancio. */
    setFile(f) {
      selected = f;
      maybeStart();
    },
    /** Il signaling segnala che l'altro è uscito: conta solo prima che il canale sia aperto. */
    peerLeft() {
      if (!opened) end('transfer.interrupted');
    },
    stop: () => end(null, {}, { notify: true }),
  };
}
