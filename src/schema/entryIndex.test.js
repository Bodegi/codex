import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexEntries, activeEntries, archivedEntries, findEntry } from './entryIndex.js';

const ENTRIES = [
  { type: 'note', id: 'welcome', status: 'active', title: 'Welcome' },
  { type: 'note', id: 'old', status: 'archived', title: 'Old' },
  { type: 'person', id: 'ada', status: 'active', name: 'Ada' },
  { type: 'person', id: 'legacy' }, // no status → treated as active
];

test('indexEntries groups entries by type', () => {
  const byType = indexEntries(ENTRIES);
  assert.deepEqual(Object.keys(byType).sort(), ['note', 'person']);
  assert.equal(byType.note.length, 2);
});

test('indexEntries skips entries without a type', () => {
  const byType = indexEntries([{ id: 'x' }, { type: 'note', id: 'y' }]);
  assert.deepEqual(Object.keys(byType), ['note']);
});

test('activeEntries excludes archived entries', () => {
  const byType = indexEntries(ENTRIES);
  assert.deepEqual(activeEntries(byType, 'note').map((e) => e.id), ['welcome']);
});

test('activeEntries treats a missing status as active', () => {
  const byType = indexEntries(ENTRIES);
  assert.deepEqual(activeEntries(byType, 'person').map((e) => e.id), ['ada', 'legacy']);
});

test('activeEntries returns an empty array for an unknown type', () => {
  assert.deepEqual(activeEntries({}, 'nope'), []);
});

test('archivedEntries returns only archived entries of a type', () => {
  const byType = indexEntries(ENTRIES);
  assert.deepEqual(archivedEntries(byType, 'note').map((e) => e.id), ['old']);
  assert.deepEqual(archivedEntries(byType, 'person'), []); // none archived
});

test('findEntry returns the full entry by type+id, including archived ones', () => {
  const byType = indexEntries(ENTRIES);
  assert.equal(findEntry(byType, 'note', 'old').title, 'Old');
});

test('findEntry returns null when the entry is absent', () => {
  const byType = indexEntries(ENTRIES);
  assert.equal(findEntry(byType, 'note', 'ghost'), null);
});
