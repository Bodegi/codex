/**
 * Codex — Blank entry factory (pure).
 *
 * Builds the starting `formData` for a "＋ New entry": the type, `status: 'active'`, and every
 * schema field initialized to an empty value of the right shape (arrays for list/gallery,
 * empty strings otherwise) so the form renders predictably. The id is left blank — it is
 * assigned from the title on save (see `deriveEntryId`).
 */

const ARRAY_KINDS = new Set(['list', 'gallery']);

/** An empty, active entry shaped by `schema` — ready to bind to the form. */
export function blankEntry(schema) {
  const entry = { type: schema.type, id: '', status: 'active' };
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) {
      if (field.key === 'id' || field.key === 'type' || field.key === 'status') continue;
      entry[field.key] = ARRAY_KINDS.has(field.kind) ? [] : '';
    }
  }
  return entry;
}
