import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export const DEFAULTS = {
  name: 'vWire',
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
/** With the default title font (Press Start 2P at 2rem) on a 360 px wide screen. */
export const RECOMMENDED_NAME_LENGTH = 9;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// Values coming from environment variables are text. If the text cannot be converted
// it is left as it is, and the check that follows reports it.
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
    : `an integer between ${min} and ${max}`;

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
    : 'a list of servers, for example [{"urls":"stun:stun.example.org:3478"}] (an empty list [] is fine)';
}

export const RULES = {
  name: {
    env: 'APP_NAME',
    parse: (text) => text,
    check: (value) =>
      typeof value === 'string' &&
      value.trim().length >= 1 &&
      value.trim().length <= MAX_NAME_LENGTH &&
      !CONTROL_CHARS.test(value)
        ? null
        : `text of 1-${MAX_NAME_LENGTH} characters, without control characters`,
  },
  port: { env: 'PORT', parse: toNumber, check: intBetween(1, 65535) },
  host: {
    env: 'HOST',
    parse: (text) => text,
    check: (value) =>
      typeof value === 'string' && /^\S+$/.test(value)
        ? null
        : 'an address without spaces, for example "0.0.0.0" or "127.0.0.1"',
  },
  trustProxy: {
    env: 'TRUST_PROXY',
    parse: toBoolean,
    check: (value) => (typeof value === 'boolean' ? null : 'true or false'),
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
 * Merges defaults, file contents and environment variables (the last one wins).
 * Pure function: returns the values, the errors and the warnings.
 * Keys of the file that start with "_" are ignored (free notes).
 */
export function resolveConfig({ file = {}, env = {} } = {}) {
  const errors = [];
  const warnings = [];
  const values = structuredClone(DEFAULTS);

  for (const key of Object.keys(file)) {
    if (!key.startsWith('_') && !Object.hasOwn(RULES, key)) {
      errors.push(
        `config.json: unknown key "${key}" (valid keys: ${Object.keys(RULES).join(', ')})`,
      );
    }
  }

  for (const [key, rule] of Object.entries(RULES)) {
    if (Object.hasOwn(file, key)) {
      const problem = rule.check(file[key]);
      if (problem) errors.push(`config.json: "${key}" is not valid, expected ${problem}`);
      else values[key] = file[key];
    }
    const raw = env[rule.env];
    if (typeof raw === 'string' && raw.trim() !== '') {
      const parsed = rule.parse(raw.trim());
      const problem = rule.check(parsed);
      if (problem) errors.push(`${rule.env}: invalid value, expected ${problem}`);
      else values[key] = parsed;
    }
  }

  values.name = values.name.trim();
  if (values.name.length > RECOMMENDED_NAME_LENGTH) {
    warnings.push(
      `the name "${values.name}" has ${values.name.length} characters: with the default title font ` +
        `about ${RECOMMENDED_NAME_LENGTH} fit on a 360 px wide screen. ` +
        `Lower "titleSize" in font.config.json (then run npm run font) or choose a shorter name.`,
    );
  }
  return { values, errors, warnings };
}

/**
 * Reads config.json (if it exists) and applies the environment variables.
 * With NODE_ENV=test the file is ignored, so the tests do not depend on the local configuration.
 * If CONFIG_FILE is set, the file must exist.
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
        throw new Error(`Cannot read ${path}: ${err.message}`);
      }
    }
    if (text !== null) {
      try {
        file = JSON.parse(text);
      } catch (err) {
        throw new Error(`${path} is not valid JSON: ${err.message}`);
      }
      if (!file || typeof file !== 'object' || Array.isArray(file)) {
        throw new Error(`${path} must contain a JSON object, for example { "name": "vWire" }`);
      }
    }
  }

  const { values, errors, warnings } = resolveConfig({ file, env });
  if (errors.length) throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  return { ...values, warnings };
}

export default {
  ...loadConfig(),
  publicDir: join(root, 'public'),
  maxMessageBytes: 64 * 1024,
};
