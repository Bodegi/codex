/**
 * Codex — Blank entry factory (pure).
 *
 * Builds the starting `formData` for a "＋ New entry": the type, `status: 'active'`, and every
 * schema field initialized to an empty value of the right shape (arrays for list/gallery,
 * empty strings otherwise) so the form renders predictably. The id is left blank — an opaque
 * one is minted on save (see `newId`).
 */

const ARRAY_KINDS = new Set(['list', 'gallery']);

/** Whether a field's empty value is an array (list/gallery, or a multi-value reference). */
function isArrayField(field) {
  return ARRAY_KINDS.has(field.kind) || (field.kind === 'reference' && !!field.multi);
}

/** An empty, active entry shaped by `schema` — ready to bind to the form. */
export function blankEntry(schema) {
  const entry = { type: schema.type, id: '', status: 'active' };
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) {
      if (field.key === 'id' || field.key === 'type' || field.key === 'status') continue;
      entry[field.key] = isArrayField(field) ? [] : '';
    }
  }
  return entry;
}
