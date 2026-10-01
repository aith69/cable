import { connectSignaling } from './signaling.js';
import { renderQr } from './qr.js';
import { startCountdown } from './countdown.js';
import { runTransfer } from './transfer.js';
import { $, showScreen, showMessage } from './ui.js';

/**
 * Chi crea la sessione e mostra il QR.
 * mode 'receive': l'altro dispositivo carica il file. mode 'send': questo dispositivo invia `file`.
 */
export function startHost(ctx, { mode, file = null }) {
  const { t } = ctx;
  let sig = null;
  let transfer = null;
  let done = false;
  let stopTimer = () => {};

  const cleanup = () => {
    done = true;
    stopTimer();
    sig?.close();
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

  $('qr').replaceChildren();
  $('timer-text').textContent = '';
  $('timer-fill').style.width = '100%';
  $('host-cancel').onclick = () => {
    cleanup();
    ctx.goHome();
  };
  showScreen('host');

  connectSignaling(ctx.signalingUrl)
    .then((s) => {
      if (done) return s.close();
      sig = s;

      s.on('created', (msg) => {
        try {
          renderQr($('qr'), `${location.origin}/#${msg.id}`);
        } catch (err) {
          console.error('[cable] QR', err);
          return stop('error.generic');
        }
        stopTimer = startCountdown(msg.expiresInMs, (left, total) => {
          $('timer-text').textContent = t('session.expiresIn', { seconds: Math.ceil(left / 1000) });
          $('timer-fill').style.width = `${(left / total) * 100}%`;
        });
      });

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
      console.error('[cable]', err);
      stop('error.generic');
    });
}
