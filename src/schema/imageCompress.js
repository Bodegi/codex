/**
 * Codex — Image compression policy (pure).
 *
 * Decides *whether* and *how* to shrink an upload before it is stored; the actual
 * canvas encode is the browser-only edge (`src/utils/imageOptimize.js`). Split this
 * way, every policy call — target dims, quality, skip-if-GIF, skip-if-small,
 * keep-original-if-bigger — is Node-testable over plain numbers, no DOM.
 *
 * The id is a content hash of the *source* bytes (see imageUpload.js), taken before
 * this policy runs, so compression never affects dedup: the same source always
 * hashes the same and dedup skips the encode entirely. This module only shapes the
 * bytes we store under that id.
 *
 * WebP for everything, alpha preserved: it beats PNG on photos and JPEG on line art
 * while keeping transparency, so crisp map text / vector-ish art doesn't fringe.
 * Animated GIFs pass through untouched — a canvas re-encode flattens them to one
 * frame, killing the animation.
 */

/** Cap the longest edge here. ~2048px is the 80/20: a big size cut with no perceptible loss inline. */
export const MAX_EDGE = 2048;

/** WebP quality. High on purpose — crisp line art / map text must not artifact. */
export const QUALITY = 0.9;

/** Below this, re-encoding buys too little to be worth the decode/encode churn. */
export const MIN_BYTES = 50 * 1024;

/**
 * Plan the compression for one image, given its type/size and decoded pixel dims.
 * Returns either `{ skip: true, reason }` (store the source as-is) or an encode plan
 * `{ mime, quality, targetWidth, targetHeight }`. Pure over the inputs.
 */
export function planCompression(
  { type, size, width, height } = {},
  { maxEdge = MAX_EDGE, quality = QUALITY, minBytes = MIN_BYTES } = {}
) {
  const mime = String(type || '').toLowerCase();

  // Animation is lost by a canvas re-encode — never touch GIFs.
  if (mime === 'image/gif') return { skip: true, reason: 'gif' };
  if (!mime.startsWith('image/')) return { skip: true, reason: 'not-image' };
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { skip: true, reason: 'undecodable' };
  }
  if (Number.isFinite(size) && size <= minBytes) return { skip: true, reason: 'small' };

  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  // No downscale to do and it's already WebP — re-encoding WebP→WebP is churn for near-nothing.
  if (scale === 1 && mime === 'image/webp') return { skip: true, reason: 'already-webp' };

  return { mime: 'image/webp', quality, targetWidth, targetHeight };
}

/**
 * Keep-original-if-bigger. Given the source and the (maybe null) compressed result — each a
 * `{ size, ... }` descriptor — return whichever should be stored. A failed or larger compression
 * yields the original, so we never inflate a file by "optimizing" it.
 */
export function chooseOutput(original, compressed) {
  if (!compressed || !Number.isFinite(compressed.size)) return original;
  return compressed.size < original.size ? compressed : original;
}
