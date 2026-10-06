import { loadTranslations, createTranslator, applyTranslations } from './i18n.js';
import { randomDarkTheme, applyTheme } from './theme.js';
import { $, showScreen, showMessage } from './ui.js';
import { startHost } from './host.js';
import { startGuest } from './guest.js';
import { attachDrop } from './drop.js';
import { checkSize, parseServerConfig } from './limits.js';
import { formatBytes } from './format.js';

applyTheme(document, randomDarkTheme());

const params = new URLSearchParams(location.search);
const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
const preferred = [params.get('lang'), ...browserLanguages].filter(Boolean);

const { lang, messages } = await loadTranslations({ languages: preferred });
const t = createTranslator(messages);
applyTranslations(document, t, lang);

async function loadServerConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (res.ok) return parseServerConfig(await res.json());
  } catch {
    /* without the server settings: no STUN servers (local network only) and the default size limit */
  }
  return parseServerConfig(null);
}

const serverConfig = await loadServerConfig();

const ctx = {
  t,
  iceServers: serverConfig.iceServers,
  maxTransferBytes: serverConfig.maxTransferBytes,
  signalingUrl: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
  goHome() {
    history.replaceState(null, '', location.pathname + location.search);
    showScreen('home');
  },
};

$('btn-receive').onclick = () => startHost(ctx, { mode: 'receive' });
$('btn-code').onclick = () => startGuest(ctx);

/** Starts a transfer from the home page, unless the selection is over the limit. */
function sendFile(file) {
  const check = checkSize([file], ctx.maxTransferBytes);
  if (!check.ok) {
    return showMessage(
      t('limit.exceeded', { size: formatBytes(check.total), max: formatBytes(check.max) }),
      { onHome: ctx.goHome },
    );
  }
  startHost(ctx, { mode: 'send', file });
}

const fileInput = $('file-send');
$('btn-send').onclick = () => fileInput.click();
fileInput.onchange = () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (file) sendFile(file);
};

// Drag and drop: accepted only on the home page. Elsewhere a dropped file is ignored
// (see drop.js: the browser must never open it, or the page and the transfer would be lost).
const homeScreen = document.querySelector('[data-screen="home"]');
attachDrop(document, {
  overlay: $('drop-overlay'),
  isActive: () => !homeScreen.hidden,
  onFile: sendFile,
});

const id = location.hash.slice(1);
if (/^[A-Za-z0-9_-]{16,64}$/.test(id)) startGuest(ctx, { id });
else showScreen('home');
