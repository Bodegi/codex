/**
 * Codex — Schema editor.
 *
 * The Types-tab authoring surface. This module owns two things kept deliberately apart:
 *
 *  1. Pure working-schema transforms (below) — add/remove/reorder of fields, plus key
 *     derivation. They take a working schema and return a NEW one (structuredClone), never
 *     mutating the input, so the DOM layer can hold one working copy and swap it wholesale.
 *     Pure + dependency-free => unit-testable under plain Node.
 *
 *  2. The editor DOM builder (added alongside) — renders the working schema as editable
 *     rows and reads the field-kind vocabulary from the registry.
 *
 * A type is one flat, ordered list of components (`schema.fields`) — there is no section
 * wrapper. A `heading` component is the only divider (added from the palette like any other
 * component). Field `key`s are unique per type — they are the storage keys entry data lives
 * under — so `deriveKey`/`allFieldKeys` work across the whole schema.
 */

import { escapeHtml } from '../schema/inlineText.js';
import { fieldKinds, emblemKinds } from '../schema/fieldKinds.js';
import { isBadgeField, isRowField } from '../utils/summaryCard.js';
import { isAllowedInnerKind } from '../schema/groupModel.js';
import { newId } from '../utils/id.js';

/** Kinds that take a free-text placeholder (media/reference/select/date/boolean don't). */
const PLACEHOLDER_KINDS = new Set(['text', 'prose', 'list', 'number']);

// Summary-card badge (chips) vs row (labelled scalar) eligibility lives in summaryCard.js — the one
// source of truth the renderer also guards on. The compose lists below filter by the same predicates.
/** The card's visual slot: kinds the registry can render as an emblem (hero image, banner). */
const EMBLEM_KINDS = new Set(emblemKinds());

/** Association modes a map marker can use; 'both' is the default. */
const ASSOCIATION_MODES = ['both', 'reference', 'label'];

/** Deep clone that keeps these helpers free of aliasing bugs. Schemas are JSON-able. */
function clone(schema) {
  return structuredClone(schema);
}

