import { connectSignaling } from './signaling.js';
import { $, showScreen, showMessage } from './ui.js';

/** Chi ha scansionato il QR e si aggancia alla sessione `id`. */
export function startGuest(ctx, id) {
  const { t } = ctx;
  let sig = null;
  let done = false;

  const cleanup = () => {
    done = true;
    sig?.close();
  };
  const stop = (key) => {
    if (done) return;
    cleanup();
    showMessage(t(key), { onHome: ctx.goHome });
  };

  const status = $('guest-status');
  const upload = $('guest-upload');
  const input = $('file-upload');

  status.textContent = t('transfer.connecting');
  status.hidden = false;
  $('guest-file').hidden = true;
  upload.hidden = true;
  input.value = '';
  $('guest-cancel').onclick = () => {
    cleanup();
    ctx.goHome();
  };
  showScreen('guest');

  connectSignaling(ctx.signalingUrl)
    .then((s) => {
      if (done) return s.close();
      sig = s;

      s.on('joined', (msg) => {
        if (msg.role !== 'send') return; // chi riceve aspetta e basta
        status.hidden = true;
        upload.hidden = false;
        upload.onclick = () => input.click();
        input.onchange = () => {
          const file = input.files[0];
          if (!file) return;
          upload.hidden = true;
          $('guest-file').textContent = t('file.selected', { name: file.name });
          $('guest-file').hidden = false;
          status.textContent = t('transfer.connecting');
          status.hidden = false;
          // Fase 6: da qui parte il trasferimento WebRTC.
        };
      });

      s.on('peer-left', () => stop('transfer.interrupted'));
      s.on('error', (msg) => {
        const invalid = msg.code === 'not_found' || msg.code === 'full';
        stop(invalid ? 'session.notFound' : 'error.generic');
      });
      s.on('close', () => stop('error.generic'));

      s.send({ type: 'join', id });
    })
    .catch((err) => {
      console.error('[cable]', err);
      stop('error.generic');
    });
}
