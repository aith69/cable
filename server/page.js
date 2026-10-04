import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ENTITIES[char]);

/** Sostituisce {{name}} con il nome dell'app. Si usa una funzione, così "$&" nel nome non viene interpretato. */
export function renderPage(html, { name }) {
  const safe = escapeHtml(name);
  return html.replaceAll('{{name}}', () => safe);
}

/** Serve index.html con il nome configurato (GET e HEAD). */
export function createPageHandler(publicDir, getName) {
  const file = join(publicDir, 'index.html');
  return async function servePage(req, res) {
    const html = renderPage(await readFile(file, 'utf8'), { name: getName() });
    const body = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
