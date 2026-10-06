export const MIB = 1024 * 1024;

/** Same as the server default (a test keeps the two in sync); used only if /api/config cannot be read. */
export const DEFAULT_MAX_TRANSFER_MB = 512;

/** Total size in bytes of a selection of files (no file is read: only the sizes). */
export const totalSize = (files) =>
  Array.from(files).reduce((sum, file) => sum + (Number(file.size) || 0), 0);

/** { ok, total, max }. The limit is inclusive: a selection exactly as big as the limit is accepted. */
export function checkSize(files, maxBytes) {
  const total = totalSize(files);
  return { ok: total <= maxBytes, total, max: maxBytes };
}

/** The lower of the device's own limit (memory) and the one set in the configuration. */
export const receiveLimit = (platformBytes, configuredBytes) =>
  Number.isFinite(configuredBytes) && configuredBytes > 0
    ? Math.min(platformBytes, configuredBytes)
    : platformBytes;

/** Reads the answer of /api/config; anything missing or odd falls back to safe values. */
export function parseServerConfig(data) {
  const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : [];
  const mb =
    Number.isFinite(data?.maxTransferMb) && data.maxTransferMb > 0
      ? data.maxTransferMb
      : DEFAULT_MAX_TRANSFER_MB;
  return { iceServers, maxTransferBytes: mb * MIB };
}
