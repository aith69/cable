import { loadTranslations, createTranslator, applyTranslations } from './i18n.js';
import { randomDarkTheme, applyTheme } from './theme.js';
import { $, showScreen } from './ui.js';
import { startHost } from './host.js';
import { startGuest } from './guest.js';
import { attachDrop } from './drop.js';

applyTheme(document, randomDarkTheme());

const params = new URLSearchParams(location.search);
const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
const preferred = [params.get('lang'), ...browserLanguages].filter(Boolean);

const { lang, messages } = await loadTranslations({ languages: preferred });
const t = createTranslator(messages);
applyTranslations(document, t, lang);

async function loadIceServers() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.iceServers)) return data.iceServers;
    }
  } catch {
    /* si prosegue senza server ICE: funziona solo in rete locale */
  }
  return [];
}

const ctx = {
  t,
  iceServers: await loadIceServers(),
  signalingUrl: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
  goHome() {
    history.replaceState(null, '', location.pathname + location.search);
    showScreen('home');
  },
};

$('btn-receive').onclick = () => startHost(ctx, { mode: 'receive' });
$('btn-code').onclick = () => startGuest(ctx);

const sendFile = (file) => startHost(ctx, { mode: 'send', file });

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
