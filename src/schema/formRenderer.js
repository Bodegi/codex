/**
 * Codex — Generic form renderer.
 *
 * Renders a builder form straight from a type schema. Replaces the per-type
 * `render*Form` builders. A type is one ordered list of components (`schema.fields`) — no
 * section wrapper. Every component — media included — comes from the one registry; the
 * walker consults each component's `layout` to place it:
 *   - 'grid'  → a `.form-group` cell inside a `.form-grid`
 *   - 'full'  → a `.form-group form-grid-full` cell spanning the grid
 *   - 'break' → the component's own block, emitted between grids (escapes the grid)
 *
 * Break components (heading/hero/gallery/map) thus render inline where their field sits in
 * the schema, not as a trailing appended block. A `heading` renders its own <h2> divider —
 * the flat-list replacement for the old section header. Media roots carry `data-field-key`
 * so the builder can locate and `mount` them (see main.js).
 */

import { escapeHtml } from './inlineText.js';
import { getKind, getLayout, unknownKindPlaceholder } from './fieldKinds.js';

// A grid/full field: the control wrapped in a labelled `.form-group` cell.
function renderGridField(field, value, ctx, layout) {
  const kind = getKind(field.kind);
  const control = kind ? kind.renderInput(field, value, ctx) : unknownKindPlaceholder(field.kind);
  const full = layout === 'full' ? ' form-grid-full' : '';
  return `<div class="form-group${full}"><label>${escapeHtml(field.label)}</label>${control}</div>`;
}

/** Render the builder form for `schema` populated with `data`. */
export function renderForm(schema, data, ctx) {
  const d = data || {};
  const fields = schema?.fields || [];
  // Emit `.form-grid` runs around consecutive grid/full fields; a break component (heading, media)
  // closes the current grid, renders its own block, and the next grid field reopens one.
  let body = '';
  let gridOpen = false;
  for (const field of fields) {
    if (getLayout(field.kind) === 'break') {
      if (gridOpen) { body += '</div>'; gridOpen = false; }
      const kind = getKind(field.kind);
      body += kind ? kind.renderInput(field, d[field.key], ctx) : unknownKindPlaceholder(field.kind);
    } else {
      if (!gridOpen) { body += '<div class="form-grid">'; gridOpen = true; }
      body += renderGridField(field, d[field.key], ctx, getLayout(field.kind));
    }
  }
  if (gridOpen) body += '</div>';
  return body;
}
