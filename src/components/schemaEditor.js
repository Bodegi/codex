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
import { fieldKinds, MEDIA_KINDS } from '../schema/fieldKinds.js';

/** Field kinds the editor's picker offers: pure registry kinds first, then media. */
export const FIELD_KIND_OPTIONS = [...Object.keys(fieldKinds), ...MEDIA_KINDS];

/** Kinds that take a free-text placeholder (media/reference don't). */
const PLACEHOLDER_KINDS = new Set(['text', 'prose', 'list']);

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

/** Move a field up (delta -1) or down (delta +1) within its section. No cross-section moves. */
export function moveField(schema, sectionIndex, fieldIndex, delta) {
  const target = fieldIndex + delta;
  const fields = schema.sections[sectionIndex].fields;
  if (target < 0 || target >= fields.length) return schema; // clamp at the ends
  const next = clone(schema);
  swap(next.sections[sectionIndex].fields, fieldIndex, target);
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
  }
  if (field.kind === 'text') {
    extras.push(
      `<input class="se-input se-sub" data-se="field-inputType" ${at} placeholder="input type (e.g. date)" value="${escapeHtml(field.inputType || '')}">`
    );
  }
  extras.push(
    `<label class="se-meta"><input type="checkbox" data-se="field-meta" ${at}${field.showInMetadata ? ' checked' : ''}> in metadata</label>`
  );

  return `
    <div class="se-field" ${at}>
      <div class="se-field-main">
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

function sectionBlock(section, si, types) {
  const rows = section.fields.map((f, fi) => fieldRow(f, si, fi, types)).join('');
  return `
    <div class="se-section" data-si="${si}">
      <div class="se-section-head">
        <input class="se-input se-section-title" data-se="section-title" data-si="${si}" value="${escapeHtml(section.title || '')}" placeholder="Section title">
        <span class="se-row-controls">
          <button type="button" class="se-btn" data-se="section-up" data-si="${si}" title="Move section up">Up</button>
          <button type="button" class="se-btn" data-se="section-down" data-si="${si}" title="Move section down">Down</button>
          <button type="button" class="se-btn se-danger" data-se="section-remove" data-si="${si}" title="Remove section">×</button>
        </span>
      </div>
      <div class="se-fields">${rows}</div>
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
        <span class="se-head-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-se="reset">Reset to default</button>
          <button type="button" class="btn btn-primary btn-sm" data-se="save">Save type</button>
        </span>
      </div>
      ${errorBlock}
      <div class="se-sections">${sections}</div>
      <button type="button" class="se-btn se-add" data-se="section-add">+ add section</button>
    </div>`;
}

// --- DOM: event wiring ------------------------------------------------------

const CLICK_INTENTS = {
  save: () => ({ action: 'save' }),
  reset: () => ({ action: 'reset' }),
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
      case 'field-meta':
        return onIntent({ action: 'edit-field', si: +d.si, fi: +d.fi, patch: { showInMetadata: el.checked } });
      default:
        return undefined;
    }
  });
}
