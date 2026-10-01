import { loadTranslations, createTranslator, applyTranslations } from './i18n.js';
import { randomDarkTheme, applyTheme } from './theme.js';
import { $, showScreen } from './ui.js';
import { startHost } from './host.js';
import { startGuest } from './guest.js';

applyTheme(document, randomDarkTheme());

const params = new URLSearchParams(location.search);
const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
const preferred = [params.get('lang'), ...browserLanguages].filter(Boolean);

const { lang, messages } = await loadTranslations({ languages: preferred });
const t = createTranslator(messages);
applyTranslations(document, t, lang);

const ctx = {
  t,
  signalingUrl: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
  goHome() {
    history.replaceState(null, '', location.pathname + location.search);
    showScreen('home');
  },
};

$('btn-receive').onclick = () => startHost(ctx, { mode: 'receive' });

const fileInput = $('file-send');
$('btn-send').onclick = () => fileInput.click();
fileInput.onchange = () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (file) startHost(ctx, { mode: 'send', file });
};

const id = location.hash.slice(1);
if (/^[A-Za-z0-9_-]{16,64}$/.test(id)) startGuest(ctx, id);
else showScreen('home');
