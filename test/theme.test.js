import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomDarkTheme } from '../public/js/theme.js';

const lightness = (color) => Number(color.match(/^hsl\(\d+, \d+%, (\d+)%\)$/)[1]);

test('randomDarkTheme: sfondo sempre scuro, testo sempre chiaro', () => {
  for (let i = 0; i <= 100; i++) {
    const { bg, fg, muted } = randomDarkTheme(() => (i / 100) * 0.999);
    assert.ok(lightness(bg) <= 16, `sfondo troppo chiaro: ${bg}`);
    assert.ok(lightness(fg) - lightness(bg) >= 70, `contrasto basso: ${fg} su ${bg}`);
    assert.ok(lightness(muted) - lightness(bg) >= 50, `contrasto basso: ${muted} su ${bg}`);
  }
});

test('randomDarkTheme: il colore dipende dal generatore casuale', () => {
  assert.notEqual(randomDarkTheme(() => 0.1).bg, randomDarkTheme(() => 0.6).bg);
});
