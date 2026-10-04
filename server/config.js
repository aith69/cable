import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export const DEFAULTS = {
  name: 'Cable',
  port: 3000,
  host: '0.0.0.0',
  trustProxy: false,
  sessionTtlMs: 60_000,
  maxSessions: 1000,
  codeAttempts: 3,
  codeAttemptWindowMs: 60_000,
  iceServers: DEFAULT_ICE_SERVERS,
};

export const MAX_NAME_LENGTH = 30;
/** Con il font del titolo predefinito (Press Start 2P a 2rem) su uno schermo da 360 px. */
export const RECOMMENDED_NAME_LENGTH = 9;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// Conversione dei valori che arrivano come testo dalle variabili d'ambiente.
// Se il testo non è convertibile resta com'è, e il controllo successivo lo segnala.
const toNumber = (text) => (/^\d+$/.test(text) ? Number(text) : text);
const toBoolean = (text) => {
  const value = text.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return text;
};
const toJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const intBetween = (min, max) => (value) =>
  Number.isInteger(value) && value >= min && value <= max
    ? null
    : `un numero intero tra ${min} e ${max}`;

function checkIceServers(value) {
  const valid =
    Array.isArray(value) &&
    value.every(
      (server) =>
        server &&
        typeof server === 'object' &&
        (typeof server.urls === 'string' ||
          (Array.isArray(server.urls) &&
            server.urls.length > 0 &&
            server.urls.every((url) => typeof url === 'string'))),
    );
  return valid
    ? null
    : 'una lista di server, per esempio [{"urls":"stun:stun.example.org:3478"}] (anche vuota: [])';
}

const RULES = {
  name: {
    env: 'APP_NAME',
    parse: (text) => text,
    check: (value) =>
      typeof value === 'string' &&
      value.trim().length >= 1 &&
      value.trim().length <= MAX_NAME_LENGTH &&
      !CONTROL_CHARS.test(value)
        ? null
        : `un testo di 1-${MAX_NAME_LENGTH} caratteri, senza caratteri di controllo`,
  },
  port: { env: 'PORT', parse: toNumber, check: intBetween(1, 65535) },
  host: {
    env: 'HOST',
    parse: (text) => text,
    check: (value) =>
      typeof value === 'string' && /^\S+$/.test(value)
        ? null
        : 'un indirizzo senza spazi, per esempio "0.0.0.0" o "127.0.0.1"',
  },
  trustProxy: {
    env: 'TRUST_PROXY',
    parse: toBoolean,
    check: (value) => (typeof value === 'boolean' ? null : 'true o false'),
  },
  sessionTtlMs: { env: 'SESSION_TTL_MS', parse: toNumber, check: intBetween(1000, 3_600_000) },
  maxSessions: { env: 'MAX_SESSIONS', parse: toNumber, check: intBetween(1, 1_000_000) },
  codeAttempts: { env: 'CODE_ATTEMPTS', parse: toNumber, check: intBetween(1, 1000) },
  codeAttemptWindowMs: {
    env: 'CODE_ATTEMPT_WINDOW_MS',
    parse: toNumber,
    check: intBetween(1000, 3_600_000),
  },
  iceServers: { env: 'ICE_SERVERS', parse: toJson, check: checkIceServers },
};

/**
 * Unisce predefiniti, contenuto del file e variabili d'ambiente (l'ultimo vince).
 * Funzione pura: restituisce i valori, gli errori e gli avvisi.
 * Le chiavi del file che iniziano con "_" sono ignorate (note libere).
 */
export function resolveConfig({ file = {}, env = {} } = {}) {
  const errors = [];
  const warnings = [];
  const values = structuredClone(DEFAULTS);

  for (const key of Object.keys(file)) {
    if (!key.startsWith('_') && !Object.hasOwn(RULES, key)) {
      errors.push(
        `config.json: chiave sconosciuta "${key}" (chiavi valide: ${Object.keys(RULES).join(', ')})`,
      );
    }
  }

  for (const [key, rule] of Object.entries(RULES)) {
    if (Object.hasOwn(file, key)) {
      const problem = rule.check(file[key]);
      if (problem) errors.push(`config.json: "${key}" non valido, atteso ${problem}`);
      else values[key] = file[key];
    }
    const raw = env[rule.env];
    if (typeof raw === 'string' && raw.trim() !== '') {
      const parsed = rule.parse(raw.trim());
      const problem = rule.check(parsed);
      if (problem) errors.push(`${rule.env}: valore non valido, atteso ${problem}`);
      else values[key] = parsed;
    }
  }

  values.name = values.name.trim();
  if (values.name.length > RECOMMENDED_NAME_LENGTH) {
    warnings.push(
      `il nome "${values.name}" ha ${values.name.length} caratteri: con il font del titolo predefinito ` +
        `ne entrano circa ${RECOMMENDED_NAME_LENGTH} su uno schermo da 360 px. ` +
        `Riduci "titleSize" in font.config.json (poi npm run font) o scegli un nome più corto.`,
    );
  }
  return { values, errors, warnings };
}

/**
 * Legge config.json (se esiste) e applica le variabili d'ambiente.
 * Con NODE_ENV=test il file viene ignorato, così i test non dipendono dalla configurazione locale.
 * Se CONFIG_FILE è impostato, il file deve esistere.
 */
export function loadConfig({
  env = process.env,
  path = env.CONFIG_FILE || join(root, 'config.json'),
  useFile = env.NODE_ENV !== 'test',
} = {}) {
  let file = {};
  if (useFile) {
    let text = null;
    try {
      text = readFileSync(path, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT' || env.CONFIG_FILE) {
        throw new Error(`Impossibile leggere ${path}: ${err.message}`);
      }
    }
    if (text !== null) {
      try {
        file = JSON.parse(text);
      } catch (err) {
        throw new Error(`${path} non è un JSON valido: ${err.message}`);
      }
      if (!file || typeof file !== 'object' || Array.isArray(file)) {
        throw new Error(`${path} deve contenere un oggetto JSON, per esempio { "name": "Cable" }`);
      }
    }
  }

  const { values, errors, warnings } = resolveConfig({ file, env });
  if (errors.length) throw new Error(`Configurazione non valida:\n  - ${errors.join('\n  - ')}`);
  return { ...values, warnings };
}

export default {
  ...loadConfig(),
  publicDir: join(root, 'public'),
  maxMessageBytes: 64 * 1024,
};
