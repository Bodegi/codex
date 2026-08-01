/**
 * ATM10 Codex — Schema store.
 *
 * Single source the app reads type schemas through. Bundled seed schemas are the
 * offline source of truth; a Firestore overlay (wired in a later step) wins when
 * present. When Firebase is unconfigured the overlay stays empty and seed is the
 * whole story.
 */

import { seedSchemas } from './seedSchemas.js';

// Firestore-sourced schemas keyed by type. Empty until subscribeSchemas populates it.
const overlay = new Map();

/** Ordered list of entry types for nav/registry: [{ type, label }]. */
export function listTypes() {
  return seedSchemas.map((s) => ({ type: s.type, label: s.label }));
}

/** The schema for a type, or undefined if unknown. Firestore overlay wins over seed. */
export function getSchema(type) {
  return overlay.get(type) || seedSchemas.find((s) => s.type === type);
}

/** Replace the Firestore overlay for a type (called by the Firestore subscription). */
export function setOverlaySchema(type, schema) {
  if (schema) overlay.set(type, schema);
  else overlay.delete(type);
}
