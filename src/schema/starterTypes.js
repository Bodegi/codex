/**
 * Codex — Starter-type cloning.
 *
 * Turns a set of example schemas (the demo fixture's `note` + `person`) into a coherent kit
 * an admin can drop into an empty codex from the first-run state, then edit or delete like any
 * type. Pure and Node-tested; `main.js` persists the result through its normal schema write path.
 *
 * The kit is cloned as a whole so its cross-references survive: `note`'s map points at `person`
 * (`association.refType`) and `person.favoriteNote` points at `note` (`targetType`). When a
 * cloned type id has to shift to stay unique against the codex's existing types, those in-kit
 * references are rewritten through the same remap so the kit stays internally coherent; a
 * reference to a type outside the kit is left untouched.
 */

import { uniqueSlug } from './slug.js';

/**
 * Clone `sources` into schemas safe to persist into a codex that already holds `existingTypes`
 * (an array of type ids). Type ids are made unique — against the codex and against each other —
 * and in-kit `targetType` / `association.refType` references are remapped to match.
 */
export function cloneStarterSchemas(sources, existingTypes = []) {
  const taken = [...existingTypes];
  const idMap = new Map();
  for (const schema of sources) {
    const id = uniqueSlug(schema.type, taken);
    idMap.set(schema.type, id);
    taken.push(id);
  }

  const remap = (t) => (idMap.has(t) ? idMap.get(t) : t);
  return sources.map((schema) => {
    const clone = JSON.parse(JSON.stringify(schema));
    clone.type = idMap.get(schema.type);
    clone.status = 'active';
    for (const section of clone.sections ?? []) {
      for (const field of section.fields ?? []) {
        if (field.targetType) field.targetType = remap(field.targetType);
        if (field.association?.refType) field.association.refType = remap(field.association.refType);
      }
    }
    return clone;
  });
}
