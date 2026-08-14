import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSchema,
  listTypes,
  listArchivedTypes,
  loadCodex,
  applyCodexSchemas,
  setOverlaySchema,
  saveSchemaLocal,
  markSchemaSynced,
  resetSchema,
  overlayStorageKey,
} from './schemaStore.js';

/** In-memory stand-in for Web Storage (Node has no localStorage). */
function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    raw: (k) => data.get(k),
  };
}

const noteSchema = { type: 'note', label: 'Note', icon: 'decision', idField: 'id', titleField: 'id', fields: [], status: 'active' };
const personSchema = { type: 'person', label: 'Person', icon: 'civilization', idField: 'id', titleField: 'id', fields: [], status: 'active' };

test('loadCodex populates the type set in order; there is no bundled floor', () => {
  loadCodex('demo', [noteSchema, personSchema], makeStorage());
  assert.deepEqual(listTypes().map((t) => t.type), ['note', 'person']);
});

test('listTypes carries label and icon per type for the nav', () => {
  loadCodex('demo', [noteSchema, personSchema], makeStorage());
  const note = listTypes().find((t) => t.type === 'note');
  assert.equal(note.label, 'Note');
  assert.equal(note.icon, 'decision');
});

test('getSchema returns a loaded schema, undefined for an unknown type', () => {
  loadCodex('demo', [noteSchema], makeStorage());
  assert.equal(getSchema('note').titleField, 'id');
  assert.equal(getSchema('nope'), undefined);
});

test('listTypes excludes archived types but getSchema can still resolve them', () => {
  const archived = { ...personSchema, status: 'archived' };
  loadCodex('demo', [noteSchema, archived], makeStorage());
  assert.deepEqual(listTypes().map((t) => t.type), ['note']);
  assert.equal(getSchema('person').type, 'person'); // resolvable, just not listed
});

test('listArchivedTypes returns only archived types, for the restore affordance', () => {
  const archived = { ...personSchema, status: 'archived' };
  loadCodex('demo', [noteSchema, archived], makeStorage());
  assert.deepEqual(listArchivedTypes().map((t) => t.type), ['person']);
  assert.deepEqual(listTypes().map((t) => t.type), ['note']); // the two are complementary
});

test('a saved local edit wins over the loaded base', () => {
  loadCodex('demo', [noteSchema], makeStorage());
  saveSchemaLocal('note', { ...noteSchema, label: 'Edited' }, makeStorage());
  assert.equal(getSchema('note').label, 'Edited');
});

test('resetSchema drops the local edit and falls back to the loaded base', () => {
  const storage = makeStorage();
  loadCodex('demo', [noteSchema], storage);
  saveSchemaLocal('note', { ...noteSchema, label: 'Edited' }, storage);
  resetSchema('note', storage);
  assert.equal(getSchema('note').label, 'Note'); // base remains; not removed
});

test('overlay edits are persisted under a per-codex storage key', () => {
  const storage = makeStorage();
  loadCodex('alpha', [noteSchema], storage);
  saveSchemaLocal('note', { ...noteSchema, label: 'Alpha edit' }, storage);
  const stored = JSON.parse(storage.raw(overlayStorageKey('alpha')));
  assert.equal(stored.note.label, 'Alpha edit');
});

test("switching codices does not bleed one codex's local edits into another", () => {
  const storage = makeStorage();
  loadCodex('alpha', [noteSchema], storage);
  saveSchemaLocal('note', { ...noteSchema, label: 'Alpha edit' }, storage);

  loadCodex('beta', [noteSchema], storage); // different codex, same type key
  assert.equal(getSchema('note').label, 'Note'); // beta sees base, not alpha's edit
});

test('a persisted per-codex edit is rehydrated when that codex loads', () => {
  const storage = makeStorage();
  loadCodex('alpha', [noteSchema], storage);
  saveSchemaLocal('note', { ...noteSchema, label: 'Alpha edit' }, storage);
  loadCodex('beta', [noteSchema], storage);
  loadCodex('alpha', [noteSchema], storage); // return to alpha
  assert.equal(getSchema('note').label, 'Alpha edit');
});

test('applyCodexSchemas replaces the live base without dropping unsaved overlay edits', () => {
  loadCodex('demo', [noteSchema], makeStorage());
  setOverlaySchema('note', { ...noteSchema, label: 'Unsaved' });
  applyCodexSchemas([{ ...noteSchema, label: 'Server' }, personSchema]);
  assert.equal(getSchema('note').label, 'Unsaved'); // overlay still wins
  assert.equal(getSchema('person').label, 'Person'); // new base type is visible
});

test('markSchemaSynced retires the draft so a fresh base snapshot stops being shadowed', () => {
  const storage = makeStorage();
  loadCodex('demo', [noteSchema], storage);
  // Author saves an edit (overlay + localStorage), then the server acks it.
  saveSchemaLocal('note', { ...noteSchema, label: 'Draft' }, storage);
  assert.equal(getSchema('note').label, 'Draft');
  markSchemaSynced('note', storage);

  // Base is now authoritative: an out-of-band edit to a locally-touched type is visible…
  applyCodexSchemas([{ ...noteSchema, label: 'Edited elsewhere' }]);
  assert.equal(getSchema('note').label, 'Edited elsewhere');
  // …and an out-of-band delete no longer resurrects from the overlay.
  applyCodexSchemas([]);
  assert.equal(getSchema('note'), undefined);
  // The persisted draft is gone too, so a reload can't rehydrate the stale shadow.
  assert.equal(storage.raw(overlayStorageKey('demo')), '{}');
});

test('markSchemaSynced is a no-op for a type with no draft', () => {
  const storage = makeStorage();
  loadCodex('demo', [noteSchema], storage);
  assert.doesNotThrow(() => markSchemaSynced('note', storage));
  assert.equal(getSchema('note').label, 'Note');
});

test('loadCodex tolerates missing/corrupt storage without throwing', () => {
  assert.doesNotThrow(() => loadCodex('demo', [noteSchema], null));
  const corrupt = makeStorage({ [overlayStorageKey('demo')]: '{not json' });
  assert.doesNotThrow(() => loadCodex('demo', [noteSchema], corrupt));
});
