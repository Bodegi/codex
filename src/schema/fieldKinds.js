/**
 * Codex — Field-kind registry.
 *
 * One entry per pure field kind: `{ renderInput(field, value, ctx), renderRead(field, value, ctx) }`.
 * `renderInput` returns the form CONTROL (the caller wraps it in a labelled group);
 * `renderRead` returns the read-view BODY (the caller wraps it in an <h3> heading).
 *
 * Only the four pure kinds live here so this module carries no build-tool coupling
 * and is unit-testable under plain Node. Media kinds (hero/gallery) are Vite/DOM
 * coupled and are handled by the dedicated media components (see MEDIA_KINDS) — the
 * generic renderers skip them.
 *
 * `ctx` (optional) is the edge adapter for data this module must not import directly:
 *   ctx.resolveImage(id)      -> url | null      (pool images inside prose)
 *   ctx.listEntries(type)     -> [{ id, label }] (reference <select> options)
 *   ctx.resolveRef(type, id)  -> { label, exists }(reference read-view link)
 */

import { escapeHtml, formatInline } from './inlineText.js';

const MUTED_EMPTY = '<p class="muted">Not specified.</p>';

/** Media kinds handled outside the registry, by the dedicated media components. */
export const MEDIA_KINDS = new Set(['hero', 'gallery']);

/** Normalize a list value: array as-is, comma-string split, blank -> []. */
export function toList(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const fieldKinds = {
  text: {
    renderInput(field, value, _ctx) {
      const type = field.inputType || 'text';
      return `<input type="${type}" class="form-control" data-field-key="${field.key}" data-field-kind="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}">`;
    },
    renderRead(_field, value, _ctx) {
      if (value == null || String(value).trim() === '') return MUTED_EMPTY;
      return `<p>${escapeHtml(value)}</p>`;
    },
  },

  prose: {
    renderInput(field, value, _ctx) {
      return `<textarea class="form-control" data-field-key="${field.key}" data-field-kind="prose" rows="3">${escapeHtml(value)}</textarea>`;
    },
    renderRead(_field, value, ctx) {
      return formatInline(value, ctx?.resolveImage) || MUTED_EMPTY;
    },
  },

  list: {
    // One item per line. Kept deliberately simple: the value reader splits on
    // newlines, so there is no per-row DOM to wire.
    renderInput(field, value, _ctx) {
      return `<textarea class="form-control" data-field-key="${field.key}" data-field-kind="list" rows="3" placeholder="One per line">${escapeHtml(toList(value).join('\n'))}</textarea>`;
    },
    renderRead(_field, value, _ctx) {
      const items = toList(value);
      if (items.length === 0) return MUTED_EMPTY;
      return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    },
  },

  reference: {
    renderInput(field, value, ctx) {
      const entries = ctx?.listEntries ? ctx.listEntries(field.targetType) : null;
      if (!entries) {
        // No entry index available — keep the id editable rather than lose it.
        return `<input type="text" class="form-control" data-field-key="${field.key}" data-field-kind="reference" value="${escapeHtml(value)}">`;
      }
      const options = [`<option value="">— none —</option>`]
        .concat(
          entries.map(
            (e) => `<option value="${escapeHtml(e.id)}"${e.id === value ? ' selected' : ''}>${escapeHtml(e.label)}</option>`
          )
        )
        .join('');
      return `<select class="form-control" data-field-key="${field.key}" data-field-kind="reference" data-ref-target="${escapeHtml(field.targetType || '')}">${options}</select>`;
    },
    renderRead(field, value, ctx) {
      if (value == null || String(value).trim() === '') return '<span class="muted">None</span>';
      const resolved = ctx?.resolveRef
        ? ctx.resolveRef(field.targetType, value)
        : { label: value, exists: true };
      if (resolved.exists) {
        return `<a href="#" data-ref-type="${escapeHtml(field.targetType || '')}" data-ref-id="${escapeHtml(value)}">${escapeHtml(resolved.label)}</a>`;
      }
      return `<span class="muted-ref" title="entry not found">${escapeHtml(resolved.label)}</span>`;
    },
  },
};

/** The registry entry for a kind, or null for media/unknown kinds. */
export function getKind(kind) {
  return fieldKinds[kind] || null;
}

/** A plain string for a field's value, for the metadata callout. */
export function displayValue(field, value, ctx) {
  if (field.kind === 'list') return toList(value).join(', ');
  if (field.kind === 'reference') {
    if (value == null || String(value).trim() === '') return '';
    const resolved = ctx?.resolveRef ? ctx.resolveRef(field.targetType, value) : { label: value };
    return resolved.label;
  }
  return String(value ?? '');
}

/** Visible placeholder for a schema field whose kind we don't recognize. */
export function unknownKindPlaceholder(kind) {
  return `<div class="unknown-kind">unknown field kind: ${escapeHtml(kind)}</div>`;
}
