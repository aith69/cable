import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Legge ICE_SERVERS (JSON). Se manca o non è valido, usa il default. Una lista vuota è valida. */
export function parseIceServers(value) {
  if (!value) return DEFAULT_ICE_SERVERS;
  try {
    const list = JSON.parse(value);
    const valid =
      Array.isArray(list) &&
      list.every((s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls)));
    return valid ? list : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

export default {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  publicDir: join(root, 'public'),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS) || 60_000,
  maxSessions: Number(process.env.MAX_SESSIONS) || 1000,
  maxMessageBytes: 64 * 1024,
  iceServers: parseIceServers(process.env.ICE_SERVERS),
};
