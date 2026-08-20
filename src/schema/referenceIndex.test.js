import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexEntries } from './entryIndex.js';
import { referencesTo, dependentsWarning } from './referenceIndex.js';

// Two types: `person` entries reference a `place` (home, single) and `place` entries
// reference other `place`s (neighbors, multi). Enough to exercise single, multi, self,
// archived, and dangling-target cases.
const SCHEMAS = {
  person: {
    type: 'person',
    titleField: 'name',
    fields: [
      { key: 'name', kind: 'text' },
      { key: 'home', kind: 'reference', targetType: 'place', label: 'Home' },
    ],
  },
  place: {
    type: 'place',
    titleField: 'title',
    fields: [
      { key: 'title', kind: 'text' },
      { key: 'neighbors', kind: 'reference', targetType: 'place', multi: true, label: 'Neighbors' },
    ],
  },
};
const getSchema = (type) => SCHEMAS[type] || null;

const ENTRIES = [
  { type: 'place', id: 'rivertown', status: 'active', title: 'Rivertown', neighbors: ['hilldale'] },
  { type: 'place', id: 'hilldale', status: 'active', title: 'Hilldale', neighbors: ['rivertown', 'hilldale'] },
  { type: 'place', id: 'ghosttown', status: 'archived', title: 'Ghost Town', neighbors: ['rivertown'] },
  { type: 'person', id: 'ada', status: 'active', name: 'Ada', home: 'rivertown' },
  { type: 'person', id: 'bea', status: 'active', name: 'Bea', home: 'hilldale' },
  { type: 'person', id: 'cyd', name: 'Cyd', home: 'rivertown' }, // no status → active
];
const byType = indexEntries(ENTRIES);

test('finds single- and multi-value referencers across types', () => {
  const refs = referencesTo(byType, getSchema, 'place', 'rivertown');
  assert.deepEqual(
    refs.map((r) => r.id).sort(),
    ['ada', 'cyd', 'hilldale'] // ada/cyd via home, hilldale via neighbors; ghosttown archived, excluded
  );
});

test('reports which field(s) do the referencing', () => {
  const refs = referencesTo(byType, getSchema, 'place', 'hilldale');
  const bea = refs.find((r) => r.id === 'bea');
  assert.deepEqual(bea.fields, ['Home']);
});

test('excludes archived referencers — they are not visible breakage', () => {
  const refs = referencesTo(byType, getSchema, 'place', 'rivertown');
  assert.ok(!refs.some((r) => r.id === 'ghosttown'));
});

test('a self-reference does not count', () => {
  // hilldale lists itself among its neighbors; archiving hilldale shouldn't flag hilldale.
  const refs = referencesTo(byType, getSchema, 'place', 'hilldale');
  assert.ok(!refs.some((r) => r.id === 'hilldale'));
});

test('nothing references an unlinked entry', () => {
  assert.deepEqual(referencesTo(byType, getSchema, 'place', 'nowhere'), []);
});

test('missing target type/id short-circuits to empty', () => {
  assert.deepEqual(referencesTo(byType, getSchema, '', 'rivertown'), []);
  assert.deepEqual(referencesTo(byType, getSchema, 'place', ''), []);
});

test('a type with no schema is skipped, not thrown', () => {
  const orphaned = indexEntries([{ type: 'mystery', id: 'x', home: 'rivertown' }]);
  assert.deepEqual(referencesTo(orphaned, getSchema, 'place', 'rivertown'), []);
});

test('finds a reference nested one level inside a group, naming the group in the warning', () => {
  // A `person` whose "crests" group has a reference sub-field pointing at a place. The flat walk
  // can't see it; the group descent must, or archiving the place breaks the link silently.
  const schemas = {
    ...SCHEMAS,
    person: {
      type: 'person',
      titleField: 'name',
      fields: [
        { key: 'name', kind: 'text' },
        {
          key: 'crests',
          kind: 'group',
          label: 'Crests',
          fields: [
            { key: 'caption', kind: 'text' },
            { key: 'origin', kind: 'reference', targetType: 'place', label: 'Origin' },
          ],
        },
      ],
    },
  };
  const entries = indexEntries([
    { type: 'place', id: 'rivertown', status: 'active', title: 'Rivertown', neighbors: [] },
    {
      type: 'person',
      id: 'dev',
      status: 'active',
      name: 'Dev',
      crests: [{ caption: 'Guard', origin: 'rivertown' }, { caption: 'Scholars', origin: 'rivertown' }],
    },
  ]);
  const refs = referencesTo(entries, (t) => schemas[t] || null, 'place', 'rivertown');
  const dev = refs.find((r) => r.id === 'dev');
  assert.ok(dev, 'the nested reference should be found');
  assert.deepEqual(dev.fields, ['Crests']); // names the group once, not each record's sub-field
});

test('dependentsWarning is empty when nothing references the entry', () => {
  assert.equal(dependentsWarning([]), '');
});

test('dependentsWarning names a single referencer with singular grammar', () => {
  const msg = dependentsWarning([{ title: 'Ada' }]);
  assert.match(msg, /^1 entry links here /);
  assert.match(msg, /Ada\.$/);
});

test('dependentsWarning uses plural grammar and lists titles', () => {
  const msg = dependentsWarning([{ title: 'Ada' }, { title: 'Bea' }]);
  assert.match(msg, /^2 entries link here /);
  assert.match(msg, /Ada, Bea\.$/);
});

test('dependentsWarning caps the list and counts the remainder', () => {
  const refs = ['Ada', 'Bea', 'Cyd', 'Dot', 'Eve', 'Fay', 'Gus'].map((title) => ({ title }));
  const msg = dependentsWarning(refs, { max: 5 });
  assert.match(msg, /^7 entries link here /);
  assert.match(msg, /Ada, Bea, Cyd, Dot, Eve, and 2 more\.$/);
});
