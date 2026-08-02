/**
 * Codex — Image index (the runtime pool port).
 *
 * Replaces the deleted build-time `imagePool.js`. Where the old pool was a
 * synchronous Vite `import.meta.glob`, this is a synchronous view over the
 * current codex's *live* image records (the `images where codices array-contains
 * {codexId} and status == active` subscription), held in memory. The app rebuilds
 * it on codex-open and whenever the subscription fires — the same lifecycle
 * entries and schemas already use.
 *
 * `resolve(id)` stays synchronous: the Supabase public URL is deterministic from
 * the id, so nothing in the render path needs to await. An id not in the index
 * (removed, archived, or never existed) resolves to null → the not-found SVG.
 *
 * Pure: the Supabase config is passed in, so this module imports no SDK and is
 * unit-testable under plain Node.
 */

/** Deterministic public URL for an image id, or null if config/id is unusable. */
export function publicUrl(config, id) {
  if (!config || !config.url || !config.bucket || !id) return null;
  return `${config.url}/storage/v1/object/public/${config.bucket}/${id}`;
}

/**
 * Build an index over image records for the current codex.
 *   records — [{ id, label, status, codices, ... }] (archived entries are dropped)
 *   config  — the resolved Supabase config (or null in local-only mode)
 * Returns { listImages(), resolve(id) }.
 */
export function createImageIndex(records, config) {
  const active = (records || []).filter((r) => r && r.id && r.status !== 'archived');
  const known = new Set(active.map((r) => r.id));
  const images = active
    .map((r) => ({ id: r.id, label: r.label || r.id, url: publicUrl(config, r.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    /** All usable images: [{ id, label, url }], sorted by label. */
    listImages: () => images.slice(),
    /** Current URL for a stored id, or null if it is no longer a usable image. */
    resolve: (id) => (known.has(id) ? publicUrl(config, id) : null),
  };
}
