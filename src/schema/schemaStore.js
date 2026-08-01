/**
 * ATM10 Codex — Schema store.
 *
 * Single source the app reads type schemas through. Bundled seed schemas are the
 * offline source of truth; an overlay wins when present. The overlay is fed from two
 * sources: a `localStorage` cache of the author's edits (hydrated at boot so edits
 * survive a reload with no Firebase project) and, when Firebase is configured, the
 * Firestore `codex_schemas` subscription (which wins per-type when a doc is present).
 *
 * Precedence at read time: overlay-if-present, else bundled seed. Seed is immutable
 * and is always the ultimate fallback — hence "Reset to default" simply clears a type
 * out of the overlay and its caches.
 */

import { seedSchemas } from './seedSchemas.js';

/** localStorage key holding the author's local schema edits as a `{ type: schema }` map. */
export const OVERLAY_STORAGE_KEY = 'codex_schema_overlay';

// Overlay schemas keyed by type. Empty until hydrate/subscription populates it.
const overlay = new Map();

/** The Web Storage to use, or null when none is available (e.g. plain Node). */
function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Read the persisted overlay map, or `{}` when absent/corrupt. */
function readStoredMap(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(OVERLAY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Write the persisted overlay map. */
function writeStoredMap(storage, map) {
  if (!storage) return;
  try {
    storage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full/blocked — the in-memory overlay still holds the live edit */
  }
}

/** Ordered list of entry types for nav/registry: [{ type, label }]. */
export function listTypes() {
  return seedSchemas.map((s) => ({ type: s.type, label: s.label }));
}

/** The schema for a type, or undefined if unknown. Overlay wins over seed. */
export function getSchema(type) {
  return overlay.get(type) || seedSchemas.find((s) => s.type === type);
}

/** Replace the overlay for a type. Called by the Firestore subscription and by save/reset. */
export function setOverlaySchema(type, schema) {
  if (schema) overlay.set(type, schema);
  else overlay.delete(type);
}

/**
 * Load persisted local edits into the overlay at boot. A later Firestore
 * subscription still wins per-type when it supplies a doc for that type.
 */
export function hydrateOverlayFromStorage(storage = defaultStorage()) {
  const map = readStoredMap(storage);
  Object.entries(map).forEach(([type, schema]) => setOverlaySchema(type, schema));
}

/**
 * Apply an edited schema live and cache it locally. The cloud write (when Firebase is
 * configured) is the caller's job — this covers the always-available local tiers.
 */
export function saveSchemaLocal(type, schema, storage = defaultStorage()) {
  setOverlaySchema(type, schema);
  const map = readStoredMap(storage);
  map[type] = schema;
  writeStoredMap(storage, map);
}

/**
 * Clear a type back to its bundled seed: drop the overlay and the local cache entry.
 * The cloud delete (when configured) is the caller's job.
 */
export function resetSchema(type, storage = defaultStorage()) {
  setOverlaySchema(type, null);
  const map = readStoredMap(storage);
  delete map[type];
  writeStoredMap(storage, map);
}
