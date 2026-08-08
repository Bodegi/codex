/**
 * Codex — Image upload coordinator.
 *
 * Pure orchestration over two injected ports, so the dedup / resurrect / add-codex
 * branching is unit-testable under Node with fakes and touches no network:
 *   storage.uploadBytes(hash, bytes, contentType)  — the Supabase byte adapter
 *   meta.getImage(hash) / createImage / addImageToCodex / setImageStatus — Firestore
 *
 * Dedup is not a feature we build; it is a consequence of content-hash identity:
 * identical bytes hash to the same id, so a second upload finds the existing record
 * and only adjusts membership. Bytes are written BEFORE metadata on purpose — a
 * failure after the blob lands leaves a harmless orphan (a retry dedups onto it),
 * whereas the reverse order could leave a record pointing at bytes that never
 * uploaded (a URL that 404s).
 */

import { hashBytes } from './contentHash.js';

/** Default per-file upload ceiling: 10 MB. Reader views load images inline, so keep them reasonable. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Client-side upload gate. NOT the security boundary — Supabase Storage RLS is — just a friendly guard
 * that keeps junk out and gives the user a reason instead of a cryptic downstream failure.
 * Policy: any raster image, but no SVG (the app has a dedicated vector system in
 * icons/emblems, and excluding it is defense-in-depth against any future inline-render path), capped at
 * `maxBytes`. Returns a human-readable problem string, or null when the file is acceptable. Pure over
 * `{ type, size }` so it's Node-testable and callable from both the picker and the upload backstop.
 */
export function validateImageFile({ type, size } = {}, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  const mime = String(type || '').toLowerCase();
  if (!mime.startsWith('image/')) return 'Only image files can be uploaded.';
  if (mime === 'image/svg+xml') return 'SVG isn’t supported here — use the icon/emblem designer for vector art.';
  if (Number.isFinite(size) && size > maxBytes) {
    return `Image is too large (max ${Math.round(maxBytes / (1024 * 1024))} MB).`;
  }
  return null;
}

/** "dwarven-hall.png" -> "Dwarven Hall". Falls back to "Untitled". */
export function labelFromFilename(filename) {
  const label = String(filename ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return label || 'Untitled';
}

/**
 * Upload one image into a codex. Returns the image id (content hash).
 *   { bytes, filename, contentType, codexId, uid } — the file, already read to bytes
 *   { storage, meta } — the injected byte + metadata ports
 */
export async function uploadImage({ bytes, filename, contentType, codexId, uid }, { storage, meta }) {
  const hash = await hashBytes(bytes);
  const existing = await meta.getImage(hash);

  if (!existing) {
    await storage.uploadBytes(hash, bytes, contentType);
    await meta.createImage(hash, {
      id: hash,
      label: labelFromFilename(filename),
      codices: [codexId],
      status: 'active',
      uploadedBy: uid,
    });
    return hash;
  }

  // Dedup hit — bytes are already stored. Resurrect if archived, then ensure membership.
  if (existing.status === 'archived') {
    await meta.setImageStatus(hash, 'active');
  }
  if (!(existing.codices || []).includes(codexId)) {
    await meta.addImageToCodex(hash, codexId);
  }
  return hash;
}
