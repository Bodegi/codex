import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  slugToCamel,
  allFieldKeys,
  deriveKey,
  addField,
  removeField,
  updateField,
  updateFieldAssociation,
  updateSummaryCard,
  moveField,
  moveFieldTo,
  addSection,
  removeSection,
  renameSection,
  moveSection,
  moveSectionTo,
  newTypeSchema,
} from './schemaEditor.js';
import { validateSchema } from '../schema/schemaValidate.js';

function schema() {
  return {
    type: 'demo',
    label: 'Demo',
    idField: 'id',
    titleField: 'name',
    sections: [
      { title: 'Core', fields: [{ key: 'id', label: 'ID', kind: 'text' }, { key: 'name', label: 'Name', kind: 'text' }] },
      { title: 'Extra', fields: [{ key: 'notes', label: 'Notes', kind: 'prose' }] },
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

test('allFieldKeys gathers keys across every section', () => {
  assert.deepEqual(allFieldKeys(schema()), ['id', 'name', 'notes']);
});

test('deriveKey returns the base when free, else a numbered variant', () => {
  assert.equal(deriveKey('Climate', ['id', 'name']), 'climate');
  assert.equal(deriveKey('Name', ['name']), 'name2');
  assert.equal(deriveKey('Name', ['name', 'name2']), 'name3');
});

test('addField appends without mutating the input', () => {
  const before = schema();
  const after = addField(before, 0, { key: 'climate', label: 'Climate', kind: 'text' });
  assert.equal(after.sections[0].fields.length, 3);
  assert.equal(before.sections[0].fields.length, 2); // original untouched
});

test('removeField drops the field', () => {
  const after = removeField(schema(), 0, 0);
  assert.deepEqual(after.sections[0].fields.map((f) => f.key), ['name']);
});

test('updateField merges a patch but never changes the key', () => {
  const after = updateField(schema(), 0, 0, { label: 'Identifier', kind: 'prose', key: 'hacked' });
  const field = after.sections[0].fields[0];
  assert.equal(field.label, 'Identifier');
  assert.equal(field.kind, 'prose');
  assert.equal(field.key, 'id'); // key is immutable
});

test('updateFieldAssociation merges into association without clobbering siblings', () => {
  const base = { sections: [{ title: 'Map', fields: [{ key: 'map', kind: 'map' }] }] };
  const withMode = updateFieldAssociation(base, 0, 0, { mode: 'reference' });
  assert.deepEqual(withMode.sections[0].fields[0].association, { mode: 'reference' });
  const withTarget = updateFieldAssociation(withMode, 0, 0, { refType: 'person' });
  assert.deepEqual(withTarget.sections[0].fields[0].association, { mode: 'reference', refType: 'person' });
  assert.equal(base.sections[0].fields[0].association, undefined); // input untouched (pure)
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

test('moveField reorders within a section and clamps at the ends', () => {
  const down = moveField(schema(), 0, 0, 1);
  assert.deepEqual(down.sections[0].fields.map((f) => f.key), ['name', 'id']);
  const clamped = moveField(schema(), 0, 0, -1);
  assert.deepEqual(clamped.sections[0].fields.map((f) => f.key), ['id', 'name']); // no-op
});

test('moveFieldTo reorders within a section (drag downward past a peer)', () => {
  const before = schema();
  const after = moveFieldTo(before, 0, 0, 0, 2); // id → end of Core
  assert.deepEqual(after.sections[0].fields.map((f) => f.key), ['name', 'id']);
  assert.deepEqual(before.sections[0].fields.map((f) => f.key), ['id', 'name']); // input untouched
});

test('moveFieldTo treats a same-slot / adjacent-below drop as a no-op', () => {
  const before = schema();
  assert.equal(moveFieldTo(before, 0, 0, 0, 0), before); // onto itself
  assert.equal(moveFieldTo(before, 0, 0, 0, 1), before); // just below itself
});

test('moveFieldTo moves a field across sections', () => {
  const after = moveFieldTo(schema(), 0, 0, 1, 0); // Core.id → front of Extra
  assert.deepEqual(after.sections[0].fields.map((f) => f.key), ['name']);
  assert.deepEqual(after.sections[1].fields.map((f) => f.key), ['id', 'notes']);
});

test('moveFieldTo ignores out-of-range source/target sections', () => {
  const before = schema();
  assert.equal(moveFieldTo(before, 5, 0, 0, 0), before);
  assert.equal(moveFieldTo(before, 0, 9, 1, 0), before);
});

test('addSection appends an empty section', () => {
  const after = addSection(schema(), 'Imagery');
  assert.equal(after.sections.length, 3);
  assert.deepEqual(after.sections[2], { title: 'Imagery', fields: [] });
});

test('removeSection drops the section', () => {
  const after = removeSection(schema(), 1);
  assert.deepEqual(after.sections.map((s) => s.title), ['Core']);
});

test('renameSection changes the title', () => {
  const after = renameSection(schema(), 0, 'Identity');
  assert.equal(after.sections[0].title, 'Identity');
});

test('moveSection reorders and clamps', () => {
  const down = moveSection(schema(), 0, 1);
  assert.deepEqual(down.sections.map((s) => s.title), ['Extra', 'Core']);
  const clamped = moveSection(schema(), 1, 1);
  assert.deepEqual(clamped.sections.map((s) => s.title), ['Core', 'Extra']); // no-op
});

test('moveSectionTo reorders to an arbitrary index and no-ops on same/adjacent', () => {
  const toEnd = moveSectionTo(schema(), 0, 2); // Core → end
  assert.deepEqual(toEnd.sections.map((s) => s.title), ['Extra', 'Core']);
  const toFront = moveSectionTo(schema(), 1, 0); // Extra → front
  assert.deepEqual(toFront.sections.map((s) => s.title), ['Extra', 'Core']);
  const before = schema();
  assert.equal(moveSectionTo(before, 0, 0), before); // onto itself
  assert.equal(moveSectionTo(before, 0, 1), before); // just below itself
});

// --- newTypeSchema ----------------------------------------------------------

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
  const keys = allFieldKeys(s);
  assert.deepEqual(keys, ['title']);
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
