import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  slugToCamel,
  allFieldKeys,
  deriveKey,
  addField,
  removeField,
  updateField,
  updateFieldLabel,
  stripProvisional,
  updateFieldAssociation,
  updateSummaryCard,
  setTitleField,
  repointTitleField,
  moveField,
  moveFieldTo,
  newTypeSchema,
  addSubField,
  removeSubField,
  updateSubField,
  updateSubFieldLabel,
  moveSubField,
} from './schemaEditor.js';
import { validateSchema } from '../schema/schemaValidate.js';

function schema() {
  return {
    type: 'demo',
    label: 'Demo',
    idField: 'id',
    titleField: 'name',
    fields: [
      { key: 'id', label: 'ID', kind: 'text' },
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'notes', label: 'Notes', kind: 'prose' },
    ],
  };
}

test('slugToCamel camelCases a label', () => {
  assert.equal(slugToCamel('Material Palette'), 'materialPalette');
  assert.equal(slugToCamel('Trade Exports'), 'tradeExports');
  // Punctuation splits into word boundaries (apostrophe-s becomes its own token) — a
  // harmless quirk since derived keys are invisible to authors.
  assert.equal(slugToCamel("Ruler's Name"), 'rulerSName');
  assert.equal(slugToCamel('   '), 'field');
});

test('allFieldKeys gathers every field key in the type', () => {
  assert.deepEqual(allFieldKeys(schema()), ['id', 'name', 'notes']);
});

test('deriveKey returns the base when free, else a numbered variant', () => {
  assert.equal(deriveKey('Climate', ['id', 'name']), 'climate');
  assert.equal(deriveKey('Name', ['name']), 'name2');
  assert.equal(deriveKey('Name', ['name', 'name2']), 'name3');
});

test('addField appends without mutating the input', () => {
  const before = schema();
  const after = addField(before, { key: 'climate', label: 'Climate', kind: 'text' });
  assert.deepEqual(after.fields.map((f) => f.key), ['id', 'name', 'notes', 'climate']);
  assert.equal(before.fields.length, 3); // original untouched
});

test('removeField drops the field', () => {
  const after = removeField(schema(), 0);
  assert.deepEqual(after.fields.map((f) => f.key), ['name', 'notes']);
});

test('updateField merges a patch but never changes the key', () => {
  const after = updateField(schema(), 0, { label: 'Identifier', kind: 'prose', key: 'hacked' });
  const field = after.fields[0];
  assert.equal(field.label, 'Identifier');
  assert.equal(field.kind, 'prose');
  assert.equal(field.key, 'id'); // key is immutable
});

test('updateFieldLabel re-derives a provisional field key from the new label', () => {
  const base = { fields: [{ key: 'newField', label: 'New Field', kind: 'banner', provisional: true }] };
  const after = updateFieldLabel(base, 0, 'Heraldry');
  assert.equal(after.fields[0].label, 'Heraldry');
  assert.equal(after.fields[0].key, 'heraldry'); // key tracks the label while provisional
  assert.equal(base.fields[0].key, 'newField'); // input untouched (pure)
});

test('updateFieldLabel leaves a saved field key immutable', () => {
  const after = updateFieldLabel(schema(), 1, 'Full Name'); // "name" field, not provisional
  assert.equal(after.fields[1].label, 'Full Name');
  assert.equal(after.fields[1].key, 'name'); // key frozen — entry data lives under it
});

test('updateFieldLabel excludes the field own key so a rename does not self-collide', () => {
  const base = { fields: [{ key: 'climate', label: 'Climate', kind: 'text', provisional: true }] };
  // Re-typing the same label must not bump the key to "climate2".
  assert.equal(updateFieldLabel(base, 0, 'Climate').fields[0].key, 'climate');
});

test('updateFieldLabel keeps a provisional key unique against its siblings', () => {
  const base = {
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'newField', label: 'New Field', kind: 'text', provisional: true },
    ],
  };
  assert.equal(updateFieldLabel(base, 1, 'Name').fields[1].key, 'name2');
});

test('updateFieldLabel migrates summary-card pointers when a provisional key changes (#38)', () => {
  const base = {
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'newField', label: 'New Field', kind: 'select', multi: true, provisional: true },
    ],
    summaryCard: {
      title: 'newField',
      subtitle: 'newField',
      emblem: 'newField',
      badges: ['newField', 'name'],
      rows: [{ label: 'New Field', key: 'newField' }],
    },
  };
  const after = updateFieldLabel(base, 1, 'Categories');
  const key = after.fields[1].key;
  assert.equal(key, 'categories');
  assert.equal(after.summaryCard.title, key);
  assert.equal(after.summaryCard.subtitle, key);
  assert.equal(after.summaryCard.emblem, key);
  assert.deepEqual(after.summaryCard.badges, [key, 'name']);
  assert.deepEqual(after.summaryCard.rows, [{ label: 'New Field', key }]);
  assert.equal(base.summaryCard.subtitle, 'newField'); // input not mutated
});

