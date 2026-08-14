/**
 * Codex — Schema editor.
 *
 * The Types-tab authoring surface. This module owns two things kept deliberately apart:
 *
 *  1. Pure working-schema transforms (below) — add/remove/reorder/rename of sections and
 *     fields, plus key derivation. They take a working schema and return a NEW one
 *     (structuredClone), never mutating the input, so the DOM layer can hold one working
 *     copy and swap it wholesale. Pure + dependency-free => unit-testable under plain Node.
 *
 *  2. The editor DOM builder (added alongside) — renders the working schema as editable
 *     rows and reads the field-kind vocabulary from the registry.
 *
 * Field `key`s are unique per TYPE (not per section) because they are the storage keys
 * entry data lives under — hence `deriveKey`/`allFieldKeys` work across the whole schema.
 */

import { escapeHtml } from '../schema/inlineText.js';
import { fieldKinds } from '../schema/fieldKinds.js';
import { newId } from '../utils/id.js';

/** Kinds that take a free-text placeholder (media/reference/select/date/boolean don't). */
const PLACEHOLDER_KINDS = new Set(['text', 'prose', 'list', 'number']);

/** Summary-card badge fields become chips (multi-value kinds); row fields become labelled scalars. */
const BADGE_KINDS = new Set(['list', 'reference']);
const ROW_KINDS = new Set(['text', 'prose', 'number', 'date', 'select', 'boolean']);

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
    sections: [
      {
        title: 'Details',
        fields: [{ key: 'title', label: 'Title', kind: 'text', placeholder: 'e.g. My Entry' }],
      },
    ],
  };
}

/** Every field key in the type, across all sections. */
export function allFieldKeys(schema) {
  return schema.sections.flatMap((s) => s.fields.map((f) => f.key));
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
  next.titleField = keys[0] || '';
  return next;
}

/** Swap two entries of an array in place (helper for the reorder transforms). */
function swap(arr, a, b) {
  [arr[a], arr[b]] = [arr[b], arr[a]];
}

// --- Field transforms -------------------------------------------------------

/** Append a field to a section. `field` must already carry a unique `key`. */
export function addField(schema, sectionIndex, field) {
  const next = clone(schema);
  next.sections[sectionIndex].fields.push(field);
  return next;
}

/** Remove a field. Non-destructive to entry data — orphaned values just stop rendering. */
export function removeField(schema, sectionIndex, fieldIndex) {
  const next = clone(schema);
  next.sections[sectionIndex].fields.splice(fieldIndex, 1);
  return next;
}

/** Shallow-merge a patch into a field. The `key` is never changed here (it is immutable). */
export function updateField(schema, sectionIndex, fieldIndex, patch) {
  const next = clone(schema);
  const field = next.sections[sectionIndex].fields[fieldIndex];
  const { key: _ignoredKey, ...safe } = patch;
  Object.assign(field, safe);
  return next;
}

/**
 * Merge a patch into a field's `association` config (the map kind).
 * Nested + merge-based so partial edits (mode alone, refType alone) compose without clobbering the
 * sibling key, which a plain `updateField({ association })` would.
 */
