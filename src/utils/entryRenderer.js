/**
 * Codex — Entry Renderer (schema-driven).
 *
 * Renders an entry object straight to HTML for the Visual Preview, driven entirely by
 * the type's schema. No per-type branches. Image and reference resolution arrive via
 * an optional `ctx` (see fieldKinds.js), so this module stays free of build-tool
 * coupling and is unit-testable under plain Node.
 *
 *   metadata callout (showInMetadata fields) -> <h1> title -> hero image -> sections
 *
 * The hero keeps its special top-of-body placement (above the sections), but that placement
 * is driven by the registered `hero` component's `renderRead`.
 * Every other component — the gallery carousel included — renders inline where its field sits,
 * driven off `layout`: a 'break' component (gallery) emits its own block with no field heading.
 */

import { getSchema } from '../schema/schemaStore.js';
import { getKind, getLayout, displayValue, unknownKindPlaceholder } from '../schema/fieldKinds.js';
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

// The hero image (top of body), driven by the registered `hero` component's read view.
// '' when the type has no hero field or none is set — the layout stays the renderer's call.
function heroImage(schema, d, ctx) {
  const field = allFields(schema).find((f) => f.kind === 'hero');
  if (!field) return '';
  return getKind('hero').renderRead(field, d[field.key], ctx);
}

function renderSection(section, d, skip, ctx) {
  // Hero is top-placed above the sections (see heroImage); everything else renders in place.
  const fields = (section.fields || []).filter((f) => f.kind !== 'hero' && !skip.has(f.key));
  if (fields.length === 0) return '';
  const body = fields
    .map((field) => {
      const kind = getKind(field.kind);
      if (!kind) return `<h3>${escapeHtml(field.label)}</h3>${unknownKindPlaceholder(field.kind)}`;
      const html = kind.renderRead(field, d[field.key], ctx);
      // Break components (gallery) render as their own block, with no field heading.
      return getLayout(field.kind) === 'break' ? html : `<h3>${escapeHtml(field.label)}</h3>${html}`;
    })
    .join('');
  // A section whose only content is an empty break component (e.g. an empty gallery) collapses.
  if (body.trim() === '') return '';
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
  // The title is the <h1>, so it never repeats as a section field; likewise a schema's optional
  // idField (present only on the readable-id demo types) rides in the metadata callout, not the body.
  const skip = new Set([schema.titleField, schema.idField].filter((k) => k != null));

  return [
    metadataBox(schema, d, ctx),
    `<h1>${escapeHtml(d[schema.titleField] || schema.label)}</h1>`,
    heroImage(schema, d, ctx),
    ...(schema.sections || []).map((s) => renderSection(s, d, skip, ctx)),
  ].join('');
}