test('updateFieldLabel leaves summary pointers alone for a saved (non-provisional) field', () => {
  const base = {
    fields: [{ key: 'name', label: 'Name', kind: 'text' }],
    summaryCard: { subtitle: 'name' },
  };
  assert.equal(updateFieldLabel(base, 0, 'Full Name').summaryCard.subtitle, 'name');
});

test('stripProvisional drops the marker without touching the rest', () => {
  const base = { fields: [{ key: 'heraldry', label: 'Heraldry', kind: 'banner', provisional: true }] };
  const clean = stripProvisional(base);
  assert.equal('provisional' in clean.fields[0], false);
  assert.equal(clean.fields[0].key, 'heraldry');
  assert.equal(base.fields[0].provisional, true); // input untouched (pure)
});

test('updateFieldAssociation merges into association without clobbering siblings', () => {
  const base = { fields: [{ key: 'map', kind: 'map' }] };
  const withMode = updateFieldAssociation(base, 0, { mode: 'reference' });
  assert.deepEqual(withMode.fields[0].association, { mode: 'reference' });
  const withTarget = updateFieldAssociation(withMode, 0, { refType: 'person' });
  assert.deepEqual(withTarget.fields[0].association, { mode: 'reference', refType: 'person' });
  assert.equal(base.fields[0].association, undefined); // input untouched (pure)
  assert.notEqual(withTarget, withMode);
});

test('updateSummaryCard merges into the descriptor without clobbering siblings', () => {
  const base = schema();
  const withTitle = updateSummaryCard(base, { subtitle: 'name' });
  assert.deepEqual(withTitle.summaryCard, { subtitle: 'name' });
  const withBadges = updateSummaryCard(withTitle, { badges: ['name'] });
  assert.deepEqual(withBadges.summaryCard, { subtitle: 'name', badges: ['name'] });
  assert.equal(base.summaryCard, undefined); // input untouched (pure)
  assert.notEqual(withBadges, withTitle);
});

test('setTitleField repoints titleField without mutating the input', () => {
  const before = schema();
  const after = setTitleField(before, 'notes');
  assert.equal(after.titleField, 'notes');
  assert.equal(before.titleField, 'name'); // input untouched
});

test('repointTitleField is a no-op while titleField still names a real field', () => {
  const before = schema();
  assert.equal(repointTitleField(before), before); // same ref, no clone
});

test('repointTitleField repoints to the first remaining field when its target was deleted', () => {
  // Delete the "name" field (the titleField), then repoint. Deletion is the only way it dangles.
  const orphaned = removeField(schema(), 1); // drops "name"
  const fixed = repointTitleField(orphaned);
  assert.equal(fixed.titleField, 'id'); // first remaining field
  assert.equal(validateSchema(fixed).ok, true); // Save is reachable again — no JSON detour
});

test('repointTitleField skips a leading heading — a heading holds no entry data', () => {
  const s = {
    titleField: 'gone',
    fields: [
      { key: 'sec_top', label: 'Overview', kind: 'heading' },
      { key: 'name', label: 'Name', kind: 'text' },
    ],
  };
  assert.equal(repointTitleField(s).titleField, 'name');
});

test('repointTitleField clears titleField when the type has no fields left', () => {
  const empty = { titleField: 'name', fields: [] };
  assert.equal(repointTitleField(empty).titleField, '');
});

test('moveField reorders in the flat list and clamps at the ends', () => {
  const down = moveField(schema(), 0, 1);
  assert.deepEqual(down.fields.map((f) => f.key), ['name', 'id', 'notes']);
  const clamped = moveField(schema(), 0, -1);
  assert.deepEqual(clamped.fields.map((f) => f.key), ['id', 'name', 'notes']); // no-op
});

test('moveFieldTo reorders (drag downward past a peer)', () => {
  const before = schema();
  const after = moveFieldTo(before, 0, 2); // id → after name
  assert.deepEqual(after.fields.map((f) => f.key), ['name', 'id', 'notes']);
  assert.deepEqual(before.fields.map((f) => f.key), ['id', 'name', 'notes']); // input untouched
});

test('moveFieldTo treats a same-slot / adjacent-below drop as a no-op', () => {
  const before = schema();
  assert.equal(moveFieldTo(before, 0, 0), before); // onto itself
  assert.equal(moveFieldTo(before, 0, 1), before); // just below itself
});

test('moveFieldTo can move a field to the end of the list', () => {
  const after = moveFieldTo(schema(), 0, 3); // id → end
  assert.deepEqual(after.fields.map((f) => f.key), ['name', 'notes', 'id']);
});

test('moveFieldTo ignores an out-of-range source', () => {
  const before = schema();
  assert.equal(moveFieldTo(before, 5, 0), before);
});

// --- newTypeSchema ----------------------------------------------------------

// --- group sub-schema transforms ---

