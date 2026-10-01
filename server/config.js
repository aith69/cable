import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export default {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  publicDir: join(root, 'public'),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS) || 60_000,
  maxSessions: Number(process.env.MAX_SESSIONS) || 1000,
  maxMessageBytes: 64 * 1024,
};
