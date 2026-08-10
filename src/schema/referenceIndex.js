/**
 * Codex — Reference back-index (pure).
 *
 * The inverse of a reference field: given a target entry, which *other* entries point at it?
 * A reference field stores its target's id (single) or ids (multi) in `data[field.key]`, and a
 * dangling ref survives edit → save as a muted "(unavailable)" link (`fieldKinds.js`) — so an
 * author archiving an entry needs to see who links to it *before* the breakage spreads, entry
 * by entry, into the reader view.
 *
 * Walks entries × their schema's reference fields, mirroring how `searchIndex.js` walks
 * entries × searchable fields — DOM-free, Node-testable, fed `state.entryIndex` + `getSchema`
 * from `main.js`. Only **active** referencers count: an archived entry is already hidden from
 * readers, so its link isn't the visible breakage this warns about. The target excludes itself.
 */

import { toList } from './fieldKinds.js';

/** Every reference field in a schema whose target is `targetType`. */
function schemaRefFields(schema, targetType) {
  const out = [];
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) {
      if (field.kind === 'reference' && (field.targetType || '') === targetType) out.push(field);
    }
  }
  return out;
}

/** Does a reference field's stored value point at `targetId`? (multi = any element). */
function fieldRefsId(field, value, targetId) {
  if (field.multi) return toList(value).includes(targetId);
  return value != null && String(value) === targetId;
}

/** The display title of an entry, matching how the nav/search name it. */
function entryTitle(schema, entry) {
  return String(
    (schema.titleField && entry[schema.titleField]) || entry.name || entry.title || entry.id || '(untitled)'
  );
}

/**
 * The active entries that reference (targetType, targetId) through a reference field.
 *
 * @param {Object<string, Array>} byType  entries grouped by type (the live entry index)
 * @param {(type:string)=>object|null} getSchema  schema lookup for a type
 * @param {string} targetType  the archived entry's type
 * @param {string} targetId  the archived entry's id
 * @returns {Array<{type,id,title,fields:string[]}>}  one row per referencing entry; `fields`
 *          are the labels of the reference field(s) in that entry pointing here.
 */
export function referencesTo(byType, getSchema, targetType, targetId) {
  const refs = [];
  if (!targetType || !targetId) return refs;
  for (const type of Object.keys(byType || {})) {
    const schema = getSchema(type);
    if (!schema) continue;
    const fields = schemaRefFields(schema, targetType);
    if (!fields.length) continue;
    for (const entry of byType[type] || []) {
      if (!entry || entry.status === 'archived') continue;
      if (type === targetType && entry.id === targetId) continue; // an entry linking to itself isn't breakage
      const hits = fields.filter((f) => fieldRefsId(f, entry[f.key], targetId));
      if (hits.length) refs.push({ type, id: entry.id, title: entryTitle(schema, entry), fields: hits.map((f) => f.label || f.key) });
    }
  }
  return refs;
}

/**
 * A one-sentence warning naming who links to an entry being archived, for the confirm copy.
 * Empty string when nothing references it. Lists up to `max` titles, then "and N more".
 */
export function dependentsWarning(refs, { max = 5 } = {}) {
  const n = refs.length;
  if (!n) return '';
  const noun = n === 1 ? 'entry links' : 'entries link';
  const names = refs.slice(0, max).map((r) => r.title);
  const more = n > max ? `, and ${n - max} more` : '';
  return `${n} ${noun} here and will show a broken reference once it’s archived: ${names.join(', ')}${more}.`;
}