/** A schema whose field 1 is a group with a two-field sub-schema. */
function groupSchema() {
  const s = schema();
  s.fields.splice(1, 0, {
    key: 'crests',
    label: 'Crests',
    kind: 'group',
    fields: [
      { key: 'crest', label: 'Crest', kind: 'banner' },
      { key: 'caption', label: 'Caption', kind: 'text' },
    ],
  });
  return s; // fields: [id, crests(group), name, notes]
}

test('addSubField appends to a group sub-schema without mutating the input', () => {
  const base = groupSchema();
  const after = addSubField(base, 1, { key: 'year', label: 'Year', kind: 'number' });
  assert.equal(after.fields[1].fields.length, 3);
  assert.equal(after.fields[1].fields[2].key, 'year');
  assert.equal(base.fields[1].fields.length, 2); // input untouched
});

test('addSubField seeds a group.fields array when the group had none', () => {
  const s = schema();
  s.fields.push({ key: 'g', label: 'G', kind: 'group' });
  const after = addSubField(s, 3, { key: 'x', label: 'X', kind: 'text' });
  assert.deepEqual(after.fields[3].fields.map((f) => f.key), ['x']);
});

test('removeSubField drops one sub-field', () => {
  const after = removeSubField(groupSchema(), 1, 0);
  assert.deepEqual(after.fields[1].fields.map((f) => f.key), ['caption']);
});

test('updateSubField merges a patch but never changes the sub-key', () => {
  const after = updateSubField(groupSchema(), 1, 1, { key: 'hacked', placeholder: 'e.g. War banner' });
  assert.equal(after.fields[1].fields[1].key, 'caption'); // key immutable
  assert.equal(after.fields[1].fields[1].placeholder, 'e.g. War banner');
});

test('updateSubFieldLabel re-derives a provisional sub-key, unique within the group', () => {
  const base = groupSchema();
  base.fields[1].fields.push({ key: 'newField', label: 'New Field', kind: 'text', provisional: true });
  const after = updateSubFieldLabel(base, 1, 2, 'Caption'); // collides with existing 'caption'
  assert.equal(after.fields[1].fields[2].key, 'caption2');
});

test('updateSubFieldLabel leaves a saved sub-field key immutable', () => {
  const after = updateSubFieldLabel(groupSchema(), 1, 1, 'Motto'); // 'caption', not provisional
  assert.equal(after.fields[1].fields[1].key, 'caption');
  assert.equal(after.fields[1].fields[1].label, 'Motto');
});

test('moveSubField reorders within the group and clamps at the ends', () => {
  const after = moveSubField(groupSchema(), 1, 0, 1);
  assert.deepEqual(after.fields[1].fields.map((f) => f.key), ['caption', 'crest']);
  assert.equal(moveSubField(groupSchema(), 1, 0, -1).fields[1].fields[0].key, 'crest'); // clamp: no-op
});

test('stripProvisional strips markers from group sub-fields too', () => {
  const base = groupSchema();
  base.fields[1].fields[0].provisional = true;
  base.fields[1].provisional = true;
  const clean = stripProvisional(base);
  assert.ok(!('provisional' in clean.fields[1]));
  assert.ok(!('provisional' in clean.fields[1].fields[0]));
});

test('a group built through the sub-field transforms passes validateSchema', () => {
  let s = schema();
  s.fields.push({ key: 'crests', label: 'Crests', kind: 'group', fields: [] });
  s = addSubField(s, 3, { key: 'crest', label: 'Crest', kind: 'banner' });
  s = addSubField(s, 3, { key: 'caption', label: 'Caption', kind: 'text' });
  assert.equal(validateSchema(s).ok, true);
});

test('newTypeSchema mints an opaque type id', () => {
  const a = newTypeSchema('Trade Route');
  const b = newTypeSchema('Trade Route');
  // Opaque and non-derived: the same label yields distinct ids that carry no slug of the label.
  assert.notEqual(a.type, b.type);
  assert.doesNotMatch(a.type, /trade/);
});

test('newTypeSchema produces a schema that passes validation', () => {
  assert.equal(validateSchema(newTypeSchema('Trade Route')).ok, true);
});

test('newTypeSchema starts active with only a title field (id is the opaque doc key)', () => {
  const s = newTypeSchema('Trade Route');
  assert.equal(s.status, 'active');
  assert.equal(s.label, 'Trade Route');
  assert.equal(s.idField, undefined);
  assert.equal(s.titleField, 'title');
  assert.deepEqual(allFieldKeys(s), ['title']);
});

test('newTypeSchema keeps a punctuation-only label verbatim — the id no longer derives from it', () => {
  const s = newTypeSchema('!!!');
  assert.equal(s.label, '!!!');
  assert.equal(validateSchema(s).ok, true);
});

test('newTypeSchema falls back to a default label for a blank one', () => {
  assert.equal(newTypeSchema('   ').label, 'New Type');
  assert.equal(validateSchema(newTypeSchema('   ')).ok, true);
});
