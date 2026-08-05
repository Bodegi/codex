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
import { slugify, uniqueSlug } from '../schema/slug.js';

/** Field kinds the editor's picker offers — the one registry, in declaration order. */
export const FIELD_KIND_OPTIONS = Object.keys(fieldKinds);

/** Kinds that take a free-text placeholder (media/reference don't). */
const PLACEHOLDER_KINDS = new Set(['text', 'prose', 'list']);

/** Summary-card badge fields become chips (multi-value kinds); row fields become labelled scalars. */
const BADGE_KINDS = new Set(['list', 'reference']);
const ROW_KINDS = new Set(['text', 'prose']);

/** Association modes a map marker can use (map-component.md §4.1); 'both' is the default. */
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
 * A minimal, valid schema for a brand-new type: a kebab type id derived from the label
 * (unique against `existingTypes`), an id + title field so entries can be named and keyed,
 * and `status: 'active'`. Passes `validateSchema`, so the author can Save immediately and
 * grow it from there.
 */
export function newTypeSchema(label, existingTypes = []) {
  const type = uniqueSlug(slugify(label) || 'type', existingTypes);
  return {
    type,
    label: String(label ?? '').trim() || 'New Type',
    icon: 'dot',
    idField: 'id',
    titleField: 'title',
    status: 'active',
    sections: [
      {
        title: 'Details',
        fields: [
          { key: 'id', label: 'ID', kind: 'text', placeholder: 'e.g. my-entry', showInMetadata: true },
          { key: 'title', label: 'Title', kind: 'text', placeholder: 'e.g. My Entry' },
        ],
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
 * Merge a patch into a field's `association` config (the map kind — see map-component.md §4.1).
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
 * Merge a patch into the type-level `summaryCard` descriptor (see summaryCard.js §5.1) — the
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

function kindOptions(selected) {
  return FIELD_KIND_OPTIONS.map(
    (k) => `<option value="${k}"${k === selected ? ' selected' : ''}>${k}</option>`
  ).join('');
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

function fieldRow(field, si, fi, types) {
  const at = `data-si="${si}" data-fi="${fi}"`;
  // Second line holds only the controls relevant to this field's kind.
  const extras = [];
  if (PLACEHOLDER_KINDS.has(field.kind)) {
    extras.push(
      `<input class="se-input se-sub" data-se="field-placeholder" ${at} placeholder="placeholder text" value="${escapeHtml(field.placeholder || '')}">`
    );
  }
  if (field.kind === 'reference') {
    extras.push(`<select class="se-input se-sub" data-se="field-target" ${at}>${targetOptions(types, field.targetType)}</select>`);
    extras.push(
      `<label class="se-meta"><input type="checkbox" data-se="field-multi" ${at}${field.multi ? ' checked' : ''}> multiple</label>`
    );
  }
  if (field.kind === 'text') {
    extras.push(
      `<input class="se-input se-sub" data-se="field-inputType" ${at} placeholder="input type (e.g. date)" value="${escapeHtml(field.inputType || '')}">`
    );
  }
  if (field.kind === 'map') {
    // Per-field association config (map-component.md §4.1): how a marker links to an entry. The
    // target-type picker only applies when the mode allows a reference ('both' / 'reference').
    const assoc = field.association || {};
    const mode = assoc.mode || 'both';
    extras.push(
      `<select class="se-input se-sub" data-se="field-assoc-mode" ${at} title="marker association">${assocModeOptions(mode)}</select>`
    );
    if (mode !== 'label') {
      extras.push(`<select class="se-input se-sub" data-se="field-assoc-target" ${at}>${targetOptions(types, assoc.refType)}</select>`);
    }
  }
  extras.push(
    `<label class="se-meta"><input type="checkbox" data-se="field-meta" ${at}${field.showInMetadata ? ' checked' : ''}> in metadata</label>`
  );

  return `
    <div class="se-field" ${at} data-drop="field">
      <div class="se-field-main">
        <span class="se-drag" ${at} draggable="true" data-drag="field" title="Drag to reorder" aria-hidden="true">⠿</span>
        <input class="se-input se-label" data-se="field-label" ${at} value="${escapeHtml(field.label || '')}" placeholder="Field label">
        <code class="se-key" title="storage key (fixed)">${escapeHtml(field.key)}</code>
        <select class="se-input se-kind" data-se="field-kind" ${at}>${kindOptions(field.kind)}</select>
        <span class="se-row-controls">
          <button type="button" class="se-btn" data-se="field-up" ${at} title="Move up">Up</button>
          <button type="button" class="se-btn" data-se="field-down" ${at} title="Move down">Down</button>
          <button type="button" class="se-btn se-danger" data-se="field-remove" ${at} title="Remove field">×</button>
        </span>
      </div>
      <div class="se-field-extras">${extras.join('')}</div>
    </div>`;
}

/** All fields across sections, flattened in order (field objects, not just keys). */
function flatFields(schema) {
  return (schema.sections || []).flatMap((s) => s.fields || []);
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

/** A checkbox per eligible field, checked when its key is already selected. */
function fieldCheckList(fields, selectedKeys, seType) {
  if (fields.length === 0) return '<span class="se-summary-none">no eligible fields</span>';
  const set = new Set(selectedKeys);
  return fields
    .map(
      (f) =>
        `<label class="se-summary-check"><input type="checkbox" data-se="${seType}" data-key="${escapeHtml(
          f.key
        )}" data-label="${escapeHtml(f.label || f.key)}"${set.has(f.key) ? ' checked' : ''}> ${escapeHtml(f.label || f.key)}</label>`
    )
    .join('');
}

/**
 * The type-level "Summary card" config — which fields form the card face when the type is
 * browsed as an index (summaryCard.js §5.1). Title/subtitle are single-field picks; badges
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
        <div class="se-summary-checks">${fieldCheckList(badgeFields, card.badges || [], 'summary-badge')}</div>
      </div>
      <div class="se-summary-group">
        <span class="se-summary-label">Rows <em>(text fields → labelled rows)</em></span>
        <div class="se-summary-checks">${fieldCheckList(rowFields, rowKeys, 'summary-row')}</div>
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
          <button type="button" class="se-btn se-danger" data-se="section-remove" data-si="${si}" title="Remove section">×</button>
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
export function renderSchemaEditor(schema, { types, editingType, errors = [] }) {
  const errorBlock = errors.length
    ? `<div class="se-errors">${errors.map((e) => `<div>${escapeHtml(e)}</div>`).join('')}</div>`
    : '';
  const sections = schema.sections.map((s, si) => sectionBlock(s, si, types)).join('');

  return `
    <div class="schema-editor">
      <div class="se-head">
        <label class="se-type-pick">Editing type
          <select class="se-input" data-se="type-picker">${typeOptions(types, editingType)}</select>
        </label>
        <label class="se-type-name">Name
          <input class="se-input" data-se="type-label" value="${escapeHtml(schema.label || '')}" placeholder="Type name">
        </label>
        <span class="se-head-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-se="reset">Revert changes</button>
          <button type="button" class="btn btn-secondary btn-sm se-danger" data-se="archive">Archive type</button>
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
      case 'field-inputType':
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { inputType: el.value } });
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
      case 'field-kind':
        return onIntent({ action: 'change-kind', si: +d.si, fi: +d.fi, kind: el.value });
      case 'field-target':
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { targetType: el.value } });
      case 'field-assoc-mode':
        return onIntent({ action: 'edit-association', si: +d.si, fi: +d.fi, patch: { mode: el.value } });
      case 'field-assoc-target':
        return onIntent({ action: 'edit-association', si: +d.si, fi: +d.fi, patch: { refType: el.value } });
      case 'field-meta':
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { showInMetadata: el.checked } });
      case 'field-multi':
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { multi: el.checked } });
      case 'summary-title':
        return onIntent({ action: 'edit-summary', patch: { title: el.value } });
      case 'summary-subtitle':
        return onIntent({ action: 'edit-summary', patch: { subtitle: el.value } });
      case 'summary-badge': {
        // A checkbox group: recompute the whole ordered key array from what's now checked.
        const badges = [...root.querySelectorAll('[data-se="summary-badge"]')]
          .filter((c) => c.checked)
          .map((c) => c.dataset.key);
        return onIntent({ action: 'edit-summary', patch: { badges } });
      }
      case 'summary-row': {
        const rows = [...root.querySelectorAll('[data-se="summary-row"]')]
          .filter((c) => c.checked)
          .map((c) => ({ label: c.dataset.label, key: c.dataset.key }));
        return onIntent({ action: 'edit-summary', patch: { rows } });
      }
      default:
        return undefined;
    }
  });

  wireDragAndDrop(root, onIntent);
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
