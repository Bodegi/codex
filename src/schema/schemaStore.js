/**
 * Codex — Schema store (codex-aware).
 *
 * Holds the **current codex's** type schemas. There is no bundled floor: the base set is
 * loaded per codex — from that codex's Firestore `schemas` subscription when configured, or
 * from the neutral demo fixture in local-only mode — and replaced on every codex switch.
 *
 * Two tiers, overlay wins:
 *   base     the codex's persisted schemas (Firestore / fixture), replaced live by the sub
 *   overlay  the author's unsaved local edits — a DRAFT BUFFER, not a cache. It exists only
 *            while a local edit has not yet been confirmed by the source of truth, persisted
 *            under a PER-CODEX localStorage key so one codex's edits never bleed into another
 *            (and survive a crash mid-edit). Once a save is server-acked, `markSchemaSynced`
 *            prunes the entry so `base` becomes authoritative again — otherwise a locally-edited
 *            type would shadow Firestore forever, hiding out-of-band deletes/edits (issue #27).
 *
 * In local-only mode there is no Firestore round-trip, so nothing calls `markSchemaSynced`; the
 * overlay stays the store's only persistence for that codex's edits, unchanged by this contract.
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

/**
 * Every effective schema for the current codex (overlay wins), in base order then overlay-only
 * types — archived included. Unlike `listTypes` this returns the FULL schema docs, for a faithful
 * export snapshot (schemaStore.js is the store; exportCodex.js shapes the file).
 */
export function getAllSchemas() {
  const orderedTypes = [...base.keys()];
  overlay.forEach((_v, type) => { if (!base.has(type)) orderedTypes.push(type); });
  return orderedTypes.map((type) => getSchema(type)).filter(Boolean);
}

/** Archived types (status === 'archived'), as `{ type, label, icon }` — for the restore list. */
export function listArchivedTypes() {
  const orderedTypes = [...base.keys()];
  overlay.forEach((_v, type) => { if (!base.has(type)) orderedTypes.push(type); });
  return orderedTypes
    .map((type) => getSchema(type))
    .filter((s) => s && s.status === 'archived')
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

/**
 * The source of truth has confirmed this type's write — retire the draft. Drops the overlay entry
 * (memory + the per-codex localStorage key) so `base` is authoritative again. Idempotent; a no-op
 * when the type has no overlay. Same mechanics as `resetSchema`, distinct in intent: reset discards
 * an unwanted edit, this retires a saved one. Not called in local-only mode (no server to ack).
 */
export function markSchemaSynced(type, storage = defaultStorage()) {
  overlay.delete(type);
  const map = readStoredMap(storage);
  if (type in map) {
    delete map[type];
    writeStoredMap(storage, map);
  }
}

/** Drop a type's local edit, falling back to the loaded base. Removes it from the cache too. */
export function resetSchema(type, storage = defaultStorage()) {
  setOverlaySchema(type, null);
  const map = readStoredMap(storage);
  delete map[type];
  writeStoredMap(storage, map);
}
