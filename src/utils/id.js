/**
 * Codex — Opaque id mint.
 *
 * The single source of new ids for the three top-level entities: types, entries, and codices.
 * Ids are opaque and random — they never appear in URLs and carry no readable meaning, so
 * there is nothing to derive them from and no collision dance to run (contrast the per-type
 * field storage keys, which stay label-derived in `schemaEditor.js`).
 *
 * `globalThis.crypto` (not `node:crypto`) so the one call site works unchanged in the browser
 * and under `node --test`; a bare `node:crypto` import would break the Vite bundle.
 */

/** A fresh opaque id (UUID v4). */
export function newId() {
  return globalThis.crypto.randomUUID();
}
