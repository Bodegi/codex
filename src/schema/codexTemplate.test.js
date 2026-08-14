import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTemplateSchemas } from './codexTemplate.js';

const source = [
  {
    type: 'note',
    label: 'Note',
    icon: 'decision',
    idField: 'id',
    titleField: 'title',
    status: 'active',
    updatedAt: '2026-08-01T00:00:00.000Z',
    fields: [{ key: 'id', label: 'ID', kind: 'text' }],
  },
  {
    type: 'archivedType',
    label: 'Old',
    status: 'archived',
    fields: [],
  },
];

test('copies the type structure of active source schemas', () => {
  const [note, ...rest] = buildTemplateSchemas(source);
  assert.equal(rest.length, 0); // the archived type is dropped
  assert.equal(note.type, 'note');
  assert.equal(note.label, 'Note');
  assert.equal(note.icon, 'decision');
  assert.equal(note.idField, 'id');
  assert.equal(note.titleField, 'title');
  assert.deepEqual(note.fields, [{ key: 'id', label: 'ID', kind: 'text' }]);
});

test('normalizes every copied schema to active status', () => {
  const result = buildTemplateSchemas(source);
  assert.ok(result.every((s) => s.status === 'active'));
});

test('drops the source updatedAt (the new codex writes its own on save)', () => {
  const [note] = buildTemplateSchemas(source);
  assert.equal('updatedAt' in note, false);
});

test('deep-clones fields so the copy never aliases the source', () => {
  const [note] = buildTemplateSchemas(source);
  note.fields[0].key = 'mutated';
  assert.equal(source[0].fields[0].key, 'id');
});

test('a blank template (no source) yields no schemas', () => {
  assert.deepEqual(buildTemplateSchemas([]), []);
  assert.deepEqual(buildTemplateSchemas(), []);
});
