/**
 * Codex — Generic form renderer.
 *
 * Renders a builder form straight from a type schema. A type is one ordered list of components
 * (`schema.fields`) — no section wrapper. Every component comes from the one registry.
 *
 * Each field is a **collapsible card**: a header (caret + label + a read-only value summary) over a
 * body holding the component's `renderInput` control. Cards are collapsed by default (body carries
 * the `hidden` attribute, so AT skips a shut card) so a tall component — the banner designer above
 * all — no longer forces a scroll past its whole editor to reach the next field. Toggling is wired
 * in main.js (`wireFieldCardToggles`), delegated on the form container. Media roots keep their
 * `data-field-key` so the builder can still locate and `mount` them; expanding just unhides them
 * (the map re-measures via its ResizeObserver — see mapComponent.js).
 *
 * A `heading` holds no entry data, so it renders as a plain non-collapsible divider (its <h2>), the
 * flat-list replacement for the old section header.
 */

import { escapeHtml } from './inlineText.js';
import { getKind, getLayout, unknownKindPlaceholder, displayValue, toList } from './fieldKinds.js';

const SUMMARY_MAX = 80;

/** A short read-only summary of a field's current value for the collapsed card head, or '' when empty. */
function valueSummary(field, value, ctx) {
  switch (field.kind) {
    case 'hero':
      return value ? 'Image set' : '';
    case 'gallery': {
      const n = toList(value).length;
      return n ? `${n} image${n === 1 ? '' : 's'}` : '';
    }
    case 'banner':
      return value && typeof value === 'object' && (value.base || (value.layers || []).length) ? 'Banner set' : '';
    case 'map':
      return value && typeof value === 'object' && value.mapImageId ? 'Map set' : '';
    default: {
      const s = displayValue(field, value, ctx);
      return s == null ? '' : String(s);
    }
  }
}

/** Truncate + escape a summary string for the card head. */
function summaryHtml(field, value, ctx) {
  const raw = valueSummary(field, value, ctx).trim();
  if (!raw) return '<span class="field-card-summary is-empty">—</span>';
  const clipped = raw.length > SUMMARY_MAX ? `${raw.slice(0, SUMMARY_MAX - 1)}…` : raw;
  return `<span class="field-card-summary">${escapeHtml(clipped)}</span>`;
}

/** One collapsible field card: head (label + value summary) over the component's input control. */
function fieldCard(field, value, ctx, open) {
  const kind = getKind(field.kind);
  const control = kind ? kind.renderInput(field, value, ctx) : unknownKindPlaceholder(field.kind);
  const bodyId = `fc-${escapeHtml(field.key)}`;
  return `<div class="field-card${open ? ' is-open' : ''}" data-field-card data-kind="${escapeHtml(field.kind)}" data-layout="${escapeHtml(getLayout(field.kind))}">
      <button type="button" class="field-card-head" data-field-toggle aria-expanded="${open ? 'true' : 'false'}" aria-controls="${bodyId}">
        <span class="field-card-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
        <span class="field-card-label">${escapeHtml(field.label || '(unnamed)')}</span>
        ${summaryHtml(field, value, ctx)}
      </button>
      <div class="field-card-body" id="${bodyId}"${open ? '' : ' hidden'}>${control}</div>
    </div>`;
}

/**
 * Render the builder form for `schema` populated with `data`. `expanded` is the Set of field keys
 * whose cards are open — passed so a card stays open across the mid-edit re-renders that
 * hero/gallery trigger on an image pick (the caller owns the Set; see main.js).
 */
export function renderForm(schema, data, ctx, expanded = new Set()) {
  const d = data || {};
  const fields = schema?.fields || [];
  let body = '';
  for (const field of fields) {
    if (field.kind === 'heading') {
      // A heading is a divider, not a value — render it inline, uncollapsible.
      const kind = getKind(field.kind);
      body += `<div class="field-card field-card--heading">${
        kind ? kind.renderInput(field, d[field.key], ctx) : unknownKindPlaceholder(field.kind)
      }</div>`;
    } else {
      body += fieldCard(field, d[field.key], ctx, expanded.has(field.key));
    }
  }
  return body;
}