export function updateFieldAssociation(schema, sectionIndex, fieldIndex, patch) {
  const next = clone(schema);
  const field = next.sections[sectionIndex].fields[fieldIndex];
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

/** Move a field up (delta -1) or down (delta +1) within its section. No cross-section moves. */
export function moveField(schema, sectionIndex, fieldIndex, delta) {
  const target = fieldIndex + delta;
  const fields = schema.sections[sectionIndex].fields;
  if (target < 0 || target >= fields.length) return schema; // clamp at the ends
  const next = clone(schema);
  swap(next.sections[sectionIndex].fields, fieldIndex, target);
  return next;
}

/**
 * Move a field to an arbitrary position — within its section OR into another section
 * (the drag-and-drop path; Up/Down handles the single-step within-section case).
 * `toFi` is the insertion index in the destination section's ORIGINAL ordering; the
 * splice math accounts for the source slot vanishing on a same-section downward move.
 * A no-op move (same slot) returns the input unchanged.
 */
export function moveFieldTo(schema, fromSi, fromFi, toSi, toFi) {
  const from = schema.sections?.[fromSi];
  const to = schema.sections?.[toSi];
  if (!from || !to || fromFi < 0 || fromFi >= from.fields.length) return schema;
  if (fromSi === toSi && (toFi === fromFi || toFi === fromFi + 1)) return schema; // no-op
  const next = clone(schema);
  const [field] = next.sections[fromSi].fields.splice(fromFi, 1);
  let idx = toFi;
  if (fromSi === toSi && fromFi < toFi) idx -= 1; // the removed slot shifted everything after it
  const dest = next.sections[toSi].fields;
  idx = Math.max(0, Math.min(idx, dest.length));
  dest.splice(idx, 0, field);
  return next;
}

// --- Section transforms -----------------------------------------------------

/** Append an empty section with the given title. */
export function addSection(schema, title) {
  const next = clone(schema);
  next.sections.push({ title, fields: [] });
  return next;
}

/** Remove a section (and its fields — non-destructive to stored entry data). */
export function removeSection(schema, sectionIndex) {
  const next = clone(schema);
  next.sections.splice(sectionIndex, 1);
  return next;
}

/** Rename a section's title. */
export function renameSection(schema, sectionIndex, title) {
  const next = clone(schema);
  next.sections[sectionIndex].title = title;
  return next;
}

/** Move a section up (delta -1) or down (delta +1). */
export function moveSection(schema, sectionIndex, delta) {
  const target = sectionIndex + delta;
  if (target < 0 || target >= schema.sections.length) return schema; // clamp
  const next = clone(schema);
  swap(next.sections, sectionIndex, target);
  return next;
}

/**
 * Move a section to an arbitrary position (the drag-and-drop path). `toSi` is the
 * insertion index in the ORIGINAL ordering; the splice math accounts for the source
 * slot vanishing on a downward move. A no-op move returns the input unchanged.
 */
export function moveSectionTo(schema, fromSi, toSi) {
  const sections = schema.sections;
  if (!Array.isArray(sections) || fromSi < 0 || fromSi >= sections.length) return schema;
  if (toSi === fromSi || toSi === fromSi + 1) return schema; // no-op
  const next = clone(schema);
  const [section] = next.sections.splice(fromSi, 1);
  let idx = toSi;
  if (fromSi < toSi) idx -= 1;
  idx = Math.max(0, Math.min(idx, next.sections.length));
  next.sections.splice(idx, 0, section);
  return next;
}

// --- DOM: editor markup -----------------------------------------------------

/**
 * A field's kind control: a chip showing the current component's icon + human name, opening the
 * palette on click (see components/componentPalette.js) rather than exposing the raw kind key.
 */
function kindChip(field, at) {
  const def = fieldKinds[field.kind] || {};
  const title = def.title || field.kind;
  return `<button type="button" class="se-input se-kind se-kind-chip" data-se="field-kind" ${at} title="Change component">
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

function fieldRow(field, si, fi, types) {
  const at = `data-si="${si}" data-fi="${fi}"`;
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
    extras.push(`
      <div class="se-sub-field se-sub-field-check">
        <label class="se-meta"><input type="checkbox" id="${id('multi')}" aria-describedby="${id('multi')}-help" data-se="field-multi" ${at}${field.multi ? ' checked' : ''}> Allow multiple</label>
        <span class="se-sub-help" id="${id('multi')}-help">Let one entry link to several targets instead of just one.</span>
      </div>`);
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

  return `
    <div class="se-field" ${at} data-drop="field">
      <div class="se-field-main">
        <span class="se-drag" ${at} draggable="true" data-drag="field" title="Drag to reorder" aria-hidden="true">⠿</span>
        <input class="se-input se-label" data-se="field-label" ${at} value="${escapeHtml(field.label || '')}" placeholder="Field label">
        <code class="se-key" title="storage key (fixed)">${escapeHtml(field.key)}</code>
        ${kindChip(field, at)}
        <span class="se-row-controls">
          <button type="button" class="se-btn" data-se="field-up" ${at} title="Move up">Up</button>
          <button type="button" class="se-btn" data-se="field-down" ${at} title="Move down">Down</button>
          <button type="button" class="se-btn se-danger" data-se="field-remove" ${at} title="Remove field" aria-label="Remove field">×</button>
        </span>
      </div>
      <div class="se-field-extras">${extras.join('')}</div>
    </div>`;
}

/** All fields across sections, flattened in order (field objects, not just keys). */
function flatFields(schema) {
  return (schema.sections || []).flatMap((s) => s.fields || []);
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
function summaryCardBlock(schema) {
  const card = schema.summaryCard || {};
  const fields = flatFields(schema);
  const badgeFields = fields.filter((f) => BADGE_KINDS.has(f.kind));
  const rowFields = fields.filter((f) => ROW_KINDS.has(f.kind));
  const rowKeys = (card.rows || []).map((r) => r.key);
  return `
    <div class="se-summary">
      <div class="se-summary-head">Summary card</div>
      <p class="se-summary-hint">The fields shown when this type is browsed as an index — a grid of cards, one per entry.</p>
      <div class="se-summary-picks">
        <label class="se-summary-pick">Title
          <select class="se-input" data-se="summary-title">${fieldPickOptions(fields, card.title || '', '— use title field —')}</select>
        </label>
        <label class="se-summary-pick">Subtitle
          <select class="se-input" data-se="summary-subtitle">${fieldPickOptions(fields, card.subtitle || '', '— none —')}</select>
        </label>
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

function sectionBlock(section, si, types) {
  const rows = section.fields.map((f, fi) => fieldRow(f, si, fi, types)).join('');
  return `
    <div class="se-section" data-si="${si}" data-drop="section">
      <div class="se-section-head">
        <span class="se-drag" data-si="${si}" draggable="true" data-drag="section" title="Drag to reorder" aria-hidden="true">⠿</span>
        <input class="se-input se-section-title" data-se="section-title" data-si="${si}" value="${escapeHtml(section.title || '')}" placeholder="Section title">
        <span class="se-row-controls">
          <button type="button" class="se-btn" data-se="section-up" data-si="${si}" title="Move section up">Up</button>
          <button type="button" class="se-btn" data-se="section-down" data-si="${si}" title="Move section down">Down</button>
          <button type="button" class="se-btn se-danger" data-se="section-remove" data-si="${si}" title="Remove section" aria-label="Remove section">×</button>
        </span>
      </div>
      <div class="se-fields" data-drop-fields="${si}">${rows}</div>
      <button type="button" class="se-btn se-add" data-se="field-add" data-si="${si}">+ add field</button>
    </div>`;
}

/**
 * Build the schema-editor markup for a working schema. `types` is the list from
 * listTypes() (for the type picker + reference targets); `errors` are validation
 * messages to surface after a blocked save.
 */
export function renderSchemaEditor(schema, { types, editingType, errors = [], isNewDraft = false }) {
  const errorBlock = errors.length
    ? `<div class="se-errors">${errors.map((e) => `<div>${escapeHtml(e)}</div>`).join('')}</div>`
    : '';
  const sections = schema.sections.map((s, si) => sectionBlock(s, si, types)).join('');

  // Revert/Archive act on a saved schema (a persisted base to fall back to, a status to flip). A
  // brand-new draft has neither — it's discarded by leaving — so only Save shows for it.
  const savedActions = isNewDraft
    ? ''
    : `<button type="button" class="btn btn-secondary btn-sm" data-se="reset">Revert changes</button>
          <button type="button" class="btn btn-secondary btn-sm se-danger" data-se="archive">Archive type</button>`;

  return `
    <div class="schema-editor">
      <div class="se-head">
        <label class="se-type-pick">Editing type
          <select class="se-input" data-se="type-picker">${typeOptions(types, editingType)}</select>
        </label>
        <label class="se-type-name">Name
          <input class="se-input" data-se="type-label" value="${escapeHtml(schema.label || '')}" placeholder="Type name">
        </label>
        <label class="se-type-name se-title-field">Title field
          <select class="se-input" data-se="title-field">${titleFieldOptions(flatFields(schema), schema.titleField)}</select>
        </label>
        <span class="se-head-actions">
          ${savedActions}
          <button type="button" class="btn btn-primary btn-sm" data-se="save">Save type</button>
        </span>
      </div>
      ${errorBlock}
      ${summaryCardBlock(schema)}
      <div class="se-sections">${sections}</div>
      <button type="button" class="se-btn se-add" data-se="section-add">+ add section</button>
    </div>`;
}

// --- DOM: event wiring ------------------------------------------------------

const CLICK_INTENTS = {
  save: () => ({ action: 'save' }),
  reset: () => ({ action: 'reset' }),
  archive: () => ({ action: 'archive' }),
  'section-add': () => ({ action: 'add-section' }),
  'section-remove': (d) => ({ action: 'remove-section', si: +d.si }),
  'section-up': (d) => ({ action: 'move-section', si: +d.si, delta: -1 }),
  'section-down': (d) => ({ action: 'move-section', si: +d.si, delta: 1 }),
  'field-add': (d) => ({ action: 'add-field', si: +d.si }),
  // The kind chip opens the palette; the caller runs it and applies the chosen component.
  'field-kind': (d) => ({ action: 'pick-kind', si: +d.si, fi: +d.fi }),
  'field-remove': (d) => ({ action: 'remove-field', si: +d.si, fi: +d.fi }),
  'field-up': (d) => ({ action: 'move-field', si: +d.si, fi: +d.fi, delta: -1 }),
  'field-down': (d) => ({ action: 'move-field', si: +d.si, fi: +d.fi, delta: 1 }),
};

/**
 * Wire a rendered editor root to a single `onIntent(intent)` dispatcher. Attach reads
 * the DOM and emits semantic intents; the caller owns schema state + the pure transforms.
 * Listeners live on `root`, which the caller replaces on each structural re-render — so
 * there is nothing to detach.
 */
export function attachSchemaEditor(root, onIntent) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-se]');
    if (!btn || !root.contains(btn)) return;
    const make = CLICK_INTENTS[btn.dataset.se];
    if (!make) return;
    e.preventDefault();
    onIntent(make(btn.dataset));
  });

  // Live text edits — no structural change, so the caller should not rebuild the editor.
  root.addEventListener('input', (e) => {
    const el = e.target;
    const d = el.dataset;
    switch (d.se) {
      case 'section-title':
        return onIntent({ action: 'rename-section', si: +d.si, title: el.value });
      case 'type-label':
        return onIntent({ action: 'edit-label', label: el.value });
      case 'field-label':
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { label: el.value } });
      case 'field-placeholder':
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { placeholder: el.value } });
      case 'field-options':
        // Select options: one per line, blanks dropped. Stored as an array on `field.options`.
        return onIntent({
          action: 'edit-field',
          si: +d.si,
          fi: +d.fi,
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
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { targetType: el.value } });
      case 'field-assoc-mode':
        return onIntent({ action: 'edit-association', si: +d.si, fi: +d.fi, patch: { mode: el.value } });
      case 'field-assoc-target':
        return onIntent({ action: 'edit-association', si: +d.si, fi: +d.fi, patch: { refType: el.value } });
      case 'field-multi':
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { multi: el.checked } });
      case 'summary-title':
        return onIntent({ action: 'edit-summary', patch: { title: el.value } });
      case 'summary-subtitle':
        return onIntent({ action: 'edit-summary', patch: { subtitle: el.value } });
      case 'summary-badge':
      case 'summary-row':
        // Membership toggle: recompute the whole ordered array from the checked rows in DOM order —
        // the same read a drag-reorder uses, so order and membership stay one source of truth.
        return onIntent({ action: 'edit-summary', patch: summarySelectionPatch(root, d.se) });
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
 * Resolve where the current drag would land: `{ el, marker, toSi[, toFi] }` or null
 * when the pointer is not over a valid target. Field precedence: a specific row →
 * its section's field container (append) → the section as a whole (append).
 */
