/** Client WebSocket per il signaling. on(tipo, fn) registra un gestore; 'close' arriva alla chiusura. */
export function connectSignaling(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const handlers = Object.create(null);
    const emit = (type, msg) => (handlers[type] ?? []).forEach((fn) => fn(msg));

    const api = {
      send(obj) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
      },
      on(type, fn) {
        (handlers[type] ??= []).push(fn);
      },
      close() {
        ws.close();
      },
    };

    ws.onopen = () => resolve(api);
    ws.onerror = () => reject(new Error('signaling unavailable'));
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg && typeof msg.type === 'string') emit(msg.type, msg);
    };
    ws.onclose = () => emit('close', {});
  });
}
