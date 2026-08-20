/**
 * Codex — Gallery model (pure).
 *
 * A gallery value is an ordered list of images, each with an optional caption:
 *
 *   value = [ { id: <imageId>, caption: <string> }, … ]
 *
 * Back-compat: earlier galleries stored a bare id array (`[ '<imageId>', … ]`). `normalizeGallery`
 * reads both — a string becomes `{ id, caption: '' }` — so old entries render and edit without a
 * migration; the new `{id,caption}` shape is what a re-save persists. Entries with no id are dropped
 * (mirrors the old `toList` Boolean filter — a blank slot is meaningless).
 *
 * Pure and Node-testable: no DOM, no SDK, no registry import.
 */

/** Coerce a stored gallery value to `[{ id, caption }]`, dropping id-less entries. */
export function normalizeGallery(value) {
  const arr = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const id = item.trim();
      if (id) out.push({ id, caption: '' });
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const id = String(item.id ?? '').trim();
      if (id) out.push({ id, caption: String(item.caption ?? '') });
    }
  }
  return out;
}

/** Just the image ids of a gallery, in order — for consumers that don't care about captions. */
export function galleryIds(value) {
  return normalizeGallery(value).map((it) => it.id);
}

/** True when a gallery holds no images. */
export function isEmptyGallery(value) {
  return normalizeGallery(value).length === 0;
}
