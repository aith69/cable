export const $ = (id) => document.getElementById(id);

export function showScreen(name) {
  for (const el of document.querySelectorAll('[data-screen]')) {
    el.hidden = el.dataset.screen !== name;
  }
}

/** Schermata di messaggio con "torna all'inizio" e, se serve, "genera un nuovo codice". */
export function showMessage(text, { onHome, onRenew = null }) {
  $('message-text').textContent = text;
  const renew = $('message-renew');
  renew.hidden = !onRenew;
  renew.onclick = onRenew;
  $('message-home').onclick = onHome;
  showScreen('message');
}
