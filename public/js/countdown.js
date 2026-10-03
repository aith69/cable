/** Chiama onTick(msRimasti, msTotali) ogni 250 ms. Restituisce la funzione per fermarlo. */
export function startCountdown(totalMs, onTick) {
  const end = Date.now() + totalMs;
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    onTick(left, totalMs);
    if (left === 0) clearInterval(timer);
  };
  const timer = setInterval(tick, 250);
  tick();
  return () => clearInterval(timer);
}
