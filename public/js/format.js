export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

export const formatSpeed = (bytesPerSecond) => `${formatBytes(bytesPerSecond)}/s`;

export function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.ceil(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Velocità media su una finestra scorrevole (default 3 s). */
export class SpeedMeter {
  constructor(windowMs = 3000) {
    this.windowMs = windowMs;
    this.samples = [];
  }

  add(bytes, now = Date.now()) {
    this.samples.push({ t: now, b: bytes });
    while (this.samples.length > 2 && now - this.samples[0].t > this.windowMs) this.samples.shift();
  }

  get speed() {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const seconds = (last.t - first.t) / 1000;
    return seconds > 0 ? Math.max(0, (last.b - first.b) / seconds) : 0;
  }

  eta(remainingBytes) {
    const speed = this.speed;
    return speed > 0 ? remainingBytes / speed : Infinity;
  }
}
