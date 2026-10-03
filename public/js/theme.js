const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

/** Colore di sfondo scuro casuale, con testo chiaro della stessa tinta. */
export function randomDarkTheme(rand = Math.random) {
  const h = Math.floor(rand() * 360);
  const s = 22 + Math.floor(rand() * 18);
  const l = 9 + Math.floor(rand() * 7);
  return {
    bg: hsl(h, s, l),
    fg: hsl(h, 20, 94),
    muted: hsl(h, 12, 70),
    surface: hsl(h, s, l + 6),
    surfaceHover: hsl(h, s, l + 10),
    border: hsl(h, s, l + 16),
  };
}

export function applyTheme(doc, theme) {
  const style = doc.documentElement.style;
  style.setProperty('--bg', theme.bg);
  style.setProperty('--fg', theme.fg);
  style.setProperty('--muted', theme.muted);
  style.setProperty('--surface', theme.surface);
  style.setProperty('--surface-hover', theme.surfaceHover);
  style.setProperty('--border', theme.border);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
}