/** camelCase a human label into a storage-key base: "Material Palette" -> "materialPalette". */
export function slugToCamel(label) {
  const words = String(label ?? '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return 'field';
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

/**
 * A minimal, valid schema for a brand-new type: an opaque type id, a title field so entries
 * can be named, and `status: 'active'`. The entry id is the opaque `entry.id` doc key, not a
 * schema field, so there is no `idField`/id field here (contrast the demo fixture, which keeps
 * a readable id field by design). Passes `validateSchema`, so the author can Save immediately
 * and grow it from there.
 */
export function newTypeSchema(label) {
  return {
    type: newId(),
    label: String(label ?? '').trim() || 'New Type',
    icon: 'dot',
    titleField: 'title',
    status: 'active',
    fields: [{ key: 'title', label: 'Title', kind: 'text', placeholder: 'e.g. My Entry' }],
  };
}

/** Every field key in the type. */
export function allFieldKeys(schema) {
  return (schema.fields || []).map((f) => f.key);
}

/** A unique storage key derived from a label, avoiding any key already taken in the type. */
export function deriveKey(label, existingKeys = []) {
  const base = slugToCamel(label);
  const taken = new Set(existingKeys);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

/** Point the type's `titleField` at a field key — which field supplies an entry's display title. */
export function setTitleField(schema, key) {
  const next = clone(schema);
  next.titleField = key;
  return next;
}

/**
 * Keep `titleField` naming a real field. When its target was deleted (keys are immutable, so
 * deletion is the only way it dangles), repoint to the first remaining field — or clear it when the
 * type has no fields left. This is what lets an author delete the seed title field without wedging
 * Save behind a raw-JSON detour (issue #28 F7). A no-op (returns the input) when it still resolves.
 */
export function repointTitleField(schema) {
  const keys = allFieldKeys(schema);
  if (keys.includes(schema.titleField)) return schema;
  const next = clone(schema);
  // Repoint to the first field that can actually hold a title — skip headings (no entry data) and
  // the non-text kinds (banner/map/media resolve to empty/an id), falling back to any content field.
  const fields = schema.fields || [];
  const firstTextual = fields.find((f) => f.kind !== 'heading' && !NON_TEXT_KINDS.has(f.kind));
  const firstContent = firstTextual || fields.find((f) => f.kind !== 'heading');
  next.titleField = firstContent ? firstContent.key : '';
  return next;
}

/** Swap two entries of an array in place (helper for the reorder transforms). */
function swap(arr, a, b) {
  [arr[a], arr[b]] = [arr[b], arr[a]];
}

// --- Field transforms -------------------------------------------------------

/** Append a field to the flat list. `field` must already carry a unique `key`. */
export function addField(schema, field) {
  const next = clone(schema);
  next.fields.push(field);
  return next;
}

/** Remove a field. Non-destructive to entry data — orphaned values just stop rendering. */
export function removeField(schema, fieldIndex) {
  const next = clone(schema);
  next.fields.splice(fieldIndex, 1);
  return next;
}

/** Shallow-merge a patch into a field. The `key` is never changed here (it is immutable). */
export function updateField(schema, fieldIndex, patch) {
  const next = clone(schema);
  const field = next.fields[fieldIndex];
  const { key: _ignoredKey, ...safe } = patch;
  Object.assign(field, safe);
  return next;
}

/**
 * Set a field's label. A `provisional` field (freshly added, never saved — so no entry data
 * lives under its key yet) also re-derives its key from the new label, so the key chip tracks
 * "New Field" → "heraldry" instead of freezing at the placeholder-derived `newField` (see
 * `addField` provisional marking in main.js). A saved field keeps its immutable key. `deriveKey`
 * excludes the field's own current key so a no-op rename doesn't bump it to `label2`.
 */
export function updateFieldLabel(schema, fieldIndex, label) {
  const next = clone(schema);
  const field = next.fields[fieldIndex];
  const prevKey = field.key;
  field.label = label;
  if (field.provisional) {
    const others = next.fields.filter((_, i) => i !== fieldIndex).map((f) => f.key);
    field.key = deriveKey(label, others);
    if (field.key !== prevKey && next.summaryCard) migrateSummaryKey(next.summaryCard, prevKey, field.key);
  }
  return next;
}

// A provisional field's key tracks its label, so a rename changes the key its summary-card config
// points at. Follow the rename across every summary reference — title/subtitle/emblem are single
// keys, badges are keys, rows are {label, key} — so the pointer never dangles and Save can't
// silently drop the selection (issue #38).
function migrateSummaryKey(card, oldKey, newKey) {
  for (const slot of ['title', 'subtitle', 'emblem']) {
    if (card[slot] === oldKey) card[slot] = newKey;
  }
  if (Array.isArray(card.badges)) card.badges = card.badges.map((k) => (k === oldKey ? newKey : k));
  if (Array.isArray(card.rows)) card.rows = card.rows.map((r) => (r.key === oldKey ? { ...r, key: newKey } : r));
}

/**
 * A clone with every `provisional` marker dropped — the persist form of a working schema.
 * Provisional is an in-editor-only flag (a field's key still tracks its label); once saved the
 * key is permanent, so it must never land in stored data.
 */
export function stripProvisional(schema) {
  const next = clone(schema);
  for (const f of next.fields || []) {
    delete f.provisional;
    // A group's sub-fields carry the same in-editor-only marker — strip them too, or a provisional
    // sub-key would land in stored data and keep tracking its label after save.
    if (f.kind === 'group' && Array.isArray(f.fields)) for (const sub of f.fields) delete sub.provisional;
  }
  return next;
}

/**
 * Merge a patch into a field's `association` config (the map kind).
 * Nested + merge-based so partial edits (mode alone, refType alone) compose without clobbering the
 * sibling key, which a plain `updateField({ association })` would.
 */
export function updateFieldAssociation(schema, fieldIndex, patch) {
  const next = clone(schema);
  const field = next.fields[fieldIndex];
  field.association = { ...(field.association || {}), ...patch };
  return next;
}

/**
 * Merge a patch into the type-level `summaryCard` descriptor (see summaryCard.js) — the
 * fields shown when the type is browsed as an index. Nested + merge-based so partial edits
 * (title alone, badges alone) compose without clobbering the sibling keys.
 */
export function updateSummaryCard(schema, patch) {
  const next = clone(schema);
  next.summaryCard = { ...(next.summaryCard || {}), ...patch };
  return next;
}

/** Move a field up (delta -1) or down (delta +1) in the flat list. */
export function moveField(schema, fieldIndex, delta) {
  const target = fieldIndex + delta;
  const fields = schema.fields || [];
  if (target < 0 || target >= fields.length) return schema; // clamp at the ends
  const next = clone(schema);
  swap(next.fields, fieldIndex, target);
  return next;
}

/**
 * Move a field to an arbitrary position in the flat list (the drag-and-drop path; Up/Down handles
 * the single-step case). `toFi` is the insertion index in the ORIGINAL ordering; the splice math
 * accounts for the source slot vanishing on a downward move. A no-op move returns the input.
 */
export function moveFieldTo(schema, fromFi, toFi) {
  const fields = schema.fields || [];
  if (fromFi < 0 || fromFi >= fields.length) return schema;
  if (toFi === fromFi || toFi === fromFi + 1) return schema; // no-op
  const next = clone(schema);
  const [field] = next.fields.splice(fromFi, 1);
  let idx = toFi;
  if (fromFi < toFi) idx -= 1; // the removed slot shifted everything after it
  idx = Math.max(0, Math.min(idx, next.fields.length));
  next.fields.splice(idx, 0, field);
  return next;
}

// --- Sub-field transforms (a group's one-level sub-schema) -------------------
// A group field carries its sub-schema on `field.fields`. These mirror the top-level field
// transforms, scoped to one group by its field index (`fi`) — new copies, never mutating the input.

/** The sub-fields of the group at `fi`, or [] when it has none / isn't a group. */
function subFieldsOf(schema, fi) {
  return schema.fields?.[fi]?.fields || [];
}

/** Append a sub-field to a group's sub-schema. `subField` must already carry a unique sub-key. */
export function addSubField(schema, fi, subField) {
  const next = clone(schema);
  const group = next.fields[fi];
  group.fields = Array.isArray(group.fields) ? group.fields : [];
  group.fields.push(subField);
  return next;
}

/** Remove a sub-field from a group's sub-schema. */
export function removeSubField(schema, fi, si) {
  const next = clone(schema);
  next.fields[fi].fields.splice(si, 1);
  return next;
}

/** Shallow-merge a patch into a sub-field. The sub-key is never changed here (it is immutable). */
export function updateSubField(schema, fi, si, patch) {
  const next = clone(schema);
  const sub = next.fields[fi].fields[si];
  const { key: _ignoredKey, ...safe } = patch;
  Object.assign(sub, safe);
  return next;
}

/**
 * Set a sub-field's label. A `provisional` sub-field (freshly added, never saved) also re-derives its
 * key from the label — unique within the group — mirroring `updateFieldLabel` at the top level.
 */
export function updateSubFieldLabel(schema, fi, si, label) {
  const next = clone(schema);
  const sub = next.fields[fi].fields[si];
  sub.label = label;
  if (sub.provisional) {
    const others = next.fields[fi].fields.filter((_, i) => i !== si).map((f) => f.key);
    sub.key = deriveKey(label, others);
  }
  return next;
}

/** Move a sub-field up (delta -1) or down (delta +1) within its group's sub-schema. */
export function moveSubField(schema, fi, si, delta) {
  const subs = subFieldsOf(schema, fi);
  const target = si + delta;
  if (target < 0 || target >= subs.length) return schema; // clamp at the ends
  const next = clone(schema);
  swap(next.fields[fi].fields, si, target);
  return next;
}

/**
 * Move a top-level field INTO a group's sub-schema (the field vanishes from the top level and becomes
 * a repeated component). Only an allowed inner kind can move in; the key is kept unless it collides
 * within the group. `provisional` is preserved: it means "never saved, so the key still tracks the
 * label" — a fact moving doesn't change, and dropping it here froze a still-placeholder key (e.g. a
 * just-added banner's `newField`) so it stopped following renames. A no-op for a bad index or a
 * non-group target.
 */
export function moveFieldIntoGroup(schema, fromFi, groupFi) {
  const fields = schema.fields || [];
  const field = fields[fromFi];
  const group = fields[groupFi];
  if (!field || !group || group.kind !== 'group' || fromFi === groupFi) return schema;
  if (!isAllowedInnerKind(field.kind)) return schema; // this kind can't be nested
  const next = clone(schema);
  const [moved] = next.fields.splice(fromFi, 1);
  const gIdx = fromFi < groupFi ? groupFi - 1 : groupFi; // the splice shifted the group if it was after
  const g = next.fields[gIdx];
  g.fields = Array.isArray(g.fields) ? g.fields : [];
  const groupKeys = g.fields.map((f) => f.key);
  if (groupKeys.includes(moved.key)) moved.key = deriveKey(moved.label || moved.key, groupKeys);
  g.fields.push(moved);
  return next;
}

/**
 * Move a sub-field OUT of a group to the top level, inserted just after the group. The key is kept
 * unless it collides at the top level; `provisional` is preserved (same reasoning as
 * moveFieldIntoGroup — a never-saved key keeps tracking its label across the move). No-op for a bad
 * index.
 */
export function moveSubFieldOut(schema, groupFi, si) {
  const group = schema.fields?.[groupFi];
  if (!group || !Array.isArray(group.fields) || !group.fields[si]) return schema;
  const next = clone(schema);
  const [moved] = next.fields[groupFi].fields.splice(si, 1);
  const topKeys = next.fields.map((f) => f.key);
  if (topKeys.includes(moved.key)) moved.key = deriveKey(moved.label || moved.key, topKeys);
  next.fields.splice(groupFi + 1, 0, moved);
  return next;
}

// --- DOM: editor markup -----------------------------------------------------

/**
 * A field's kind control: a chip showing the current component's icon + human name, opening the
 * palette on click (see components/componentPalette.js) rather than exposing the raw kind key.
 */
function kindChip(field, at, se = 'field-kind') {
  const def = fieldKinds[field.kind] || {};
  const title = def.title || field.kind;
  return `<button type="button" class="se-input se-kind se-kind-chip" data-se="${se}" ${at} title="Change component">
      <span class="se-kind-icon" aria-hidden="true">${def.icon || ''}</span><span class="se-kind-name">${escapeHtml(title)}</span>
    </button>`;
}

function typeOptions(types, selected) {
  return types
    .map((t) => `<option value="${escapeHtml(t.type)}"${t.type === selected ? ' selected' : ''}>${escapeHtml(t.label)}</option>`)
    .join('');
}

function targetOptions(types, selected) {
  return ['<option value="">— target type —</option>']
    .concat(
      types.map(
        (t) => `<option value="${escapeHtml(t.type)}"${t.type === selected ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
      )
    )
    .join('');
}

function assocModeOptions(selected) {
  const mode = selected || 'both';
  return ASSOCIATION_MODES.map(
    (m) => `<option value="${m}"${m === mode ? ' selected' : ''}>link: ${m}</option>`
  ).join('');
}

/**
 * One labelled control in a field's extras row: a visible `<label>` tied to the control by id, plus
 * inline helper text (`aria-describedby`) explaining what it does. The help is a visible sibling
 * rather than a hover `title` on purpose — a `title` is hover-only and invisible to touch and AT.
 * `controlHtml` must carry `id="${id}"` and `aria-describedby="${id}-help"`.
 */
function subField(id, labelText, controlHtml, helpText) {
  return `
    <div class="se-sub-field">
      <label class="se-sub-label" for="${id}">${escapeHtml(labelText)}</label>
      ${controlHtml}
      <span class="se-sub-help" id="${id}-help">${escapeHtml(helpText)}</span>
    </div>`;
}

// The "Allow multiple" toggle — shared by select and reference (top-level and group sub-fields).
// Checking it re-renders the row (multi is structural) so the dependent "Display as" control
// appears/disappears. `se` names the intent tag: 'field-multi' top-level, 'sub-multi' inside a group.
function multiCheckbox(field, id, at, helpText, se = 'field-multi') {
  return `
    <div class="se-sub-field se-sub-field-check">
      <label class="se-meta"><input type="checkbox" id="${id('multi')}" aria-describedby="${id('multi')}-help" data-se="${se}" ${at}${field.multi ? ' checked' : ''}> Allow multiple</label>
      <span class="se-sub-help" id="${id('multi')}-help">${escapeHtml(helpText)}</span>
    </div>`;
}

// How several values read in the entry view — shown for any array-valued field (list, or a
// multi select/reference). Mirrors fieldKinds' `displayMode`: default 'list'.
const DISPLAY_MODES = [
  ['list', 'Bulleted list'],
  ['tags', 'Tags'],
  ['inline', 'Inline text'],
];
function displayControl(field, id, at, se = 'field-display') {
  const mode = ['list', 'tags', 'inline'].includes(field.display) ? field.display : 'list';
  const opts = DISPLAY_MODES.map(
    ([v, label]) => `<option value="${v}"${v === mode ? ' selected' : ''}>${label}</option>`
  ).join('');
  return subField(
    id('display'),
    'Display as',
    `<select id="${id('display')}" aria-describedby="${id('display')}-help" class="se-input se-sub" data-se="${se}" ${at}>${opts}</select>`,
    'How several values read in the entry: a bulleted list, pills, or inline text.'
  );
}

// Sub-field kinds simple enough to head a group record (a scalar the record label can stringify).
// Banner/prose/reference/boolean don't read as a clean title, so they aren't offered for `itemLabel`.
const ITEM_LABEL_KINDS = new Set(['text', 'select', 'number', 'date']);

/** The "Item label" picker: which sub-field titles each record card, or a positional "Item N". */
function itemLabelControl(field, fi) {
  const subs = Array.isArray(field.fields) ? field.fields : [];
  const titleable = subs.filter((f) => ITEM_LABEL_KINDS.has(f.kind));
  if (!titleable.length) return '';
  const id = `se-${escapeHtml(field.key)}-itemlabel`;
  const opts = [`<option value="">— item number —</option>`]
    .concat(
      titleable.map(
        (f) => `<option value="${escapeHtml(f.key)}"${f.key === field.itemLabel ? ' selected' : ''}>${escapeHtml(f.label || f.key)}</option>`
      )
    )
    .join('');
  return subField(
    id,
    'Item label',
    `<select id="${id}" aria-describedby="${id}-help" class="se-input se-sub" data-se="group-itemlabel" data-fi="${fi}">${opts}</select>`,
    'Which sub-field titles each item — otherwise items are numbered.'
  );
}

/**
 * One sub-field row inside a group's sub-schema editor: a compact analog of `fieldRow` (kind chip +
 * label + key + the kind's own config controls + reorder/remove), scoped to the group `fi` and the
 * sub-index `si`. Reorder is Up/Down only — no drag — to keep the nested editor simple.
 */
function subFieldRow(field, fi, sub, si, subCount, types) {
  const at = `data-fi="${fi}" data-si="${si}"`;
  const id = (control) => `se-${escapeHtml(field.key)}-sub-${si}-${escapeHtml(control)}`;
  const extras = [];
  if (PLACEHOLDER_KINDS.has(sub.kind)) {
    extras.push(
      subField(
        id('placeholder'),
        'Placeholder',
        `<input id="${id('placeholder')}" aria-describedby="${id('placeholder')}-help" class="se-input se-sub" data-se="sub-placeholder" ${at} placeholder="e.g. War banner" value="${escapeHtml(sub.placeholder || '')}">`,
        'Faint example text shown while the input is empty.'
      )
    );
  }
  if (sub.kind === 'select') {
    const optionsText = escapeHtml((Array.isArray(sub.options) ? sub.options : []).join('\n'));
    extras.push(
      subField(
        id('options'),
        'Options',
        `<textarea id="${id('options')}" aria-describedby="${id('options')}-help" class="se-input se-sub se-options" data-se="sub-options" ${at} rows="3" placeholder="One option per line">${optionsText}</textarea>`,
        'The fixed choices an author picks from — one per line.'
      )
    );
    extras.push(multiCheckbox(sub, id, at, 'Let an author pick several options instead of just one.', 'sub-multi'));
    if (sub.multi) extras.push(displayControl(sub, id, at, 'sub-display'));
  }
  if (sub.kind === 'list') {
    extras.push(displayControl(sub, id, at, 'sub-display'));
  }
  if (sub.kind === 'reference') {
    extras.push(
      subField(
        id('target'),
        'Links to',
        `<select id="${id('target')}" aria-describedby="${id('target')}-help" class="se-input se-sub" data-se="sub-target" ${at}>${targetOptions(types, sub.targetType)}</select>`,
        'The type whose entries this field can point to.'
      )
    );
    extras.push(multiCheckbox(sub, id, at, 'Let one entry link to several targets instead of just one.', 'sub-multi'));
    if (sub.multi) extras.push(displayControl(sub, id, at, 'sub-display'));
  }
  return `
    <div class="se-subfield" ${at} data-key="${escapeHtml(sub.key)}">
      <div class="se-subfield-head">
        ${kindChip(sub, at, 'sub-kind')}
        <input class="se-input se-label se-sub-label-input" data-se="sub-label" ${at} value="${escapeHtml(sub.label || '')}" placeholder="Field label">
        <code class="se-key" title="storage key (fixed)">${escapeHtml(sub.key)}</code>
        <button type="button" class="se-nudge" data-se="sub-up" ${at}${si === 0 ? ' disabled' : ''} title="Move up" aria-label="Move up">▲</button>
        <button type="button" class="se-nudge" data-se="sub-down" ${at}${si === subCount - 1 ? ' disabled' : ''} title="Move down" aria-label="Move down">▼</button>
        <button type="button" class="se-nudge" data-se="sub-out" ${at} title="Move out to top level" aria-label="Move out of group">⤴</button>
        <button type="button" class="se-nudge se-danger" data-se="sub-remove" ${at} title="Remove field" aria-label="Remove field">×</button>
      </div>
      <div class="se-subfield-extras">${extras.join('')}</div>
    </div>`;
}

/**
 * A group field's sub-schema editor: the ordered sub-field list, an "add component" button (which
 * opens the palette restricted to the inner allow-list), and the item-label picker. Rendered inside
 * the group's own field-row extras.
 */
function groupSubSchemaBlock(field, fi, types) {
  const subs = Array.isArray(field.fields) ? field.fields : [];
  const rows = subs.map((sub, si) => subFieldRow(field, fi, sub, si, subs.length, types)).join('');
  const body = rows || '<p class="se-summary-none">No components yet — add one below.</p>';
  return `
    <div class="se-subschema">
      <div class="se-subschema-head">Repeated components <span class="muted">(each item is one of these)</span></div>
      <div class="se-subfields">${body}</div>
      <button type="button" class="se-btn se-add se-sub-add" data-se="sub-add" data-fi="${fi}">+ add component</button>
      ${itemLabelControl(field, fi)}
    </div>`;
}

/**
 * The "Move into group" control for a top-level field: a select of the schema's groups. Shown only for
 * a field that can actually be nested — an allowed inner kind, not the title field (its value titles
 * the entry), when at least one group exists. `groups` is [{ fi, label }].
 */
function moveIntoControl(field, fi, groups, titleField) {
  if (!groups.length || !isAllowedInnerKind(field.kind) || field.key === titleField) return '';
  const id = `se-${escapeHtml(field.key)}-into`;
  const opts = ['<option value="">— move into group —</option>']
    .concat(groups.map((g) => `<option value="${g.fi}">${escapeHtml(g.label)}</option>`))
    .join('');
  return subField(
    id,
    'Move into group',
    `<select id="${id}" aria-describedby="${id}-help" class="se-input se-sub" data-se="field-into-group" data-fi="${fi}">${opts}</select>`,
    'Nest this component inside a group so it repeats per item. Its current entry data is left behind.'
  );
}

function fieldRow(field, fi, types, expanded, groups = [], titleField = '') {
  const at = `data-fi="${fi}"`;
  const id = (control) => `se-${escapeHtml(field.key)}-${control}`;
  // Second line holds only the controls relevant to this field's kind — each labelled + described.
  const extras = [];
  if (PLACEHOLDER_KINDS.has(field.kind)) {
    extras.push(
      subField(
        id('placeholder'),
        'Placeholder',
        `<input id="${id('placeholder')}" aria-describedby="${id('placeholder')}-help" class="se-input se-sub" data-se="field-placeholder" ${at} placeholder="e.g. My Entry" value="${escapeHtml(field.placeholder || '')}">`,
        'Faint example text shown while the input is empty.'
      )
    );
  }
  if (field.kind === 'select') {
    const optionsText = escapeHtml((Array.isArray(field.options) ? field.options : []).join('\n'));
    extras.push(
      subField(
        id('options'),
        'Options',
        `<textarea id="${id('options')}" aria-describedby="${id('options')}-help" class="se-input se-sub se-options" data-se="field-options" ${at} rows="3" placeholder="One option per line">${optionsText}</textarea>`,
        'The fixed choices an author picks from — one per line.'
      )
    );
    extras.push(multiCheckbox(field, id, at, 'Let an author pick several options instead of just one.'));
    if (field.multi) extras.push(displayControl(field, id, at));
  }
  if (field.kind === 'list') {
    extras.push(displayControl(field, id, at));
  }
  if (field.kind === 'reference') {
    extras.push(
      subField(
        id('target'),
        'Links to',
        `<select id="${id('target')}" aria-describedby="${id('target')}-help" class="se-input se-sub" data-se="field-target" ${at}>${targetOptions(types, field.targetType)}</select>`,
        'The type whose entries this field can point to.'
      )
    );
    extras.push(multiCheckbox(field, id, at, 'Let one entry link to several targets instead of just one.'));
    if (field.multi) extras.push(displayControl(field, id, at));
  }
  if (field.kind === 'group') {
    extras.push(groupSubSchemaBlock(field, fi, types));
  }
  if (field.kind === 'map') {
    // Per-field association config: how a marker links to an entry. The
    // target-type picker only applies when the mode allows a reference ('both' / 'reference').
    const assoc = field.association || {};
    const mode = assoc.mode || 'both';
    extras.push(
      subField(
        id('assoc-mode'),
        'Marker link',
        `<select id="${id('assoc-mode')}" aria-describedby="${id('assoc-mode')}-help" class="se-input se-sub" data-se="field-assoc-mode" ${at}>${assocModeOptions(mode)}</select>`,
        'How a map marker ties to an entry: by reference, by free-text label, or both.'
      )
    );
    if (mode !== 'label') {
      extras.push(
        subField(
          id('assoc-target'),
          'Marker target',
          `<select id="${id('assoc-target')}" aria-describedby="${id('assoc-target')}-help" class="se-input se-sub" data-se="field-assoc-target" ${at}>${targetOptions(types, assoc.refType)}</select>`,
          'The type whose entries a marker can reference.'
        )
      );
    }
  }

  extras.push(moveIntoControl(field, fi, groups, titleField));

  // A heading stores no entry data, so its storage key is meaningless to show; every other
  // component surfaces its fixed key. The label input doubles as the heading's rendered text.
  const keyChip = field.kind === 'heading' ? '' : `<code class="se-key" title="storage key (fixed)">${escapeHtml(field.key)}</code>`;
  const def = fieldKinds[field.kind] || {};
  const titlePreview = escapeHtml(field.label || (field.kind === 'heading' ? '(unnamed heading)' : '(unnamed field)'));
  const bodyId = id('body');
  // The card collapses to its head (grip + a disclosure toggle summarising kind + label, then key +
  // reorder/remove) so a deep type isn't a wall of open editors. The toggle is its OWN button — the
  // reorder/remove/drag controls sit beside it, never nested inside it (no button-in-button). The
  // body is `hidden` (not just CSS-collapsed) when shut so AT skips it. Reorder nudges keep their
  // aria-labels — they're the keyboard/AT path the aria-hidden drag handle can't be.
  return `
    <div class="se-field${expanded ? ' is-open' : ''}" ${at} data-key="${escapeHtml(field.key)}" data-drop="field" data-kind="${escapeHtml(field.kind)}">
      <div class="se-field-head">
        <span class="se-drag" ${at} draggable="true" data-drag="field" title="Drag to reorder" aria-hidden="true">⠿</span>
        <button type="button" class="se-card-toggle" data-se-toggle aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${bodyId}">
          <span class="se-card-caret" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
          <span class="se-kind-icon" aria-hidden="true">${def.icon || ''}</span>
          <span class="se-card-title">${titlePreview}</span>
        </button>
        <span class="se-head-end">
          ${keyChip}
          <button type="button" class="se-nudge" data-se="field-up" ${at} title="Move up" aria-label="Move up">▲</button>
          <button type="button" class="se-nudge" data-se="field-down" ${at} title="Move down" aria-label="Move down">▼</button>
          <button type="button" class="se-nudge se-danger se-remove" data-se="field-remove" ${at} title="Remove field" aria-label="Remove field">×</button>
        </span>
      </div>
      <div class="se-field-body" id="${bodyId}"${expanded ? '' : ' hidden'}>
        <div class="se-field-type">${kindChip(field, at)}</div>
        <input class="se-input se-label" data-se="field-label" ${at} value="${escapeHtml(field.label || '')}" placeholder="${field.kind === 'heading' ? 'Heading text' : 'Field label'}">
        <div class="se-field-extras">${extras.join('')}</div>
      </div>
    </div>`;
}

/** The type's ordered field list. */
function flatFields(schema) {
  return schema.fields || [];
}

/** Content fields only — headings hold no entry data, so they can't be a title/summary source. */
function contentFields(schema) {
  return flatFields(schema).filter((f) => f.kind !== 'heading');
}

// Kinds with no single textual value — invalid as a title/subtitle source (they'd resolve to an
// empty string or an opaque id via displayValue). The badge/row summary slots filter by their own
// kind sets, so this only gates the single-value title/subtitle picks.
const NON_TEXT_KINDS = new Set(['banner', 'map', 'hero', 'gallery']);
function textSourceFields(schema) {
  return contentFields(schema).filter((f) => !NON_TEXT_KINDS.has(f.kind));
}

/**
 * Options for the type-level "Title field" select. Unlike the summary picks there is no "none"
 * choice — `titleField` is required. When it currently dangles (no fields, or a just-deleted
 * target before auto-repoint runs), a disabled placeholder holds the slot so the control never
 * silently commits to the wrong field.
 */
function titleFieldOptions(fields, selected) {
  const known = fields.some((f) => f.key === selected);
  const placeholder = known
    ? ''
    : `<option value="" disabled selected>${fields.length ? '— pick a field —' : '— add a field first —'}</option>`;
  return (
    placeholder +
    fields
      .map(
        (f) =>
          `<option value="${escapeHtml(f.key)}"${f.key === selected ? ' selected' : ''}>${escapeHtml(f.label || f.key)}</option>`
      )
      .join('')
  );
}

/** A field-key <select>'s options, with a leading "none/default" choice. */
function fieldPickOptions(fields, selected, noneLabel) {
  return [`<option value="">${escapeHtml(noneLabel)}</option>`]
    .concat(
      fields.map(
        (f) =>
          `<option value="${escapeHtml(f.key)}"${f.key === selected ? ' selected' : ''}>${escapeHtml(f.label || f.key)}</option>`
      )
    )
    .join('');
}

/**
 * A drag-to-compose control for one summary-card slot (badges or rows). Every eligible field is a
 * row carrying a checkbox (membership) AND a drag handle (order), so a single list expresses both —
 * matching the field-list idiom instead of the old orderless checkbox grid (issue #28 F2). Selected
 * fields lead in their saved order; the rest follow in schema order. The live selection is always
 * derived from the *checked* rows in DOM order (`summarySelectionPatch`), so a reorder and a toggle
 * feed back through the same path. `seType` tags the container so the drop handler knows which slot.
 */
function summaryComposeList(fields, selectedKeys, seType) {
  if (fields.length === 0) return '<span class="se-summary-none">no eligible fields</span>';
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const chosen = selectedKeys.filter((k) => byKey.has(k)); // saved order, dropping any stale key
  const rest = fields.filter((f) => !chosen.includes(f.key)).map((f) => f.key);
  const set = new Set(chosen);
  const rows = [...chosen, ...rest]
    .map((k) => {
      const f = byKey.get(k);
      const label = escapeHtml(f.label || f.key);
      return `<div class="se-summary-item">
          <span class="se-drag" data-summary-drag draggable="true" title="Drag to reorder" aria-hidden="true">⠿</span>
          <label class="se-summary-check"><input type="checkbox" data-se="${seType}" data-key="${escapeHtml(f.key)}" data-label="${label}"${set.has(f.key) ? ' checked' : ''}> ${label}</label>
        </div>`;
    })
    .join('');
  return `<div class="se-summary-order" data-summary-order="${seType}">${rows}</div>`;
}

/**
 * The type-level "Summary card" config — which fields form the card face when the type is
 * browsed as an index (summaryCard.js). Title/subtitle are single-field picks; badges
 * (list/reference) and rows (text/prose) are multi-select checkbox groups.
 */
export function summaryCardBlock(schema) {
  const card = schema.summaryCard || {};
  const fields = contentFields(schema);
  const textFields = textSourceFields(schema); // single-value title/subtitle picks only
  const emblemFields = fields.filter((f) => EMBLEM_KINDS.has(f.kind));
  const badgeFields = fields.filter(isBadgeField);
  const rowFields = fields.filter(isRowField);
  const rowKeys = (card.rows || []).map((r) => r.key);
  // The emblem pick only appears once the type has an emblem-capable field (a banner or hero) to
  // point at — no slot for a type that can't fill it.
  const emblemPick = emblemFields.length
    ? `<label class="se-summary-pick">Emblem
          <select class="se-input" data-se="summary-emblem">${fieldPickOptions(emblemFields, card.emblem || '', '— none —')}</select>
        </label>`
    : '';
  return `
    <div class="se-summary">
      <div class="se-summary-head">Summary card</div>
      <p class="se-summary-hint">The fields shown when this type is browsed as an index — a grid of cards, one per entry.</p>
      <div class="se-summary-picks">
        <label class="se-summary-pick">Title
          <select class="se-input" data-se="summary-title">${fieldPickOptions(textFields, card.title || '', '— use title field —')}</select>
        </label>
        <label class="se-summary-pick">Subtitle
          <select class="se-input" data-se="summary-subtitle">${fieldPickOptions(textFields, card.subtitle || '', '— none —')}</select>
        </label>
        ${emblemPick}
      </div>
      <div class="se-summary-group">
        <span class="se-summary-label">Badges <em>(list / reference fields → chips)</em></span>
        ${summaryComposeList(badgeFields, card.badges || [], 'summary-badge')}
      </div>
      <div class="se-summary-group">
        <span class="se-summary-label">Rows <em>(text fields → labelled rows)</em></span>
        ${summaryComposeList(rowFields, rowKeys, 'summary-row')}
      </div>
    </div>`;
}

/**
 * Build the schema-editor markup for a working schema. `types` is the list from
 * listTypes() (for the type picker + reference targets); `errors` are validation
 * messages to surface after a blocked save. `expanded` is the Set of field keys whose cards are
 * open; `previewMode` (null | 'rendered' | 'raw') reflects the live-preview pane so the Preview
 * toggle reads correctly across rebuilds.
 */
export function renderSchemaEditor(
  schema,
  { types, editingType, errors = [], isNewDraft = false, expanded = new Set(), previewMode = null, canHistory = false }
) {
  const errorBlock = errors.length
    ? `<div class="se-errors">${errors.map((e) => `<div>${escapeHtml(e)}</div>`).join('')}</div>`
    : '';
  // Groups a top-level field can be moved into (their index + display label).
  const groups = flatFields(schema)
    .map((f, fi) => ({ fi, f }))
    .filter((x) => x.f.kind === 'group')
    .map((x) => ({ fi: x.fi, label: x.f.label || x.f.key }));
  const fieldRows = flatFields(schema)
    .map((f, fi) => fieldRow(f, fi, types, expanded.has(f.key), groups, schema.titleField))
    .join('');

  // Revert/Archive act on a saved schema (a persisted base to fall back to, a status to flip). A
  // brand-new draft has neither — it's discarded by leaving — so the overflow menu holds only the
  // JSON hatch for it.
  // Structure history is a cloud-only recovery surface (like entry history) and needs a saved type to
  // have a ring — so it's absent for a brand-new draft and in local-only mode.
  const historyItem = !isNewDraft && canHistory
    ? `<button type="button" class="se-menu-item" role="menuitem" data-se="history">Structure history</button>`
    : '';
  const savedMenuItems = isNewDraft
    ? ''
    : `<button type="button" class="se-menu-item" role="menuitem" data-se="reset">Revert changes</button>
            <button type="button" class="se-menu-item se-danger" role="menuitem" data-se="archive">Archive type</button>`;
  const previewPressed = previewMode === 'rendered' ? 'true' : 'false';

  // The action toolbar is sticky (see main.css) so every action stays reachable on a deep type. It
  // carries the primary Save + the on-demand Preview toggle; the de-emphasised escape hatches
  // (Edit JSON) and destructive actions (Revert/Archive) tuck into an overflow menu. (Sync status
  // lives once in the app header, not per-view.)
  return `
    <div class="schema-editor">
      <div class="se-toolbar">
        <div class="se-toolbar-start">
          <button type="button" class="btn btn-secondary btn-sm" data-se="back">← Back</button>
        </div>
        <div class="se-toolbar-end">
          <button type="button" class="btn btn-secondary btn-sm" data-se="preview" aria-pressed="${previewPressed}"${previewMode ? ' hidden' : ''}>Preview</button>
          <div class="se-menu">
            <button type="button" class="btn btn-secondary btn-sm se-menu-trigger" data-se-menu="trigger" aria-haspopup="menu" aria-expanded="false" aria-label="More actions">⋯<span class="se-label-wide"> More</span></button>
            <div class="se-menu-list hidden" data-se-menu="list" role="menu" aria-label="More type actions">
              <button type="button" class="se-menu-item se-menu-mono" role="menuitem" data-se="edit-json">&lt;/&gt; Edit JSON</button>
              ${historyItem}
              ${savedMenuItems}
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" data-se="save">Save<span class="se-label-wide"> type</span></button>
        </div>
      </div>
      ${errorBlock}
      <div class="se-config">
        <label class="se-type-pick">Editing type
          <select class="se-input" data-se="type-picker">${typeOptions(types, editingType)}</select>
        </label>
        <label class="se-type-name">Name
          <input class="se-input" data-se="type-label" value="${escapeHtml(schema.label || '')}" placeholder="Type name">
        </label>
        <label class="se-type-name se-title-field">Title field
          <select class="se-input" data-se="title-field">${titleFieldOptions(textSourceFields(schema), schema.titleField)}</select>
        </label>
      </div>
      ${summaryCardBlock(schema)}
      <div class="se-fields" data-drop-fields="0">${fieldRows}</div>
      <button type="button" class="se-btn se-add" data-se="field-add">+ add component</button>
    </div>`;
}

// --- DOM: event wiring ------------------------------------------------------

const CLICK_INTENTS = {
  save: () => ({ action: 'save' }),
  reset: () => ({ action: 'reset' }),
  archive: () => ({ action: 'archive' }),
  history: () => ({ action: 'history' }),
  back: () => ({ action: 'back' }),
  preview: () => ({ action: 'preview' }),
  'edit-json': () => ({ action: 'edit-json' }),
  'field-add': () => ({ action: 'add-field' }),
  // The kind chip opens the palette; the caller runs it and applies the chosen component.
  'field-kind': (d) => ({ action: 'pick-kind', fi: +d.fi }),
  'field-remove': (d) => ({ action: 'remove-field', fi: +d.fi }),
  'field-up': (d) => ({ action: 'move-field', fi: +d.fi, delta: -1 }),
  'field-down': (d) => ({ action: 'move-field', fi: +d.fi, delta: 1 }),
  // A group's sub-schema: add/change opens the palette (restricted to the inner allow-list); the
  // rest mirror the field-level intents, scoped to the group `fi` + the sub-index `si`.
  'sub-add': (d) => ({ action: 'add-subfield', fi: +d.fi }),
  'sub-kind': (d) => ({ action: 'pick-subfield-kind', fi: +d.fi, si: +d.si }),
  'sub-remove': (d) => ({ action: 'remove-subfield', fi: +d.fi, si: +d.si }),
  'sub-up': (d) => ({ action: 'move-subfield', fi: +d.fi, si: +d.si, delta: -1 }),
  'sub-down': (d) => ({ action: 'move-subfield', fi: +d.fi, si: +d.si, delta: 1 }),
  'sub-out': (d) => ({ action: 'move-subfield-out', fi: +d.fi, si: +d.si }),
};

/**
 * Wire a rendered editor root to a single `onIntent(intent)` dispatcher. Attach reads
 * the DOM and emits semantic intents; the caller owns schema state + the pure transforms.
 * Listeners live on `root`, which the caller replaces on each structural re-render — so
 * there is nothing to detach.
 */
export function attachSchemaEditor(root, onIntent) {
  const menuList = () => root.querySelector('[data-se-menu="list"]');
  const menuTrigger = () => root.querySelector('[data-se-menu="trigger"]');
  const closeMenu = () => {
    const list = menuList();
    if (!list || list.classList.contains('hidden')) return;
    list.classList.add('hidden');
    menuTrigger()?.setAttribute('aria-expanded', 'false');
  };

  root.addEventListener('click', (e) => {
    // Overflow "⋯ More" menu: the trigger toggles the list (focus the first item on open); an item
    // click flows through to its data-se intent below and closes the menu; a click anywhere else
    // closes it. No document listener — the root is replaced each rebuild, so that would leak.
    const trigger = e.target.closest('[data-se-menu="trigger"]');
    if (trigger && root.contains(trigger)) {
      e.preventDefault();
      const list = menuList();
      const open = list.classList.toggle('hidden') === false;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) list.querySelector('[role="menuitem"]')?.focus();
      return;
    }

    // Collapse toggle: a card's disclosure button flips its body's `hidden` (so AT skips a shut
    // card) and reports the new state so the caller persists it across rebuilds.
    const toggle = e.target.closest('[data-se-toggle]');
    if (toggle && root.contains(toggle)) {
      e.preventDefault();
      const card = toggle.closest('.se-field');
      const body = card.querySelector('.se-field-body');
      const open = body.hidden; // about to open
      body.hidden = !open;
      card.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      const caret = card.querySelector('.se-card-caret');
      if (caret) caret.textContent = open ? '▾' : '▸';
      onIntent({ action: 'toggle-field', key: card.dataset.key, expanded: open });
      return;
    }

    const btn = e.target.closest('[data-se]');
    if (!btn || !root.contains(btn)) {
      closeMenu(); // click outside any control dismisses an open menu
      return;
    }
    const make = CLICK_INTENTS[btn.dataset.se];
    if (!make) return;
    e.preventDefault();
    if (btn.closest('[data-se-menu="list"]')) closeMenu(); // a menu action dismisses the menu
    onIntent(make(btn.dataset));
  });

  // Escape closes the overflow menu and returns focus to its trigger.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const list = menuList();
    if (list && !list.classList.contains('hidden')) {
      closeMenu();
      menuTrigger()?.focus();
    }
  });

  // Live text edits — no structural change, so the caller should not rebuild the editor.
  root.addEventListener('input', (e) => {
    const el = e.target;
    const d = el.dataset;
    switch (d.se) {
      case 'type-label':
        return onIntent({ action: 'edit-label', label: el.value });
      case 'field-label':
        // A dedicated intent: a provisional field's key tracks its label (see updateFieldLabel).
        return onIntent({ action: 'edit-field-label', fi: +d.fi, label: el.value });
      case 'field-placeholder':
        return onIntent({ action: 'edit-field', fi: +d.fi, patch: { placeholder: el.value } });
      case 'field-options':
        // Select options: one per line, blanks dropped. Stored as an array on `field.options`.
        return onIntent({
          action: 'edit-field',
          fi: +d.fi,
          patch: { options: el.value.split('\n').map((s) => s.trim()).filter(Boolean) },
        });
      // A group's sub-fields — the same edits, scoped to the group `fi` + the sub-index `si`.
      case 'sub-label':
        return onIntent({ action: 'edit-subfield-label', fi: +d.fi, si: +d.si, label: el.value });
      case 'sub-placeholder':
        return onIntent({ action: 'edit-subfield', fi: +d.fi, si: +d.si, patch: { placeholder: el.value } });
      case 'sub-options':
        return onIntent({
          action: 'edit-subfield',
          fi: +d.fi,
          si: +d.si,
          patch: { options: el.value.split('\n').map((s) => s.trim()).filter(Boolean) },
        });
      default:
        return undefined;
    }
  });

  // Select / checkbox changes — kind and type picks are structural (caller re-renders).
  root.addEventListener('change', (e) => {
    const el = e.target;
    const d = el.dataset;
    switch (d.se) {
      case 'type-picker':
        return onIntent({ action: 'pick-type', type: el.value });
      case 'title-field':
        return onIntent({ action: 'set-title-field', key: el.value });
      case 'field-target':
        return onIntent({ action: 'edit-field', fi: +d.fi, patch: { targetType: el.value } });
      case 'field-assoc-mode':
        return onIntent({ action: 'edit-association', fi: +d.fi, patch: { mode: el.value } });
      case 'field-assoc-target':
        return onIntent({ action: 'edit-association', fi: +d.fi, patch: { refType: el.value } });
      case 'field-multi':
        // Structural: toggling multi adds/removes the dependent "Display as" control, so the row
        // must rebuild (like field-assoc-mode), not just refresh the preview.
        return onIntent({ action: 'edit-field-structural', fi: +d.fi, patch: { multi: el.checked } });
      case 'field-display':
        return onIntent({ action: 'edit-field', fi: +d.fi, patch: { display: el.value } });
      case 'summary-title':
        return onIntent({ action: 'edit-summary', patch: { title: el.value } });
      case 'summary-subtitle':
        return onIntent({ action: 'edit-summary', patch: { subtitle: el.value } });
      case 'summary-emblem':
        return onIntent({ action: 'edit-summary', patch: { emblem: el.value } });
      case 'summary-badge':
      case 'summary-row':
        // Membership toggle: recompute the whole ordered array from the checked rows in DOM order —
        // the same read a drag-reorder uses, so order and membership stay one source of truth.
        return onIntent({ action: 'edit-summary', patch: summarySelectionPatch(root, d.se) });
      // A group's sub-fields — target/multi/display mirror the field-level structural/non-structural
      // split; itemLabel is a plain patch on the group field.
      case 'sub-target':
        return onIntent({ action: 'edit-subfield', fi: +d.fi, si: +d.si, patch: { targetType: el.value } });
      case 'sub-multi':
        return onIntent({ action: 'edit-subfield-structural', fi: +d.fi, si: +d.si, patch: { multi: el.checked } });
      case 'sub-display':
        return onIntent({ action: 'edit-subfield', fi: +d.fi, si: +d.si, patch: { display: el.value } });
      case 'group-itemlabel':
        return onIntent({ action: 'edit-field', fi: +d.fi, patch: { itemLabel: el.value } });
      case 'field-into-group':
        // The select resets to its placeholder after; a rebuild follows anyway.
        return el.value === '' ? undefined : onIntent({ action: 'move-field-into-group', fi: +d.fi, groupFi: +el.value });
      default:
        return undefined;
    }
  });

  wireDragAndDrop(root, onIntent);
  wireSummaryReorder(root, onIntent);
}

/**
 * Patch an already-rendered editor's validation banner in place — insert, update, or remove the
 * `.se-errors` node without a full rebuild, so a focused input keeps focus while the banner is kept
 * honest as the working schema moves toward valid (issue #28). The banner sits between the head and
 * the first block, matching where `renderSchemaEditor` places it.
 */
export function updateErrorBanner(root, errors) {
  if (!root) return;
  let banner = root.querySelector('.se-errors');
  if (!errors.length) {
    if (banner) banner.remove();
    return;
  }
  const html = errors.map((e) => `<div>${escapeHtml(e)}</div>`).join('');
  if (banner) {
    banner.innerHTML = html;
    return;
  }
  banner = document.createElement('div');
  banner.className = 'se-errors';
  banner.innerHTML = html;
  root.querySelector('.se-head')?.after(banner);
}

// --- DOM: drag-and-drop reordering ------------------------------------------
// Only the ⠿ handles are draggable, so form inputs keep native text selection and
// there are no nested drag sources to disambiguate. A drop emits a single move-*-to
// intent; the caller applies the pure transform and rebuilds the editor.

const DROP_MARKERS = ['se-drop-before', 'se-drop-after', 'se-drop-into'];

/** Is the pointer past the vertical midpoint of `el` (drop AFTER vs BEFORE)? */
function isAfter(e, el) {
  const rect = el.getBoundingClientRect();
  return e.clientY > rect.top + rect.height / 2;
}

/**
 * Resolve where the current field drag would land: `{ el, marker, toFi }` or null when the pointer
 * is not over a valid target. Precedence: a specific row (before/after by midpoint) → the field
 * container as a whole (append at the end).
 */
function dropSpot(e) {
  const fld = e.target.closest('[data-drop="field"]');
  if (fld) {
    const after = isAfter(e, fld);
    return { el: fld, marker: after ? 'se-drop-after' : 'se-drop-before', toFi: +fld.dataset.fi + (after ? 1 : 0) };
  }
  const container = e.target.closest('[data-drop-fields]');
  if (container) {
    return { el: container, marker: 'se-drop-into', toFi: container.children.length };
  }
  return null;
}

function wireDragAndDrop(root, onIntent) {
  let drag = null; // { fi }
  const clearMarkers = () =>
    root.querySelectorAll('.' + DROP_MARKERS.join(', .')).forEach((el) => el.classList.remove(...DROP_MARKERS));

  root.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-drag="field"]');
    if (!handle) return;
    drag = { fi: +handle.dataset.fi };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Firefox requires data for the drag to start
    const ghost = handle.closest('.se-field');
    if (ghost) e.dataTransfer.setDragImage(ghost, 12, 12);
  });

  root.addEventListener('dragend', () => {
    drag = null;
    clearMarkers();
  });

  root.addEventListener('dragover', (e) => {
    if (!drag) return;
    const spot = dropSpot(e);
    clearMarkers();
    if (!spot) return;
    e.preventDefault(); // signal a valid drop target
    e.dataTransfer.dropEffect = 'move';
    spot.el.classList.add(spot.marker);
  });

  root.addEventListener('drop', (e) => {
    if (!drag) return;
    const spot = dropSpot(e);
    clearMarkers();
    const d = drag;
    drag = null;
    if (!spot) return;
    e.preventDefault();
    onIntent({ action: 'move-field-to', fromFi: d.fi, toFi: spot.toFi });
  });
}

// --- DOM: summary-card drag-to-order ----------------------------------------
// The badges/rows composers reorder like the field list: only the ⠿ handle drags, a drop moves the
// row within its group, and the order is read back from the checked rows in DOM order. Kept separate
// from the field DnD above — it reorders a summary array, not the schema — and keyed off
// `data-summary-drag` (not `[data-drag]`) so the two handlers never cross-fire on the shared root.

/** The ordered selection for a summary slot, read from its checked rows in DOM order. */
function summarySelectionPatch(root, seType) {
  const checked = [...root.querySelectorAll(`[data-se="${seType}"]`)].filter((c) => c.checked);
  return seType === 'summary-badge'
    ? { badges: checked.map((c) => c.dataset.key) }
    : { rows: checked.map((c) => ({ label: c.dataset.label, key: c.dataset.key })) };
}

function wireSummaryReorder(root, onIntent) {
  let item = null; // the .se-summary-item being dragged
  const clear = () =>
    root
      .querySelectorAll('.se-drop-before, .se-drop-after')
      .forEach((el) => el.classList.remove('se-drop-before', 'se-drop-after'));
  // Only rows in the same group are valid targets (badges can't reorder into rows).
  const peer = (target, ref) => target && ref && target !== ref && target.parentElement === ref.parentElement;

  root.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-summary-drag]');
    if (!handle) return;
    item = handle.closest('.se-summary-item');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Firefox requires data for the drag to start
    if (item) e.dataTransfer.setDragImage(item, 12, 12);
  });

  root.addEventListener('dragend', () => {
    item = null;
    clear();
  });

  root.addEventListener('dragover', (e) => {
    if (!item) return;
    const target = e.target.closest('.se-summary-item');
    clear();
    if (!peer(target, item)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    target.classList.add(isAfter(e, target) ? 'se-drop-after' : 'se-drop-before');
  });

  root.addEventListener('drop', (e) => {
    if (!item) return;
    const target = e.target.closest('.se-summary-item');
    const dragged = item;
    item = null;
    clear();
    if (!peer(target, dragged)) return;
    e.preventDefault();
    const container = dragged.parentElement;
    container.insertBefore(dragged, isAfter(e, target) ? target.nextSibling : target);
    onIntent({ action: 'edit-summary', patch: summarySelectionPatch(container, container.dataset.summaryOrder) });
  });
}
