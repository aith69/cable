export const $ = (id) => document.getElementById(id);

export function showScreen(name) {
  for (const el of document.querySelectorAll('[data-screen]')) {
    el.hidden = el.dataset.screen !== name;
  }
}

/** Messaggio finale con "torna all'inizio" e, se servono, "nuovo codice" e "salva di nuovo". */
export function showMessage(text, { onHome, onRenew = null, onSave = null }) {
  $('message-text').textContent = text;
  const renew = $('message-renew');
  renew.hidden = !onRenew;
  renew.onclick = onRenew;
  const save = $('message-save');
  save.hidden = !onSave;
  save.onclick = onSave;
  $('message-home').onclick = onHome;
  showScreen('message');
}
