import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(root, 'font.config.json');
const FONTS_DIR = join(root, 'public', 'fonts');
const CSS_PATH = join(root, 'public', 'css', 'font.css');
const HTML_PATH = join(root, 'public', 'index.html');

// Con un browser moderno Google risponde con file woff2 (altrimenti con TTF).
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_FONT_BYTES = 512 * 1024;
const FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function validateConfig(config) {
  if (!config || typeof config !== 'object') return ['font.config.json non è un oggetto JSON'];
  const errors = [];
  if (typeof config.family !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ]{0,60}$/.test(config.family)) {
    errors.push('family: nome del font (lettere, numeri e spazi), per esempio "Orbitron"');
  }
  if (!/^[1-9]00$/.test(String(config.weight))) {
    errors.push('weight: un solo peso tra 100 e 900, per esempio "400"');
  }
  const subsets = config.subsets;
  if (!Array.isArray(subsets) || !subsets.length || !subsets.every((s) => /^[a-z][a-z-]{1,30}$/.test(s))) {
    errors.push('subsets: elenco di sottoinsiemi, per esempio ["latin"]');
  }
  if (!/^\d+(\.\d+)?(px|rem|em)$/.test(String(config.titleSize))) {
    errors.push('titleSize: una misura, per esempio "2rem" o "32px"');
  }
  return errors;
}

export const googleCssUrl = ({ family, weight }) =>
  `https://fonts.googleapis.com/css2?family=${family.trim().replace(/\s+/g, '+')}:wght@${weight}&display=swap`;

/** Estrae dal CSS di Google i blocchi @font-face dei sottoinsiemi richiesti. Accetta solo file da fonts.gstatic.com. */
export function parseGoogleCss(css, subsets) {
  const faces = [];
  for (const match of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    const [, subset, body] = match;
    if (!subsets.includes(subset)) continue;
    const url = body.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+)\)\s*format\(['"]woff2['"]\)/)?.[1];
    if (!url) continue;
    faces.push({
      subset,
      url,
      weight: body.match(/font-weight:\s*([\d ]+);/)?.[1].trim() ?? '400',
      range: body.match(/unicode-range:\s*([^;]+);/)?.[1].trim() ?? null,
    });
  }
  return faces;
}

export function buildFontCss(config, faces) {
  const lines = ['/* Generato da scripts/font.js a partire da font.config.json: non modificare a mano. */'];
  for (const face of faces) {
    lines.push(
      '@font-face {',
      `  font-family: "${config.family}";`,
      '  font-style: normal;',
      `  font-weight: ${face.weight};`,
      '  font-display: block;',
      `  src: url("/fonts/${face.file}") format("woff2");`,
      ...(face.range ? [`  unicode-range: ${face.range};`] : []),
      '}',
    );
  }
  lines.push(
    ':root {',
    `  --font-title: "${config.family}", ${FALLBACK};`,
    `  --title-size: ${config.titleSize};`,
    `  --title-weight: ${config.weight};`,
    '}',
    '',
  );
  return lines.join('\n');
}

export function updatePreload(html, file) {
  const re = /<!-- font:preload -->[\s\S]*?<!-- \/font:preload -->/;
  if (!re.test(html)) throw new Error('Mancano i marcatori <!-- font:preload --> in public/index.html');
  const tag = `<link rel="preload" href="/fonts/${file}" as="font" type="font/woff2" crossorigin>`;
  return html.replace(re, `<!-- font:preload -->\n  ${tag}\n  <!-- /font:preload -->`);
}

async function fetchLicense(family) {
  const dir = family.toLowerCase().replace(/\s+/g, '');
  const url = `https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`;
  try {
    const res = await fetch(url);
    if (res.ok) return { url, text: await res.text() };
  } catch {
    /* rete non raggiungibile */
  }
  return null;
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const errors = validateConfig(config);
  if (errors.length) throw new Error(`font.config.json non valido:\n  - ${errors.join('\n  - ')}`);

  console.log(`Scarico "${config.family}" (peso ${config.weight}) da Google Fonts...`);
  const res = await fetch(googleCssUrl(config), { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(
      `Google Fonts ha risposto ${res.status}. Controlla il nome del font e il peso: ` +
        `non tutti i font esistono in ogni peso.`,
    );
  }
  const faces = parseGoogleCss(await res.text(), config.subsets);
  if (!faces.length) throw new Error(`Nessun sottoinsieme trovato tra: ${config.subsets.join(', ')}`);

  const slug = config.family.toLowerCase().replace(/\s+/g, '-');
  const downloaded = [];
  for (const face of faces) {
    const file = `${slug}-${face.subset}-${config.weight}.woff2`;
    const response = await fetch(face.url);
    if (!response.ok) throw new Error(`Download di ${file} fallito (${response.status})`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > MAX_FONT_BYTES) throw new Error(`${file} è troppo grande (${data.length} byte)`);
    if (data.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`${file} non è un file woff2`);
    downloaded.push({ ...face, file, data });
  }

  const license = await fetchLicense(config.family);

  // Tutto è stato scaricato: ora si può sostituire il font precedente.
  await mkdir(FONTS_DIR, { recursive: true });
  for (const name of await readdir(FONTS_DIR)) {
    if (/\.woff2$|^LICENSE-.*\.txt$/.test(name)) await rm(join(FONTS_DIR, name));
  }
  for (const face of downloaded) await writeFile(join(FONTS_DIR, face.file), face.data);
  if (license) {
    await writeFile(join(FONTS_DIR, `LICENSE-${slug}.txt`), `Source: ${license.url}\n\n${license.text}`);
  } else {
    console.warn(
      `ATTENZIONE: licenza non trovata. Verifica a mano la licenza di "${config.family}" ` +
        `su fonts.google.com e salvala in public/fonts/LICENSE-${slug}.txt`,
    );
  }

  await writeFile(CSS_PATH, buildFontCss(config, downloaded));
  await writeFile(HTML_PATH, updatePreload(await readFile(HTML_PATH, 'utf8'), downloaded[0].file));

  const kb = downloaded.reduce((sum, face) => sum + face.data.length, 0) / 1024;
  console.log(`Fatto: ${downloaded.length} file in public/fonts (${kb.toFixed(1)} KB), CSS e preload aggiornati.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Errore: ${err.message}`);
    process.exit(1);
  });
}
