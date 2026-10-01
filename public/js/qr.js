/** Disegna il QR code nel contenitore con la libreria QRCode (public/vendor/qrcode.min.js). */
export function renderQr(container, text) {
  const QR = globalThis.QRCode;
  if (typeof QR !== 'function') throw new Error('QR library not loaded');

  container.replaceChildren();
  new QR(container, {
    text,
    width: 512,
    height: 512,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QR.CorrectLevel.M,
  });
  // La libreria scrive il testo (con l'ID di sessione) nel tooltip: lo togliamo.
  container.removeAttribute('title');
}
