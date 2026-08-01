/**
 * ATM10 Codex — Entry Renderer (schema-driven).
 *
 * Renders an entry object straight to HTML for the Visual Preview, driven entirely by
 * the type's schema. No per-type branches. Image and reference resolution arrive via
 * an optional `ctx` (see fieldKinds.js), so this module stays free of build-tool
 * coupling and is unit-testable under plain Node.
 *
 *   metadata callout (showInMetadata fields) -> <h1> title -> hero image -> sections
 *
 * Media fields (hero/gallery) are not rendered by the generic section loop: the hero
 * renders once at the top, and the gallery carousel is appended by the caller.
 */

import { getSchema } from '../schema/schemaStore.js';
import { getKind, MEDIA_KINDS, displayValue, unknownKindPlaceholder } from '../schema/fieldKinds.js';
import { escapeHtml, formatInline } from '../schema/inlineText.js';

// Re-exported for callers that still import it from here (e.g. main.js).
export { formatInline };

function allFields(schema) {
  return (schema.sections || []).flatMap((s) => s.fields || []);
}

// The metadata callout at the top of the preview.
function metadataBox(schema, d, ctx) {
  const rows = [['type', schema.type]];
  for (const field of allFields(schema)) {
    if (!field.showInMetadata) continue;
    const value = displayValue(field, d[field.key], ctx);
    if (value == null || String(value).trim() === '') continue;
    rows.push([field.label, value]);
  }
  const items = rows
    .map(
      ([k, v]) =>
        `<div class="meta-row"><span class="meta-key">${escapeHtml(k)}</span><span class="meta-val">${escapeHtml(v)}</span></div>`
    )
    .join('');
  return `<div class="metadata-box"><strong>Metadata</strong>${items}</div>`;
}

// The hero image (top of body), or '' when unset/unresolved.
function heroImage(schema, d, ctx) {
  const field = allFields(schema).find((f) => f.kind === 'hero');
  if (!field) return '';
  const id = d[field.key];
  const url = id && ctx?.resolveImage ? ctx.resolveImage(id) : null;
  if (!url) return '';
  return `<img class="entry-hero" src="${url}" alt="${escapeHtml(d[schema.titleField] || '')}">`;
}

function renderSection(section, d, skip, ctx) {
  const fields = (section.fields || []).filter((f) => !MEDIA_KINDS.has(f.kind) && !skip.has(f.key));
  if (fields.length === 0) return '';
  const body = fields
    .map((field) => {
      const kind = getKind(field.kind);
      const value = kind ? kind.renderRead(field, d[field.key], ctx) : unknownKindPlaceholder(field.kind);
      return `<h3>${escapeHtml(field.label)}</h3>${value}`;
    })
    .join('');
  return `<h2>${escapeHtml(section.title)}</h2>${body}`;
}

/** Render an entry of the given type straight to HTML. */
export function renderEntryHTML(type, data, ctx) {
  const schema = getSchema(type);
  if (!schema) {
    console.warn(`renderEntryHTML: no schema for type "${type}"`);
    return '';
  }
  const d = data || {};
  // The title is the <h1>; the id lives in the metadata callout — neither repeats as a section field.
  const skip = new Set([schema.idField, schema.titleField]);

  return [
    metadataBox(schema, d, ctx),
    `<h1>${escapeHtml(d[schema.titleField] || schema.label)}</h1>`,
    heroImage(schema, d, ctx),
    ...(schema.sections || []).map((s) => renderSection(s, d, skip, ctx)),
  ].join('');
}
