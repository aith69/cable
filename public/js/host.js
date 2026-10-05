import { connectSignaling } from './signaling.js';
import { renderQr } from './qr.js';
import { startCountdown } from './countdown.js';
import { runTransfer } from './transfer.js';
import { keepAwake } from './wakelock.js';
import { formatCode } from './code.js';
import { glyph } from './emoji.js';
import { $, showScreen, showMessage } from './ui.js';

/**
 * Chi crea la sessione e mostra il QR (e, su richiesta, il codice a 6 cifre).
 * mode 'receive': l'altro dispositivo carica il file. mode 'send': questo dispositivo invia `file`.
 */
export function startHost(ctx, { mode, file = null }) {
  const { t } = ctx;
  let sig = null;
  let transfer = null;
  let done = false;
  let stopTimer = () => {};

  const awake = keepAwake();
  const cleanup = () => {
    done = true;
    awake.release();
    stopTimer();
    sig?.close();
  };
  const leave = () => {
    cleanup();
    ctx.goHome();
  };
  const stop = (key, { renew = false } = {}) => {
    if (done) return;
    cleanup();
    showMessage(t(key), {
      onHome: ctx.goHome,
      onRenew: renew ? () => startHost(ctx, { mode, file }) : null,
    });
  };
  const onEnd = (key, params, action) => {
    if (done) return;
    cleanup();
    if (key === null) return ctx.goHome();
    showMessage(t(key, params), { onHome: ctx.goHome, onSave: action });
  };

  /** (Ri)avvia il conto alla rovescia. */
  const countdown = (ms) => {
    stopTimer();
    stopTimer = startCountdown(ms, (left, total) => {
      $('timer-text').textContent = t('session.expiresIn', { seconds: Math.ceil(left / 1000) });
      $('timer-fill').style.width = `${(left / total) * 100}%`;
    });
  };

  $('qr').replaceChildren();
  $('timer-text').textContent = '';
  $('timer-fill').style.width = '100%';
  $('host-code').hidden = true;
  $('host-code-link').hidden = true;
  $('host-cancel').onclick = leave;
  $('verify-cancel').onclick = leave;
  showScreen('host');

  connectSignaling(ctx.signalingUrl)
    .then((s) => {
      if (done) return s.close();
      sig = s;

      s.on('created', (msg) => {
        try {
          renderQr($('qr'), `${location.origin}/#${msg.id}`);
        } catch (err) {
          console.error('[vwire] QR', err);
          return stop('error.generic');
        }
        countdown(msg.expiresInMs);
        const link = $('host-code-link');
        link.hidden = false;
        link.onclick = () => s.send({ type: 'request-code' });
      });

      // Il codice affianca il QR: il timer riparte una sola volta, dal server.
      s.on('code', (msg) => {
        $('host-code-value').textContent = formatCode(msg.code);
        $('host-code').hidden = false;
        $('host-code-link').hidden = true;
        countdown(msg.expiresInMs);
      });

      // Qualcuno ha inserito il codice: mostriamo l'emoji da comunicargli a voce.
      s.on('verify-request', (msg) => {
        $('verify-emoji').textContent = glyph(msg.emoji);
        $('verify-name').textContent = t(`emoji.${msg.emoji}`);
        showScreen('verify');
      });
      s.on('verify-cancelled', () => showScreen('host'));
      s.on('verify-failed', () => stop('verify.failedHost', { renew: true }));

      s.on('peer-joined', () => {
        stopTimer();
        transfer = runTransfer(ctx, { sig: s, initiator: true, role: mode, file, onEnd });
        transfer.show();
      });

      s.on('signal', (msg) => transfer?.signal(msg.data));
      s.on('peer-left', () => (transfer ? transfer.peerLeft() : stop('transfer.interrupted')));
      s.on('expired', () => stop('session.expired', { renew: true }));
      // A trasferimento avviato il collegamento è diretto: il signaling non serve più.
      s.on('error', () => {
        if (!transfer) stop('error.generic');
      });
      s.on('close', () => {
        if (!transfer) stop('error.generic');
      });

      s.send({ type: 'create', mode });
    })
    .catch((err) => {
      console.error('[vwire]', err);
      stop('error.generic');
    });
}
