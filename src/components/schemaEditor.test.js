import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  slugToCamel,
  allFieldKeys,
  deriveKey,
  addField,
  removeField,
  updateField,
  moveField,
  addSection,
  removeSection,
  renameSection,
  moveSection,
} from './schemaEditor.js';

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

test('moveField reorders within a section and clamps at the ends', () => {
  const down = moveField(schema(), 0, 0, 1);
  assert.deepEqual(down.sections[0].fields.map((f) => f.key), ['name', 'id']);
  const clamped = moveField(schema(), 0, 0, -1);
  assert.deepEqual(clamped.sections[0].fields.map((f) => f.key), ['id', 'name']); // no-op
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