function dropSpot(e, drag) {
  if (drag.kind === 'section') {
    const sec = e.target.closest('[data-drop="section"]');
    if (!sec) return null;
    const after = isAfter(e, sec);
    return { el: sec, marker: after ? 'se-drop-after' : 'se-drop-before', toSi: +sec.dataset.si + (after ? 1 : 0) };
  }
  const fld = e.target.closest('[data-drop="field"]');
  if (fld) {
    const sec = fld.closest('[data-drop="section"]');
    const after = isAfter(e, fld);
    return {
      el: fld,
      marker: after ? 'se-drop-after' : 'se-drop-before',
      toSi: +sec.dataset.si,
      toFi: +fld.dataset.fi + (after ? 1 : 0),
    };
  }
  const container = e.target.closest('[data-drop-fields]');
  if (container) {
    return { el: container, marker: 'se-drop-into', toSi: +container.dataset.dropFields, toFi: container.children.length };
  }
  const sec = e.target.closest('[data-drop="section"]');
  const c = sec && sec.querySelector('[data-drop-fields]');
  if (c) return { el: c, marker: 'se-drop-into', toSi: +sec.dataset.si, toFi: c.children.length };
  return null;
}

function wireDragAndDrop(root, onIntent) {
  let drag = null; // { kind: 'field'|'section', si, fi }
  const clearMarkers = () =>
    root.querySelectorAll('.' + DROP_MARKERS.join(', .')).forEach((el) => el.classList.remove(...DROP_MARKERS));

  root.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-drag]');
    if (!handle) return;
    drag = { kind: handle.dataset.drag, si: +handle.dataset.si, fi: handle.dataset.fi != null ? +handle.dataset.fi : -1 };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Firefox requires data for the drag to start
    const ghost = handle.closest(drag.kind === 'field' ? '.se-field' : '.se-section');
    if (ghost) e.dataTransfer.setDragImage(ghost, 12, 12);
  });

  root.addEventListener('dragend', () => {
    drag = null;
    clearMarkers();
  });

  root.addEventListener('dragover', (e) => {
    if (!drag) return;
    const spot = dropSpot(e, drag);
    clearMarkers();
    if (!spot) return;
    e.preventDefault(); // signal a valid drop target
    e.dataTransfer.dropEffect = 'move';
    spot.el.classList.add(spot.marker);
  });

  root.addEventListener('drop', (e) => {
    if (!drag) return;
    const spot = dropSpot(e, drag);
    clearMarkers();
    const d = drag;
    drag = null;
    if (!spot) return;
    e.preventDefault();
    if (d.kind === 'section') {
      onIntent({ action: 'move-section-to', fromSi: d.si, toSi: spot.toSi });
    } else {
      onIntent({ action: 'move-field-to', fromSi: d.si, fromFi: d.fi, toSi: spot.toSi, toFi: spot.toFi });
    }
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
