/**
 * Codex — Entry Renderer (schema-driven).
 *
 * Renders an entry object straight to HTML for the Visual Preview, driven entirely by
 * the type's schema. No per-type branches. Image and reference resolution arrive via
 * an optional `ctx` (see fieldKinds.js), so this module stays free of build-tool
 * coupling and is unit-testable under plain Node.
 *
 *   <h1> title -> hero image -> the flat field list
 *
 * A type is one ordered list of components (`schema.fields`) — there is no section wrapper.
 * A `heading` component is the only divider, emitting its own <h2> where the author placed it.
 * The hero keeps its special top-of-body placement (above the fields), driven by the registered
 * `hero` component's `renderRead`. Every other component renders inline where its field sits,
 * driven off `layout`: a 'break' component (heading, gallery, map) emits its own block with no
 * field heading; grid/full components get an <h3> field label.
 *
 * A heading is suppressed when everything from it up to the next heading renders empty — the
 * flat-list generalization of the old "a section with only an empty media component collapses".
 * So a heading only earns its place when the components beneath it have visible content.
 */

import { getSchema } from '../schema/schemaStore.js';
import { getKind, getLayout, unknownKindPlaceholder } from '../schema/fieldKinds.js';
import { escapeHtml, formatInline } from '../schema/inlineText.js';

// Re-exported for callers that still import it from here (e.g. main.js).
export { formatInline };

// The hero image (top of body), driven by the registered `hero` component's read view.
// '' when the type has no hero field or none is set — the layout stays the renderer's call.
function heroImage(schema, d, ctx) {
  const field = (schema.fields || []).find((f) => f.kind === 'hero');
  if (!field) return '';
  return getKind('hero').renderRead(field, d[field.key], ctx);
}

/** Render an entry of the given type straight to HTML. */
export function renderEntryHTML(type, data, ctx) {
  const schema = getSchema(type);
  if (!schema) {
    console.warn(`renderEntryHTML: no schema for type "${type}"`);
    return '';
  }
  const d = data || {};
  // The title is the <h1>, so it never repeats as a field; a schema's optional idField
  // (present only on the readable-id demo types) is identity, not content, so it never renders.
  const skip = new Set([schema.titleField, schema.idField].filter((k) => k != null));

  return [
    `<h1>${escapeHtml(d[schema.titleField] || schema.label)}</h1>`,
    heroImage(schema, d, ctx),                 // hero is top-placed, above the fields
    renderFields(schema, d, ctx, skip),
  ].join('');
}

// Render a non-heading component: media/break blocks stand alone; grid/full get an <h3> label.
function renderField(field, d, ctx) {
  const kind = getKind(field.kind);
  if (!kind) return `<h3>${escapeHtml(field.label)}</h3>${unknownKindPlaceholder(field.kind)}`;
  const html = kind.renderRead(field, d[field.key], ctx);
  return getLayout(field.kind) === 'break' ? html : `<h3>${escapeHtml(field.label)}</h3>${html}`;
}

/**
 * Walk the flat field list, grouping each heading with the run of components beneath it (up to the
 * next heading). The leading run (before any heading) always emits; a heading + its run emit only
 * when the run has visible content, so an author's heading over empty media collapses cleanly.
 * Hero is excluded here — it is top-placed by `heroImage`.
 */
function renderFields(schema, d, ctx, skip) {
  const fields = (schema.fields || []).filter((f) => f.kind !== 'hero' && !skip.has(f.key));
  let out = '';
  let heading = null; // pending heading markup; null while in the leading (ungated) run
  let run = '';
  const flush = () => {
    if (heading === null) out += run;
    else if (run.trim() !== '') out += heading + run;
    run = '';
  };
  for (const field of fields) {
    if (field.kind === 'heading') {
      flush();
      heading = getKind('heading').renderRead(field, d[field.key], ctx);
    } else {
      run += renderField(field, d, ctx);
    }
  }
  flush();
  return out;
}
