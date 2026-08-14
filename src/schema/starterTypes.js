/**
 * Codex — Starter-type cloning.
 *
 * Turns a set of example schemas (the demo fixture's `note` + `person`) into a coherent kit
 * an admin can drop into an empty codex from the first-run state, then edit or delete like any
 * type. Pure and Node-tested; `main.js` persists the result through its normal schema write path.
 *
 * The kit is cloned as a whole so its cross-references survive: `note`'s map points at `person`
 * (`association.refType`) and `person.favoriteNote` points at `note` (`targetType`). Each cloned
 * type gets a fresh opaque id, so those in-kit references are rewritten through the same remap to
 * keep the kit internally coherent; a reference to a type outside the kit is left untouched.
 */

import { newId as realNewId } from '../utils/id.js';

/**
 * Clone `sources` into schemas safe to persist into any codex. Each cloned type gets a fresh
 * opaque id (via `newId`, injectable so tests stay deterministic), and in-kit `targetType` /
 * `association.refType` references are remapped to match. Opaque ids can't collide, so — unlike
 * a slug-based clone — nothing about the destination codex's existing types matters here.
 */
export function cloneStarterSchemas(sources, newId = realNewId) {
  const idMap = new Map();
  for (const schema of sources) idMap.set(schema.type, newId());

  const remap = (t) => (idMap.has(t) ? idMap.get(t) : t);
  return sources.map((schema) => {
    const clone = JSON.parse(JSON.stringify(schema));
    clone.type = idMap.get(schema.type);
    clone.status = 'active';
    for (const field of clone.fields ?? []) {
      if (field.targetType) field.targetType = remap(field.targetType);
      if (field.association?.refType) field.association.refType = remap(field.association.refType);
    }
    return clone;
  });
}
