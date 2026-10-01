import { loadTranslations, createTranslator, applyTranslations } from './i18n.js';

const params = new URLSearchParams(location.search);
const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
const preferred = [params.get('lang'), ...browserLanguages].filter(Boolean);

const { lang, messages } = await loadTranslations({ languages: preferred });
export const t = createTranslator(messages);

applyTranslations(document, t, lang);
console.log(`[cable] lingua: ${lang}`);
