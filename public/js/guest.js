import { connectSignaling } from './signaling.js';
import { runTransfer } from './transfer.js';
import { $, showScreen, showMessage } from './ui.js';

/** Chi ha scansionato il QR e si aggancia alla sessione `id`. */
export function startGuest(ctx, id) {
  const { t } = ctx;
  let sig = null;
  let transfer = null;
  let done = false;
  const early = [];

  const cleanup = () => {
    done = true;
    sig?.close();
  };
  const stop = (key) => {
    if (done) return;
    cleanup();
    showMessage(t(key), { onHome: ctx.goHome });
  };
  const onEnd = (key, params, action) => {
    if (done) return;
    cleanup();
    if (key === null) return ctx.goHome();
    showMessage(t(key, params), { onHome: ctx.goHome, onSave: action });
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
    if (transfer) return transfer.stop();
    cleanup();
    ctx.goHome();
  };
  showScreen('guest');

  connectSignaling(ctx.signalingUrl)
    .then((s) => {
      if (done) return s.close();
      sig = s;

      s.on('joined', (msg) => {
        transfer = runTransfer(ctx, { sig: s, initiator: false, role: msg.role, onEnd });
        early.splice(0).forEach((data) => transfer.signal(data));

        if (msg.role === 'receive') {
          transfer.show();
          return;
        }
        // Questo dispositivo invia: sceglie il file.
        status.hidden = true;
        upload.hidden = false;
        upload.onclick = () => input.click();
        input.onchange = () => {
          const file = input.files[0];
          if (!file) return;
          transfer.setFile(file);
          transfer.show();
        };
      });

      s.on('signal', (msg) => (transfer ? transfer.signal(msg.data) : early.push(msg.data)));
      s.on('peer-left', () => (transfer ? transfer.peerLeft() : stop('transfer.interrupted')));
      s.on('error', (msg) => {
        if (transfer) return;
        stop(msg.code === 'not_found' || msg.code === 'full' ? 'session.notFound' : 'error.generic');
      });
      s.on('close', () => {
        if (!transfer) stop('error.generic');
      });

      s.send({ type: 'join', id });
    })
    .catch((err) => {
      console.error('[cable]', err);
      stop('error.generic');
    });
}
