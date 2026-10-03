import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isLocaleTag } from '../public/js/i18n.js';

/** Tag delle lingue disponibili: i file *.json in public/locales con un nome valido, in ordine alfabetico. */
export async function listLocales(publicDir) {
  try {
    const files = await readdir(join(publicDir, 'locales'));
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length))
      .filter(isLocaleTag)
      .sort();
  } catch {
    return [];
  }
}
