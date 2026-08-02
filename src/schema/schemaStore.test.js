import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSchema,
  listTypes,
  setOverlaySchema,
  saveSchemaLocal,
  resetSchema,
  hydrateOverlayFromStorage,
  OVERLAY_STORAGE_KEY,
} from './schemaStore.js';

/** In-memory stand-in for Web Storage (Node has no localStorage). */
function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    raw: () => data.get(OVERLAY_STORAGE_KEY),
  };
}

const demoSchema = { type: 'demo', label: 'Demo', idField: 'id', titleField: 'id', sections: [] };

test('listTypes returns the bundled entry types in order', () => {
  const types = listTypes().map((t) => t.type);
  assert.deepEqual(types, ['civilization', 'mod', 'region', 'decision']);
});

test('listTypes carries a display label per type', () => {
  const civ = listTypes().find((t) => t.type === 'civilization');
  assert.equal(civ.label, 'Civilization');
});

test('listTypes carries the schema icon key per type so nav can render it', () => {
  const civ = listTypes().find((t) => t.type === 'civilization');
  assert.equal(civ.icon, 'civilization');
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

test('saveSchemaLocal applies the overlay live and caches it to storage', () => {
  const storage = makeStorage();
  saveSchemaLocal('demo', demoSchema, storage);
  assert.deepEqual(getSchema('demo'), demoSchema);
  assert.deepEqual(JSON.parse(storage.raw()), { demo: demoSchema });
  setOverlaySchema('demo', null); // cleanup module state
});

test('an overlay wins over the bundled seed', () => {
  const storage = makeStorage();
  const custom = { type: 'civilization', label: 'Civ', idField: 'id', titleField: 'id', sections: [] };
  saveSchemaLocal('civilization', custom, storage);
  assert.equal(getSchema('civilization').label, 'Civ');
  resetSchema('civilization', storage);
  assert.equal(getSchema('civilization').label, 'Civilization'); // back to seed
});

test('hydrateOverlayFromStorage loads persisted edits into the overlay', () => {
  const storage = makeStorage({ [OVERLAY_STORAGE_KEY]: JSON.stringify({ demo: demoSchema }) });
  hydrateOverlayFromStorage(storage);
  assert.deepEqual(getSchema('demo'), demoSchema);
  setOverlaySchema('demo', null); // cleanup
});

test('resetSchema drops the overlay and the cached entry', () => {
  const storage = makeStorage();
  saveSchemaLocal('demo', demoSchema, storage);
  resetSchema('demo', storage);
  assert.equal(getSchema('demo'), undefined);
  assert.deepEqual(JSON.parse(storage.raw()), {});
});

test('hydrate tolerates missing/corrupt storage without throwing', () => {
  assert.doesNotThrow(() => hydrateOverlayFromStorage(null));
  const corrupt = makeStorage({ [OVERLAY_STORAGE_KEY]: '{not json' });
  assert.doesNotThrow(() => hydrateOverlayFromStorage(corrupt));
});
