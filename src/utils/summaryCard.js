/**
 * Codex — Summary card + type index (Axis 2 of component composition).
 *
 * The across-entries render mode. Where `entryRenderer.js` renders ONE entry in full,
 * this renders MANY entries as compact cards, driven by a per-type `summaryCard`
 * descriptor.
 *
 * A type's schema may carry:
 *
 *   summaryCard?: {
 *     title?:    fieldKey,          // card heading; defaults to schema.titleField
 *     subtitle?: fieldKey,          // a short line under the title (e.g. a prose "bio")
 *     badges?:   [fieldKey, …],     // list/reference fields → chips (matrix's "mods")
 *     rows?:     [{ label, key }],  // labelled value rows (matrix's exports/imports)
 *   }
 *
 * `renderSummaryCard` composes one card from that descriptor; `renderTypeIndex` maps a
 * type's entries through it into a grid. Both are pure and reuse `fieldKinds`
 * (`displayValue` / `toList`) for each field's presentation, so — like `entryRenderer` —
 * this module stays free of build-tool coupling and is unit-testable under plain Node.
 * Image/reference resolution arrives via the same optional `ctx` (see fieldKinds.js).
 */

import { getSchema } from '../schema/schemaStore.js';
import { toList, displayValue } from '../schema/fieldKinds.js';
import { escapeHtml } from '../schema/inlineText.js';

/** Key → field map over the flat field list (fields are keyed uniquely per type). */
function fieldMap(schema) {
  const map = new Map();
  for (const field of schema.fields || []) map.set(field.key, field);
  return map;
}

/** A field's display string, or '' when the key no longer names a field (e.g. it was removed). */
function display(fields, key, entry, ctx) {
  const field = fields.get(key);
  if (!field) return '';
  const value = displayValue(field, entry[key], ctx);
  return value == null ? '' : String(value);
}

/** The individual chip strings for a badge field: list items or resolved reference labels. */
function badgeValues(field, value, ctx) {
  if (!field) return [];
  if (field.kind === 'reference') {
    const resolve = (id) => (ctx?.resolveRef ? ctx.resolveRef(field.targetType, id).label : id);
    return toList(value).map(resolve).filter((s) => String(s).trim() !== '');
  }
  if (field.kind === 'list') return toList(value);
  // Any other kind contributes a single chip from its display string, when non-empty.
  const single = displayValue(field, value, ctx);
  return single != null && String(single).trim() !== '' ? [String(single)] : [];
}

/**
 * Render one entry as a summary card. `card` is the type's `summaryCard` descriptor
 * (may be absent/partial — the title falls back to the schema's `titleField`, and every
 * other part is simply omitted when unconfigured). Empty badges/rows collapse silently.
 */
export function renderSummaryCard(schema, entry, ctx) {
  const d = entry || {};
  const card = schema.summaryCard || {};
  const fields = fieldMap(schema);

  const titleKey = card.title || schema.titleField;
  const title = d[titleKey] || '(untitled)';

  let subtitle = '';
  if (card.subtitle) {
    const text = display(fields, card.subtitle, d, ctx);
    if (text.trim() !== '') subtitle = `<p class="summary-card-subtitle">${escapeHtml(text)}</p>`;
  }

  let badges = '';
  const chips = (card.badges || [])
    .flatMap((key) => badgeValues(fields.get(key), d[key], ctx))
    .map((v) => `<span class="summary-badge">${escapeHtml(v)}</span>`);
  if (chips.length) badges = `<div class="summary-card-badges">${chips.join('')}</div>`;

  let rows = '';
  const rowHtml = (card.rows || [])
    .map(({ label, key }) => {
      const value = display(fields, key, d, ctx);
      if (value.trim() === '') return '';
      return `<div class="summary-card-row"><span class="summary-row-label">${escapeHtml(
        label
      )}</span><span class="summary-row-value">${escapeHtml(value)}</span></div>`;
    })
    .filter(Boolean)
    .join('');
  if (rowHtml) rows = `<div class="summary-card-rows">${rowHtml}</div>`;

  // The card's open key is the entry's opaque doc id (findEntryByTypeId matches on `entry.id`).
  return `<button type="button" class="summary-card" data-index-entry="${escapeHtml(
    d.id ?? ''
  )}"><span class="summary-card-title">${escapeHtml(title)}</span>${subtitle}${badges}${rows}</button>`;
}

/**
 * Render a whole type as an index: every entry through `renderSummaryCard`, in a grid,
 * titled by the type's `label`. `entries` is the caller's active-entry list for the type.
 */
export function renderTypeIndex(type, entries, ctx) {
  const schema = getSchema(type);
  if (!schema) {
    console.warn(`renderTypeIndex: no schema for type "${type}"`);
    return '';
  }
  const list = entries || [];
  const heading = `<h1>${escapeHtml(schema.label || type)}</h1>`;
  if (list.length === 0) {
    return `${heading}<p class="muted summary-index-empty">No entries yet.</p>`;
  }
  const cards = list.map((entry) => renderSummaryCard(schema, entry, ctx)).join('');
  return `${heading}<div class="summary-index">${cards}</div>`;
}
