import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export default {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  publicDir: join(root, 'public'),
};
