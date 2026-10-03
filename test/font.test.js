import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from '../server/server.js';
import {
  validateConfig,
  googleCssUrl,
  parseGoogleCss,
  buildFontCss,
  updatePreload,
} from '../scripts/font.js';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const fontsDir = join(root, 'public', 'fonts');
const config = JSON.parse(await readFile(join(root, 'font.config.json'), 'utf8'));
const css = await readFile(join(root, 'public', 'css', 'font.css'), 'utf8'); // se manca: npm run font
const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
const files = [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);

const SAMPLE = `/* latin-ext */
@font-face {
  font-family: 'Orbitron';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/orbitron/v31/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA;
}
/* latin */
@font-face {
  font-family: 'Orbitron';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/orbitron/v31/lat.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
/* evil */
@font-face {
  font-family: 'Orbitron';
  font-weight: 700;
  src: url(https://evil.example/x.woff2) format('woff2');
}`;

test('validateConfig: accetta la configurazione corrente e rifiuta valori strani', () => {
  assert.deepEqual(validateConfig(config), []);
  const ok = { family: 'Orbitron', weight: '700', subsets: ['latin'], titleSize: '2rem' };
  assert.deepEqual(validateConfig(ok), []);
  const bad = [
    null,
    { ...ok, family: '../x' },
    { ...ok, family: 'a;b' },
    { ...ok, weight: '450' },
    { ...ok, subsets: [] },
    { ...ok, subsets: ['La Tin'] },
    { ...ok, titleSize: 'grande' },
  ];
  for (const value of bad) assert.ok(validateConfig(value).length > 0, JSON.stringify(value));
});

test('googleCssUrl', () => {
  assert.equal(
    googleCssUrl({ family: 'Press Start 2P', weight: '400' }),
    'https://fonts.googleapis.com/css2?family=Press+Start+2P:wght@400&display=swap',
  );
});

test('parseGoogleCss: estrae solo i sottoinsiemi richiesti', () => {
  const faces = parseGoogleCss(SAMPLE, ['latin']);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].subset, 'latin');
  assert.equal(faces[0].url, 'https://fonts.gstatic.com/s/orbitron/v31/lat.woff2');
  assert.equal(faces[0].weight, '700');
  assert.match(faces[0].range, /^U\+0000-00FF/);
  assert.equal(parseGoogleCss(SAMPLE, ['latin', 'latin-ext']).length, 2);
});

test('parseGoogleCss: rifiuta file che non arrivano da fonts.gstatic.com', () => {
  assert.deepEqual(parseGoogleCss(SAMPLE, ['evil']), []);
});

test('buildFontCss: @font-face e variabili del titolo', () => {
  const out = buildFontCss(
    { family: 'Orbitron', weight: '700', titleSize: '2.25rem' },
    [{ file: 'orbitron-latin-700.woff2', weight: '700', range: 'U+0000-00FF' }],
  );
  assert.match(out, /font-family: "Orbitron";/);
  assert.match(out, /src: url\("\/fonts\/orbitron-latin-700\.woff2"\) format\("woff2"\);/);
  assert.match(out, /font-display: block;/);
  assert.match(out, /unicode-range: U\+0000-00FF;/);
  assert.match(out, /--title-size: 2\.25rem;/);
  assert.match(out, /--title-weight: 700;/);
});

test('updatePreload: sostituisce il contenuto tra i marcatori', () => {
  const page = 'a<!-- font:preload -->vecchio<!-- /font:preload -->b';
  const out = updatePreload(page, 'x.woff2');
  assert.match(out, /href="\/fonts\/x\.woff2"/);
  assert.doesNotMatch(out, /vecchio/);
  assert.throws(() => updatePreload('niente marcatori', 'x.woff2'));
});

test('font.css corrisponde a font.config.json (se fallisce: npm run font)', () => {
  assert.ok(css.includes(`font-family: "${config.family}";`), 'la famiglia in font.css è diversa da quella in font.config.json');
  assert.ok(css.includes(`--title-size: ${config.titleSize};`));
  assert.ok(css.includes(`--title-weight: ${config.weight};`));
});

test('i file del font esistono e il preload punta al primo', async () => {
  assert.ok(files.length > 0, 'font.css non contiene nessun @font-face');
  for (const file of files) assert.ok((await stat(join(fontsDir, file))).size > 0, file);
  const preloaded = html.match(/<!-- font:preload -->[\s\S]*?href="\/fonts\/([^"]+)"/)?.[1];
  assert.equal(preloaded, files[0]);
});

test('la licenza del font è distribuita insieme al font', async () => {
  const names = await readdir(fontsDir);
  assert.ok(names.some((name) => /^LICENSE-.*\.txt$/.test(name)), 'manca public/fonts/LICENSE-*.txt');
});

test('il server serve il font come font/woff2', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/fonts/${files[0]}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'font/woff2');
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2');
});
