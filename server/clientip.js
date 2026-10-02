function expandV6(ip) {
  const [head, tail = ''] = ip.split('::');
  const first = head ? head.split(':') : [];
  const last = tail ? tail.split(':') : [];
  const missing = ip.includes('::') ? Math.max(0, 8 - first.length - last.length) : 0;
  return [...first, ...Array(missing).fill('0'), ...last].map((g) => g.padStart(4, '0'));
}

/** IPv4 mappato su IPv6 diventa IPv4; gli IPv6 si raggruppano per /64 (un attaccante ne possiede interi blocchi). */
export function normalizeIp(raw) {
  let ip = String(raw || 'unknown').trim().split('%')[0];
  if (ip.toLowerCase().startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
  if (!ip.includes(':')) return ip;
  return `${expandV6(ip.toLowerCase()).slice(0, 4).join(':')}::/64`;
}

/** Con trustProxy legge X-Real-IP (impostato da nginx); altrimenti usa l'indirizzo della connessione. */
export function clientIp(req, trustProxy = false) {
  let ip = req.socket?.remoteAddress;
  if (trustProxy) {
    const header = req.headers?.['x-real-ip'];
    if (typeof header === 'string' && header.trim()) ip = header.trim();
  }
  return normalizeIp(ip);
}
