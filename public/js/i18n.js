const VALID_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * Elenco ordinato dei file da provare, a partire dalle lingue preferite.
 * Per ogni lingua: tag completo, poi tag base. In coda il fallback.
 * I tag non validi vengono scartati (evita percorsi arbitrari nel fetch).
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
  fallback = 'en',
} = {}) {
  const fallbackMessages = await fetchJson(`${base}/${fallback}.json`, fetchFn);
  if (!fallbackMessages) throw new Error(`Missing fallback locale: ${fallback}`);

  for (const tag of candidates(languages, fallback)) {
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
  for (const el of doc.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const attr of ATTRIBUTES) {
    for (const el of doc.querySelectorAll(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    }
  }
}
