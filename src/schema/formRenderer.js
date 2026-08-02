/**
 * Codex — Generic form renderer.
 *
 * Renders a builder form straight from a type schema. Replaces the per-type
 * `render*Form` builders. Media fields (hero/gallery) are skipped here — they are
 * rendered by the dedicated media controls appended separately (see main.js).
 */

import { escapeHtml } from './inlineText.js';
import { getKind, MEDIA_KINDS, unknownKindPlaceholder } from './fieldKinds.js';

// Kinds that take the full grid width (tall / multi-row controls).
const FULL_WIDTH = new Set(['prose', 'list']);

function renderField(field, value, ctx) {
  const kind = getKind(field.kind);
  const control = kind ? kind.renderInput(field, value, ctx) : unknownKindPlaceholder(field.kind);
  const full = FULL_WIDTH.has(field.kind) ? ' form-grid-full' : '';
  return `<div class="form-group${full}"><label>${escapeHtml(field.label)}</label>${control}</div>`;
}

/** Render the builder form for `schema` populated with `data`. */
export function renderForm(schema, data, ctx) {
  const d = data || {};
  return (schema?.sections || [])
    .map((section) => {
      const fields = (section.fields || []).filter((f) => !MEDIA_KINDS.has(f.kind));
      if (fields.length === 0) return '';
      const body = fields.map((f) => renderField(f, d[f.key], ctx)).join('');
      return `<div class="form-section"><div class="section-header">${escapeHtml(section.title)}</div><div class="form-grid">${body}</div></div>`;
    })
    .join('');
}
