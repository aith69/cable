import { connectSignaling } from './signaling.js';
import { runTransfer } from './transfer.js';
import { keepAwake } from './wakelock.js';
import { CODE_LENGTH, digitsOf, formatCode } from './code.js';
import { glyph } from './emoji.js';
import { $, showScreen, showMessage } from './ui.js';

/**
 * Chi si aggancia a una sessione esistente.
 * Con { id } arriva dal QR; senza id inserisce il codice a 6 cifre e poi sceglie l'emoji.
 */
export function startGuest(ctx, { id = null } = {}) {
  const { t } = ctx;
  const viaCode = !id;
  let sig = null;
  let transfer = null;
  let done = false;
  let waiting = false;
  let phase = 'code'; // 'code' | 'verify'
  const early = [];

  const awake = keepAwake();
  const cleanup = () => {
    done = true;
    awake.release();
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
  const leave = () => {
    if (transfer) return transfer.stop();
    cleanup();
    ctx.goHome();
  };

  const status = $('guest-status');
  const upload = $('guest-upload');
  const input = $('file-upload');
  const codeInput = $('code-input');
  const codeSubmit = $('code-submit');
  const codeError = $('code-error');

  const refresh = () => {
    codeSubmit.disabled = waiting || digitsOf(codeInput.value).length !== CODE_LENGTH;
  };
  const showCodeError = (text) => {
    waiting = false;
    phase = 'code';
    codeError.textContent = text;
    codeError.hidden = false;
    refresh();
    showScreen('code');
  };

  function showChallenge(s, options) {
    if (!Array.isArray(options)) return stop('error.generic');
    phase = 'verify';
    const box = $('choose-options');
    box.replaceChildren(
      ...options.map((emojiId) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'emoji-option';
        const icon = document.createElement('span');
        icon.className = 'emoji';
        icon.textContent = glyph(emojiId);
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = t(`emoji.${emojiId}`);
        button.append(icon, name);
        button.onclick = () => {
          box.querySelectorAll('button').forEach((b) => (b.disabled = true));
          s.send({ type: 'verify', emoji: emojiId });
        };
        return button;
      }),
    );
    $('choose-cancel').onclick = leave;
    showScreen('choose');
  }

  function bind(s) {
    s.on('joined', (msg) => {
      waiting = false;
      transfer = runTransfer(ctx, { sig: s, initiator: false, role: msg.role, onEnd });
      early.splice(0).forEach((data) => transfer.signal(data));

      if (msg.role === 'receive') {
        transfer.show();
        return;
      }
      // Questo dispositivo invia: sceglie il file.
      showScreen('guest');
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

    s.on('challenge', (msg) => showChallenge(s, msg.options));
    s.on('signal', (msg) => (transfer ? transfer.signal(msg.data) : early.push(msg.data)));
    s.on('peer-left', () => (transfer ? transfer.peerLeft() : stop('transfer.interrupted')));
    s.on('expired', () => {
      if (!transfer) stop('session.expired');
    });

    s.on('error', (msg) => {
      if (transfer) return;
      switch (msg.code) {
        case 'code_not_found':
          return showCodeError(t('code.notFound'));
        case 'rate_limited':
          return showCodeError(
            t('code.rateLimited', { seconds: Math.max(1, Math.ceil((msg.retryAfterMs || 0) / 1000)) }),
          );
        case 'busy':
          return viaCode ? showCodeError(t('code.busy')) : stop('code.busy');
        case 'verify_failed':
          return stop('verify.failedGuest');
        case 'not_found':
        case 'full':
          return stop('session.notFound');
        default:
          return stop('error.generic');
      }
    });

    s.on('close', () => {
      if (transfer) return;
      // Connessione persa mentre si digita il codice: la riapriamo al prossimo invio.
      if (viaCode && phase === 'code' && !waiting) {
        sig = null;
        return;
      }
      stop('error.generic');
    });
  }

  async function connect() {
    if (sig) return sig;
    const s = await connectSignaling(ctx.signalingUrl);
    if (done) {
      s.close();
      throw new Error('cancelled');
    }
    sig = s;
    bind(s);
    return s;
  }

  async function submitCode() {
    const code = digitsOf(codeInput.value);
    if (waiting || code.length !== CODE_LENGTH) return;
    waiting = true;
    codeError.hidden = true;
    refresh();
    try {
      const s = await connect();
      s.send({ type: 'join-code', code });
    } catch (err) {
      if (done) return;
      console.error('[vwire]', err);
      showCodeError(t('error.generic'));
    }
  }

  // Stato iniziale della schermata "carica file" (usata da chi invia)
  status.textContent = t('transfer.connecting');
  status.hidden = false;
  $('guest-file').hidden = true;
  upload.hidden = true;
  input.value = '';
  $('guest-cancel').onclick = leave;

  if (viaCode) {
    codeInput.value = '';
    codeError.hidden = true;
    codeInput.oninput = () => {
      codeInput.value = formatCode(codeInput.value);
      codeError.hidden = true;
      refresh();
    };
    $('code-form').onsubmit = (event) => {
      event.preventDefault();
      submitCode();
    };
    $('code-cancel').onclick = leave;
    refresh();
    showScreen('code');
    codeInput.focus();
  } else {
    showScreen('guest');
    connect()
      .then((s) => s.send({ type: 'join', id }))
      .catch((err) => {
        if (done) return;
        console.error('[vwire]', err);
        stop('error.generic');
      });
  }
}
