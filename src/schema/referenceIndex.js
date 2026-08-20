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
import { normalizeGroup } from './groupModel.js';

/** Every top-level reference field in a schema whose target is `targetType`. */
function schemaRefFields(schema, targetType) {
  return (schema.fields || []).filter(
    (field) => field.kind === 'reference' && (field.targetType || '') === targetType
  );
}

/**
 * Reference sub-fields nested one level inside a group whose target is `targetType`, each paired with
 * the group it lives in. A group's records each carry the sub-field's value, so a nested link is
 * invisible to the flat `schemaRefFields` walk — surfacing them here is what keeps an archive warning
 * honest about links buried in a group (the reason `reference` is an allowed inner kind, issue #52).
 */
function schemaGroupRefFields(schema, targetType) {
  const out = [];
  for (const field of schema.fields || []) {
    if (field.kind !== 'group') continue;
    for (const sub of field.fields || []) {
      if (sub.kind === 'reference' && (sub.targetType || '') === targetType) out.push({ group: field, sub });
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
    const groupFields = schemaGroupRefFields(schema, targetType);
    if (!fields.length && !groupFields.length) continue;
    for (const entry of byType[type] || []) {
      if (!entry || entry.status === 'archived') continue;
      if (type === targetType && entry.id === targetId) continue; // an entry linking to itself isn't breakage
      const labels = fields.filter((f) => fieldRefsId(f, entry[f.key], targetId)).map((f) => f.label || f.key);
      // A group hit names the group (not the buried sub-field) so the warning stays legible; a group
      // is listed once even if several of its records or sub-fields point here.
      for (const { group, sub } of groupFields) {
        const label = group.label || group.key;
        if (labels.includes(label)) continue;
        if (normalizeGroup(entry[group.key]).some((rec) => fieldRefsId(sub, rec[sub.key], targetId))) labels.push(label);
      }
      if (labels.length) refs.push({ type, id: entry.id, title: entryTitle(schema, entry), fields: labels });
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
