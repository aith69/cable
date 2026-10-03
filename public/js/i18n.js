const VALID_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Un tag di lingua valido (it, pt-BR, zh-Hant-TW...). Evita percorsi arbitrari nelle richieste. */
export const isLocaleTag = (tag) => typeof tag === 'string' && VALID_TAG.test(tag);

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ug']);

/** 'rtl' per le lingue scritte da destra a sinistra, altrimenti 'ltr'. */
export function directionOf(lang) {
  return RTL.has(String(lang).split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';
}

// Codici vecchi o varianti che il browser può inviare, ricondotti a una lingua con file proprio.
const ALIASES = {
  iw: 'he',
  in: 'id',
  ji: 'yi',
  no: 'nb',
  nn: 'nb',
  zh: 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-sg': 'zh-CN',
  'zh-hant': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW',
};

/**
 * Elenco ordinato dei file da provare, a partire dalle lingue preferite.
 * Per ogni lingua: tag completo, poi tag base. In coda il fallback.
 * Usato solo se il server non fornisce l'elenco delle lingue disponibili.
 */
export function candidates(languages, fallback = 'en') {
  const out = [];
  const add = (tag) => {
    if (!out.includes(tag)) out.push(tag);
  };
  for (const raw of languages) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim();
    if (!VALID_TAG.test(tag)) continue;
    add(tag);
    add(tag.split('-')[0].toLowerCase());
  }
  add(fallback);
  return out;
}

/**
 * Sceglie la lingua migliore tra quelle disponibili, rispettando l'ordine di preferenza.
 * Per ogni preferenza: tag esatto, poi i tag via via più corti (zh-Hant-TW, zh-Hant, zh),
 * con gli alias, e infine qualunque file della stessa lingua (pt-PT ottiene pt-BR).
 */
export function pickLocale(languages, available, fallback = 'en') {
  const byLower = new Map(available.map((tag) => [tag.toLowerCase(), tag]));
  const find = (tag) => byLower.get(tag.toLowerCase()) ?? null;
  const byBase = (base) => available.find((tag) => tag.toLowerCase().split('-')[0] === base) ?? null;

  for (const raw of languages) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim();
    if (!VALID_TAG.test(tag)) continue;

    const parts = tag.toLowerCase().split('-');
    for (let n = parts.length; n >= 1; n--) {
      const prefix = parts.slice(0, n).join('-');
      const exact = find(prefix);
      if (exact) return exact;
      const alias = ALIASES[prefix];
      if (alias) {
        const hit = find(alias) ?? byBase(alias.split('-')[0]);
        if (hit) return hit;
      }
    }
    const sameBase = byBase(parts[0]);
    if (sameBase) return sameBase;
  }
  return fallback;
}

async function fetchJson(url, fetchFn) {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Carica le traduzioni. L'inglese è la base: la lingua scelta ci si
 * sovrappone, quindi le chiavi mancanti ricadono sul fallback.
 */
export async function loadTranslations({
  languages = [],
  fetchFn = (...args) => globalThis.fetch(...args),
  base = '/locales',
  listUrl = '/api/locales',
  fallback = 'en',
} = {}) {
  const [fallbackMessages, list] = await Promise.all([
    fetchJson(`${base}/${fallback}.json`, fetchFn),
    fetchJson(listUrl, fetchFn),
  ]);
  if (!fallbackMessages) throw new Error(`Missing fallback locale: ${fallback}`);

  const available = Array.isArray(list?.locales) ? list.locales.filter(isLocaleTag) : null;
  const tags = available ? [pickLocale(languages, available, fallback)] : candidates(languages, fallback);

  for (const tag of tags) {
    if (tag === fallback) break;
    const messages = await fetchJson(`${base}/${tag}.json`, fetchFn);
    if (messages) return { lang: tag, messages: { ...fallbackMessages, ...messages } };
  }
  return { lang: fallback, messages: fallbackMessages };
}

/** Restituisce t(chiave, {parametri}). Chiave mancante: restituisce la chiave. */
export function createTranslator(messages) {
  return (key, params = {}) => {
    const text = Object.hasOwn(messages, key) ? messages[key] : key;
    return String(text).replace(/\{(\w+)\}/g, (match, name) =>
      Object.hasOwn(params, name) ? String(params[name]) : match,
    );
  };
}

const ATTRIBUTES = ['aria-label', 'placeholder', 'title'];

/** Applica le traduzioni agli elementi marcati con data-i18n nel DOM. */
export function applyTranslations(doc, t, lang) {
  doc.documentElement.lang = lang;
  doc.documentElement.dir = directionOf(lang);
  for (const el of doc.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const attr of ATTRIBUTES) {
    for (const el of doc.querySelectorAll(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    }
  }
}
