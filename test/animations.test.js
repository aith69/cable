import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const css = await readFile(join(fileURLToPath(import.meta.url), '..', '..', 'public', 'css', 'style.css'), 'utf8');

test('animazioni: ogni animation usa un @keyframes definito', () => {
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  const used = [...css.matchAll(/animation:\s*([a-z][\w-]*)\s/g)].map((m) => m[1]);
  assert.ok(used.length >= 3, 'nessuna animazione trovata (hai lanciato npm run build:css?)');
  for (const name of used) assert.ok(defined.has(name), `@keyframes mancante: ${name}`);
});

test('animazioni: brevi (al massimo 400 ms) e disattivate con prefers-reduced-motion', () => {
  for (const m of css.matchAll(/animation:\s*[\w-]+\s+([\d.]+)(m?s)/g)) {
    const ms = Number(m[1]) * (m[2] === 's' ? 1000 : 1);
    assert.ok(ms <= 400, `animazione troppo lunga (${m[0]})`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
