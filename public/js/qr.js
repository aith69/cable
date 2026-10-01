const SVG_NS = 'http://www.w3.org/2000/svg';

/** Disegna il QR code come SVG (nero su bianco, con margine di sicurezza). */
export function renderQr(container, text) {
  const lib = globalThis.qrcode ?? globalThis.window?.qrcode;
  if (typeof lib !== 'function') throw new Error('QR library not loaded (typeof qrcode = ' + typeof lib + ')');
  const qr = lib(0, 'M');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('shape-rendering', 'crispEdges');

  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', size);
  background.setAttribute('height', size);
  background.setAttribute('fill', '#ffffff');

  const modules = document.createElementNS(SVG_NS, 'path');
  modules.setAttribute('d', path);
  modules.setAttribute('fill', '#000000');

  svg.append(background, modules);
  container.replaceChildren(svg);
}
