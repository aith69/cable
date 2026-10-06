/**
 * Builds a ZIP archive in the browser, without compressing ("store" method) and without copying
 * the data: the result is a File made of the headers plus references to the original files.
 * Most files people send (photos, videos, documents) are already compressed, so compressing again
 * would only cost time.
 *
 * No Zip64: the app caps a transfer well below 4 GiB (see maxTransferMb), and buildZip refuses
 * anything that would not fit the plain format.
 */

export const MAX_ENTRIES = 0xffff;
const MAX_ZIP_BYTES = 0xffffffff;
const MAX_SEGMENT_CHARS = 120;
const MIB = 1024 * 1024;
const encoder = new TextEncoder();

export class ZipError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZipError';
    this.code = code;
  }
}

const abortError = () => new DOMException('Zip preparation cancelled', 'AbortError');

// ---- CRC32 --------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** Continues a CRC32 with more bytes (start from 0). Returns an unsigned 32-bit number. */
export function crc32Update(crc, bytes) {
  let c = crc ^ -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export const crc32 = (bytes) => crc32Update(0, bytes);

// ---- names --------------------------------------------------------------------------------------

function safeSegment(raw) {
  let s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\:*?"<>|]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  if (s === '') return 'file';
  const chars = Array.from(s);
  if (chars.length > MAX_SEGMENT_CHARS) {
    const dot = s.lastIndexOf('.');
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : '';
    s = chars.slice(0, MAX_SEGMENT_CHARS - Array.from(ext).length).join('') + ext;
  }
  return s;
}

/** A safe path for an entry: "/" separates folders, "." and ".." are dropped, bad characters replaced. */
export function entryName(path) {
  const segments = String(path ?? '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .map(safeSegment);
  return segments.join('/') || 'file';
}

/** Safe, unique names: a repeated name becomes "name (2).ext" (case does not matter, like on Windows and macOS). */
export function uniqueEntryNames(paths) {
  const used = new Set();
  return paths.map((path) => {
    const name = entryName(path);
    let candidate = name;
    if (used.has(candidate.toLowerCase())) {
      const slash = name.lastIndexOf('/') + 1;
      const dir = name.slice(0, slash);
      const base = name.slice(slash);
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : '';
      for (let n = 2; ; n++) {
        candidate = `${dir}${stem} (${n})${ext}`;
        if (!used.has(candidate.toLowerCase())) break;
      }
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function defaultZipName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `files-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}

// ---- date and headers ---------------------------------------------------------------------------

/** MS-DOS date and time, as stored in a ZIP (years 1980-2107, 2-second resolution). */
export function dosDateTime(date = new Date()) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function localHeader(nameBytes, { crc, size, stamp }) {
  const bytes = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true); // version needed
  view.setUint16(6, 0x0800, true); // flags: names are UTF-8
  view.setUint16(8, 0, true); // method: store
  view.setUint16(10, stamp.time, true);
  view.setUint16(12, stamp.date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true); // compressed size
  view.setUint32(22, size, true); // uncompressed size
  view.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  return bytes;
}

function centralHeader(nameBytes, { crc, size, stamp, offset }) {
  const bytes = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true); // version made by
  view.setUint16(6, 20, true); // version needed
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, stamp.time, true);
  view.setUint16(14, stamp.date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint32(42, offset, true);
  bytes.set(nameBytes, 46);
  return bytes;
}

function endRecord(count, cdSize, cdOffset) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, cdSize, true);
  view.setUint32(16, cdOffset, true);
  return bytes;
}

// ---- the archive --------------------------------------------------------------------------------

/**
 * Zips `entries`: Files, or { file, path } to choose the path inside the archive (folders in the future).
 * onProgress(done, total) counts the bytes read to compute the checksums.
 * Rejects with a ZipError ('empty', 'too_many', 'too_large', 'changed', 'size_mismatch')
 * or with an AbortError if `signal` is aborted.
 */
export async function buildZip(
  entries,
  { name = defaultZipName(), onProgress = () => {}, signal, chunkSize = 2 * MIB, now = new Date() } = {},
) {
  const items = Array.from(entries, (entry) => (entry.file ? entry : { file: entry, path: entry.name }));
  if (items.length === 0) throw new ZipError('empty');
  if (items.length > MAX_ENTRIES) throw new ZipError('too_many');

  const nameBytes = uniqueEntryNames(items.map((item) => item.path)).map((n) => encoder.encode(n));

  let total = 0;
  let overhead = 22;
  items.forEach((item, i) => {
    const size = item.file.size;
    if (!(size >= 0) || size >= MAX_ZIP_BYTES) throw new ZipError('too_large');
    total += size;
    overhead += 30 + 46 + 2 * nameBytes[i].length;
  });
  if (total + overhead >= MAX_ZIP_BYTES) throw new ZipError('too_large');

  if (signal?.aborted) throw abortError();
  onProgress(0, total);

  const crcs = [];
  let done = 0;
  for (const item of items) {
    const size = item.file.size;
    let crc = 0;
    let read = 0;
    while (read < size) {
      if (signal?.aborted) throw abortError();
      const end = Math.min(read + chunkSize, size);
      const bytes = new Uint8Array(await item.file.slice(read, end).arrayBuffer());
      if (bytes.length !== end - read) throw new ZipError('changed');
      crc = crc32Update(crc, bytes);
      read = end;
      done += bytes.length;
      onProgress(done, total);
    }
    crcs.push(crc);
  }
  if (signal?.aborted) throw abortError();

  const parts = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  items.forEach((item, i) => {
    const info = {
      crc: crcs[i],
      size: item.file.size,
      stamp: dosDateTime(new Date(item.file.lastModified || now.getTime())),
    };
    const header = localHeader(nameBytes[i], info);
    parts.push(header, item.file);
    const record = centralHeader(nameBytes[i], { ...info, offset });
    central.push(record);
    centralSize += record.length;
    offset += header.length + info.size;
  });
  for (const record of central) parts.push(record);
  parts.push(endRecord(items.length, centralSize, offset));

  const zip = new File(parts, name, { type: 'application/zip', lastModified: now.getTime() });
  if (zip.size !== total + overhead) throw new ZipError('size_mismatch');
  return zip;
}
