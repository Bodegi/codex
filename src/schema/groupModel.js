/**
 * Codex — Group model (pure).
 *
 * The structured heart of the `group` field kind: a one-level repeatable record-array. A group value
 * is an ordered list of records; each record is an instance of the group's sub-schema — a flat list
 * of inner field descriptors (see the `group` entry in fieldKinds.js).
 *
 *   field = { kind:'group', key, label, fields:[ <subField>… ], itemLabel?:<subKey> }
 *   value = [ { <subKey>: <innerValue>, … }, … ]      // one plain object per record
 *
 * One level deep by design — a group may not contain another group, nor the structural/media kinds
 * that carry no plain record value (heading/hero/gallery/map). That bound is what keeps the schema a
 * flat top-level list with a single contained level of nesting beneath a group, not an open tree.
 *
 * Pure and Node-testable: no DOM, no SDK, and deliberately no fieldKinds import — the allow-list is a
 * plain kind-key set, so this stays free of an import cycle with the registry that will consume it.
 * The browser component (the repeat editor + its scoped harvest) and the read walker live elsewhere.
 */

/**
 * Inner kinds a group record may compose. Excludes `group` (no nesting), `heading` (holds no value),
 * and the media/canvas kinds `hero`/`gallery`/`map` (deferred). Mirror any change here in the
 * Structure editor's restricted palette and in the spec/issue.
 */
export const ALLOWED_INNER_KINDS = new Set([
  'text', 'prose', 'number', 'date', 'select', 'boolean', 'reference', 'banner',
]);

/** Whether a kind may be used as a group's inner component. */
export function isAllowedInnerKind(kind) {
  return ALLOWED_INNER_KINDS.has(kind);
}

/** A group's sub-schema (its inner field descriptors), or [] when absent/malformed. */
export function groupSubFields(field) {
  return Array.isArray(field?.fields) ? field.fields : [];
}

/**
 * Coerce a stored value to an array of plain record objects — dropping non-objects and arrays, and
 * shallow-cloning each surviving record so callers never mutate the caller's value in place.
 */
export function normalizeGroup(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => ({ ...r }));
}

/** True when a group holds no records — nothing to render. */
export function isEmptyGroup(value) {
  return normalizeGroup(value).length === 0;
}

/**
 * The heading for one record's card: the `itemLabel` sub-value when set and non-empty (a scalar, not
 * a nested object/array), else a positional "Item N". Keeps a group's cards legible whether or not
 * the author designated a title sub-field.
 */
export function recordLabel(field, record, index) {
  const key = field?.itemLabel;
  const raw = key ? record?.[key] : null;
  const scalar = raw != null && typeof raw !== 'object';
  const text = scalar ? String(raw).trim() : '';
  return text || `Item ${index + 1}`;
}

/** Local option counter — mirrors fieldKinds' `toList`, inlined to keep this module registry-free. */
function optionCount(options) {
  if (Array.isArray(options)) return options.filter((o) => String(o).trim() !== '').length;
  return String(options ?? '').split(',').filter((o) => o.trim() !== '').length;
}

/**
 * Structural errors in a group field's sub-schema, as human-readable strings ([] = valid). The schema
 * editor's `validateSchema` calls this for each group field. Enforces the group-specific rules (a
 * non-empty sub-schema, unique sub-keys, the one-level bound, the allow-list) and holds each inner
 * field to the same per-kind bar the top level uses (a reference needs a target, a select needs an
 * option) — so a nested field can't slip a malformed shape past validation.
 */
export function groupSchemaErrors(field) {
  const errors = [];
  const at = field?.key ? `"${field.key}"` : '(group)';
  const subs = groupSubFields(field);
  if (subs.length === 0) {
    errors.push(`Group ${at} must have at least one component.`);
    return errors;
  }

  const keys = new Set();
  const dupes = new Set();
  let sawMissingKey = false;
  subs.forEach((f) => {
    const key = f && f.key;
    if (key == null || String(key).trim() === '') {
      sawMissingKey = true;
      return;
    }
    if (keys.has(key)) dupes.add(key);
    keys.add(key);

    if (f.kind === 'group') {
      errors.push(`Group ${at} may not contain another group ("${key}") — groups are one level deep.`);
    } else if (!isAllowedInnerKind(f.kind)) {
      errors.push(`Component "${key}" in group ${at} has a kind that can't be nested: "${f.kind}".`);
    }
    if (f.kind === 'reference' && (!f.targetType || String(f.targetType).trim() === '')) {
      errors.push(`Reference "${key}" in group ${at} must have a target type.`);
    }
    if (f.kind === 'select' && optionCount(f.options) === 0) {
      errors.push(`Select "${key}" in group ${at} must define at least one option.`);
    }
  });
  if (sawMissingKey) errors.push(`Every component in group ${at} must have a key.`);
  dupes.forEach((k) => errors.push(`Duplicate component key in group ${at}: "${k}".`));
  return errors;
}
