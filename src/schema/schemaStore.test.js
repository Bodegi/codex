import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getSchema, listTypes } from './schemaStore.js';

test('listTypes returns the bundled entry types in order', () => {
  const types = listTypes().map((t) => t.type);
  assert.deepEqual(types, ['civilization', 'mod', 'region', 'decision']);
});

test('listTypes carries a display label per type', () => {
  const civ = listTypes().find((t) => t.type === 'civilization');
  assert.equal(civ.label, 'Civilization');
});

test('getSchema returns the schema for a known type', () => {
  const schema = getSchema('civilization');
  assert.equal(schema.type, 'civilization');
  assert.equal(schema.titleField, 'name');
  assert.ok(Array.isArray(schema.sections));
  assert.ok(schema.sections.length > 0);
});

test('getSchema returns undefined for an unknown type', () => {
  assert.equal(getSchema('nope'), undefined);
});
