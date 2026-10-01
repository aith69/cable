import { connectSignaling } from './signaling.js';
import { renderQr } from './qr.js';
import { startCountdown } from './countdown.js';
import { $, showScreen, showMessage } from './ui.js';

/**
 * Chi crea la sessione e mostra il QR.
 * mode 'receive': l'altro dispositivo carica il file. mode 'send': questo dispositivo invia `file`.
 */
export function startHost(ctx, { mode, file = null }) {
  const { t } = ctx;
  let sig = null;
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
        $('transfer-status').textContent = t('transfer.connecting');
        const fileLine = $('transfer-file');
        fileLine.hidden = !file;
        if (file) fileLine.textContent = t('file.selected', { name: file.name });
        $('transfer-stop').onclick = () => {
          cleanup();
          ctx.goHome();
        };
        showScreen('transfer');
      });

      s.on('peer-left', () => stop('transfer.interrupted'));
      s.on('expired', () => stop('session.expired', { renew: true }));
      s.on('error', () => stop('error.generic'));
      s.on('close', () => stop('error.generic'));

      s.send({ type: 'create', mode });
    })
    .catch((err) => {
      console.error('[cable]', err);
      stop('error.generic');
    });
}
