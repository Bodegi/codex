/**
 * Codex — Schema store (codex-aware).
 *
 * Holds the **current codex's** type schemas. There is no bundled floor: the base set is
 * loaded per codex — from that codex's Firestore `schemas` subscription when configured, or
 * from the neutral demo fixture in local-only mode — and replaced on every codex switch.
 *
 * Two tiers, overlay wins:
 *   base     the codex's persisted schemas (Firestore / fixture), replaced live by the sub
 *   overlay  the author's unsaved local edits, persisted under a PER-CODEX localStorage key
 *            so one codex's edits never bleed into another
 *
 * `listTypes()` reflects the current codex, filtering archived types; `getSchema()` still
 * resolves an archived type (its entries can render), it's just not offered in the nav.
 */

/** Prefix for the per-codex overlay cache; the real key is `${prefix}:${codexId}`. */
export const OVERLAY_STORAGE_KEY_PREFIX = 'codex_schema_overlay';

/** The localStorage key holding a given codex's local schema edits. */
export function overlayStorageKey(codexId) {
  return `${OVERLAY_STORAGE_KEY_PREFIX}:${codexId}`;
}

// Module state: the active codex id, its base schemas, and unsaved local edits.
let activeCodexId = null;
const base = new Map(); // type -> schema (persisted: Firestore / fixture)
const overlay = new Map(); // type -> schema (unsaved local edits)

/** The Web Storage to use, or null when none is available (e.g. plain Node). */
function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Read the persisted overlay map for the active codex, or `{}` when absent/corrupt. */
function readStoredMap(storage) {
  if (!storage || !activeCodexId) return {};
  try {
    const raw = storage.getItem(overlayStorageKey(activeCodexId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Write the persisted overlay map for the active codex. */
function writeStoredMap(storage, map) {
  if (!storage || !activeCodexId) return;
  try {
    storage.setItem(overlayStorageKey(activeCodexId), JSON.stringify(map));
  } catch {
    /* storage full/blocked — the in-memory overlay still holds the live edit */
  }
}

/**
 * Point the store at a codex: replace the base set, drop the previous codex's overlay, and
 * rehydrate this codex's persisted local edits. Called on boot and on every codex switch.
 */
export function loadCodex(codexId, schemas = [], storage = defaultStorage()) {
  activeCodexId = codexId;
  base.clear();
  (schemas || []).forEach((s) => { if (s && s.type) base.set(s.type, s); });
  overlay.clear();
  const map = readStoredMap(storage);
  Object.entries(map).forEach(([type, schema]) => { if (schema) overlay.set(type, schema); });
}

/** Replace the live base set (e.g. a fresh Firestore snapshot) without touching the overlay. */
export function applyCodexSchemas(schemas = []) {
  base.clear();
  (schemas || []).forEach((s) => { if (s && s.type) base.set(s.type, s); });
}

/** The effective schema for a type: overlay wins over base. Undefined if unknown. */
export function getSchema(type) {
  return overlay.get(type) || base.get(type);
}

/**
 * Ordered entry types for nav/registry: base order first, then overlay-only types, each as
 * `{ type, label, icon }`. Archived types (status === 'archived') are excluded.
 */
export function listTypes() {
  const orderedTypes = [...base.keys()];
  overlay.forEach((_v, type) => { if (!base.has(type)) orderedTypes.push(type); });
  return orderedTypes
    .map((type) => getSchema(type))
    .filter((s) => s && s.status !== 'archived')
    .map((s) => ({ type: s.type, label: s.label, icon: s.icon }));
}

/** Replace the overlay for a type (Types-editor live preview). Null clears it. */
export function setOverlaySchema(type, schema) {
  if (schema) overlay.set(type, schema);
  else overlay.delete(type);
}

/** Apply an edited schema live and cache it under the active codex's key. */
export function saveSchemaLocal(type, schema, storage = defaultStorage()) {
  setOverlaySchema(type, schema);
  const map = readStoredMap(storage);
  map[type] = schema;
  writeStoredMap(storage, map);
}

/** Drop a type's local edit, falling back to the loaded base. Removes it from the cache too. */
export function resetSchema(type, storage = defaultStorage()) {
  setOverlaySchema(type, null);
  const map = readStoredMap(storage);
  delete map[type];
  writeStoredMap(storage, map);
}
