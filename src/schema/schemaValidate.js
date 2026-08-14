/**
 * Codex — Schema validation.
 *
 * Pure gate the in-app schema editor runs before a save is allowed to persist.
 * A malformed schema can brick a type's form/preview, so Save is blocked whenever
 * any rule below fails and the returned errors are shown inline.
 *
 * Kept free of DOM/Vite coupling so it is unit-testable under plain Node. The set of
 * legal field kinds is derived from the same registry the renderers use, so the two
 * can never drift.
 */

import { fieldKinds, toList } from './fieldKinds.js';

/** Every kind the app can render — the one registry now holds media alongside the pure kinds. */
const KNOWN_KINDS = new Set(Object.keys(fieldKinds));

/**
 * Validate a working schema. Returns `{ ok, errors }` — `ok` is true only when
 * `errors` is empty. Errors are human-readable strings for inline display.
 */
export function validateSchema(schema) {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    return { ok: false, errors: ['Schema must be an object.'] };
  }
  if (!Array.isArray(schema.fields)) {
    return { ok: false, errors: ['Schema must have a fields array.'] };
  }

  const allFields = schema.fields;

  // Field keys: present + unique across the type.
  const keys = new Set();
  const duplicates = new Set();
  let sawMissingKey = false;
  allFields.forEach((f) => {
    const key = f && f.key;
    if (key == null || String(key).trim() === '') {
      sawMissingKey = true;
      return;
    }
    if (keys.has(key)) duplicates.add(key);
    keys.add(key);
  });
  if (sawMissingKey) errors.push('Every field must have a key.');
  duplicates.forEach((k) => errors.push(`Duplicate field key: "${k}".`));

  // Field kinds known; reference fields carry a target type.
  allFields.forEach((f) => {
    if (!f) return;
    if (!KNOWN_KINDS.has(f.kind)) {
      errors.push(`Field "${f.key}" has an unknown kind: "${f.kind}".`);
    }
    if (f.kind === 'reference' && (!f.targetType || String(f.targetType).trim() === '')) {
      errors.push(`Reference field "${f.key}" must have a target type.`);
    }
    if (f.kind === 'select' && toList(f.options).length === 0) {
      errors.push(`Select field "${f.key}" must define at least one option.`);
    }
    // A heading's label IS its rendered text; a blank one is an empty <h2>.
    if (f.kind === 'heading' && (!f.label || String(f.label).trim() === '')) {
      errors.push(`Heading "${f.key}" must have a label.`);
    }
  });

  // titleField is required and names a real field key. idField is optional — an entry's identity
  // is its opaque `entry.id` doc key, not a schema field — but when present (e.g. the demo
  // fixture's readable id field) it must still name a real field.
  const headingKeys = new Set(allFields.filter((f) => f && f.kind === 'heading').map((f) => f.key));
  const title = schema.titleField;
  if (!title || String(title).trim() === '') {
    errors.push('Schema must define titleField.');
  } else if (!keys.has(title)) {
    errors.push(`titleField "${title}" does not match any field key.`);
  } else if (headingKeys.has(title)) {
    errors.push(`titleField "${title}" is a heading, which holds no entry data.`);
  }
  const idField = schema.idField;
  if (idField != null && String(idField).trim() !== '' && !keys.has(idField)) {
    errors.push(`idField "${idField}" does not match any field key.`);
  }

  return { ok: errors.length === 0, errors };
}
