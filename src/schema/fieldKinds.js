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
      if (field.multi) return referenceMultiInput(field, value, ctx);
      const entries = ctx?.listEntries ? ctx.listEntries(field.targetType) : null;
      if (!entries) {
        // No entry index available — keep the id editable rather than lose it.
        return `<input type="text" class="form-control" data-field-key="${field.key}" data-field-kind="reference" value="${escapeHtml(value)}">`;
      }
      const current = value == null ? '' : String(value);
      const options = [`<option value="">— none —</option>`];
      // A set-but-unlisted id (the target type has no entries yet, or the
      // referenced entry was deleted/archived) has no matching <option>, so the
      // select would render as "— none —" and the next save would silently wipe
      // it. Carry it as a selected option so the stored value survives edit → save.
      if (current !== '' && !entries.some((e) => e.id === current)) {
        const label = ctx?.resolveRef ? ctx.resolveRef(field.targetType, current).label : current;
        options.push(
          `<option value="${escapeHtml(current)}" selected>${escapeHtml(label)} (unavailable)</option>`
        );
      }
      options.push(
        ...entries.map(
          (e) => `<option value="${escapeHtml(e.id)}"${e.id === current ? ' selected' : ''}>${escapeHtml(e.label)}</option>`
        )
      );
      return `<select class="form-control" data-field-key="${field.key}" data-field-kind="reference" data-ref-target="${escapeHtml(field.targetType || '')}">${options.join('')}</select>`;
    },
    renderRead(field, value, ctx) {
      if (field.multi) return referenceMultiRead(field, value, ctx);
      if (value == null || String(value).trim() === '') return '<span class="muted">None</span>';
      return refLink(field.targetType, value, ctx);
    },
  },
};

/** A single reference as a link (resolvable) or muted span (missing). */
function refLink(targetType, id, ctx) {
  const resolved = ctx?.resolveRef ? ctx.resolveRef(targetType, id) : { label: id, exists: true };
  if (resolved.exists) {
    return `<a href="#" data-ref-type="${escapeHtml(targetType || '')}" data-ref-id="${escapeHtml(id)}">${escapeHtml(resolved.label)}</a>`;
  }
  return `<span class="muted-ref" title="entry not found">${escapeHtml(resolved.label)}</span>`;
}

/**
 * Multi-value reference input — a native <select multiple> over the target type's
 * entries. Any stored id no longer in the entry list (deleted/archived, or the type
 * has no entries yet) is carried as a selected "(unavailable)" option so it survives
 * edit → save, mirroring the single-value control. Falls back to a comma-separated
 * text input when no entry index is available (keeps the ids editable, never lost).
 */
function referenceMultiInput(field, value, ctx) {
  const target = field.targetType || '';
  const current = toList(value);
  const entries = ctx?.listEntries ? ctx.listEntries(target) : null;
  if (!entries) {
    return `<input type="text" class="form-control" data-field-key="${field.key}" data-field-kind="reference" data-multi="true" value="${escapeHtml(current.join(', '))}" placeholder="comma-separated ids">`;
  }
  const known = new Set(entries.map((e) => e.id));
  const selected = new Set(current);
  const options = [];
  for (const id of current) {
    if (known.has(id)) continue;
    const label = ctx?.resolveRef ? ctx.resolveRef(target, id).label : id;
    options.push(`<option value="${escapeHtml(id)}" selected>${escapeHtml(label)} (unavailable)</option>`);
  }
  options.push(
    ...entries.map(
      (e) => `<option value="${escapeHtml(e.id)}"${selected.has(e.id) ? ' selected' : ''}>${escapeHtml(e.label)}</option>`
    )
  );
  const size = Math.min(Math.max(options.length, 3), 8);
  return `<select multiple size="${size}" class="form-control" data-field-key="${field.key}" data-field-kind="reference" data-multi="true" data-ref-target="${escapeHtml(target)}">${options.join('')}</select>`;
}

/** Multi-value reference read view — the resolved targets as a comma-separated link list. */
function referenceMultiRead(field, value, ctx) {
  const ids = toList(value);
  if (ids.length === 0) return '<span class="muted">None</span>';
  return `<p class="ref-list">${ids.map((id) => refLink(field.targetType, id, ctx)).join(', ')}</p>`;
}

/** The registry entry for a kind, or null for media/unknown kinds. */
export function getKind(kind) {
  return fieldKinds[kind] || null;
}

/** A plain string for a field's value, for the metadata callout. */
export function displayValue(field, value, ctx) {
  if (field.kind === 'list') return toList(value).join(', ');
  if (field.kind === 'reference') {
    const resolve = (id) => (ctx?.resolveRef ? ctx.resolveRef(field.targetType, id).label : id);
    if (field.multi) return toList(value).map(resolve).join(', ');
    if (value == null || String(value).trim() === '') return '';
    return resolve(value);
  }
  return String(value ?? '');
}

/** Visible placeholder for a schema field whose kind we don't recognize. */
export function unknownKindPlaceholder(kind) {
  return `<div class="unknown-kind">unknown field kind: ${escapeHtml(kind)}</div>`;
}
