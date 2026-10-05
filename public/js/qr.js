function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Disegna il QR code nel contenitore con la libreria QRCode (public/vendor/qrcode.min.js). */
export function renderQr(container, text) {
  const QR = globalThis.QRCode;
  if (typeof QR !== 'function') throw new Error('QR library not loaded');

  container.replaceChildren();
  new QR(container, {
    text,
    width: 512,
    height: 512,
    colorDark: themeColor('--bg', '#000000'), // moduli: scuri, come lo sfondo del sito
    colorLight: themeColor('--fg', '#ffffff'), // fondo: chiaro, come il testo del sito
    correctLevel: QR.CorrectLevel.M,
  });
  // La libreria scrive il testo (con l'ID di sessione) nel tooltip: lo togliamo.
  container.removeAttribute('title');
  // Restart the entrance animation every time a code is drawn.
  container.classList.remove('pop');
  void container.offsetWidth;
  container.classList.add('pop');
}
