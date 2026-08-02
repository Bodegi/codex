/**
 * Codex — Content hash.
 *
 * An image's stable id is a content hash of its bytes: identical bytes always
 * produce the same id, so uploads dedup automatically (see imageUpload.js). We
 * keep the first 12 hex chars of the SHA-256 digest — short enough to read in a
 * URL, wide enough to avoid collisions at this scale. Pure Web Crypto
 * (`globalThis.crypto.subtle`), present in the browser and in Node 24, so this
 * is unit-testable with no build step.
 */

const HASH_LENGTH = 12;

/** SHA-256 the bytes (Uint8Array | ArrayBuffer) and return the first 12 hex chars. */
export async function hashBytes(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, HASH_LENGTH);
}
