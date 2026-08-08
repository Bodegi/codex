import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneStarterSchemas } from './starterTypes.js';

// A miniature two-type kit that mirrors the demo fixture's cross-reference shape.
const kit = () => [
  {
    type: 'note',
    label: 'Note',
    status: 'active',
    sections: [
      { title: 'Note', fields: [{ key: 'id', kind: 'text' }] },
      { title: 'Map', fields: [{ key: 'map', kind: 'map', association: { mode: 'both', refType: 'person' } }] },
    ],
  },
  {
    type: 'person',
    label: 'Person',
    status: 'active',
    sections: [
      { title: 'Person', fields: [{ key: 'favoriteNote', kind: 'reference', targetType: 'note' }] },
    ],
  },
];

test('clones both types when the ids are free', () => {
  const out = cloneStarterSchemas(kit(), []);
  assert.deepEqual(out.map((s) => s.type), ['note', 'person']);
});

test('does not mutate the sources', () => {
  const sources = kit();
  cloneStarterSchemas(sources, ['note']);
  assert.equal(sources[0].type, 'note');
});

test('every clone is active', () => {
  const out = cloneStarterSchemas(kit(), []);
  assert.ok(out.every((s) => s.status === 'active'));
});

test('preserves in-kit references when ids are unchanged', () => {
  const out = cloneStarterSchemas(kit(), []);
  assert.equal(out[0].sections[1].fields[0].association.refType, 'person');
  assert.equal(out[1].sections[0].fields[0].targetType, 'note');
});

test('remaps in-kit references when a colliding id shifts', () => {
  const out = cloneStarterSchemas(kit(), ['note', 'person']);
  assert.deepEqual(out.map((s) => s.type), ['note-2', 'person-2']);
  // note's map still points at the (renamed) person, and person still points at the (renamed) note.
  assert.equal(out[0].sections[1].fields[0].association.refType, 'person-2');
  assert.equal(out[1].sections[0].fields[0].targetType, 'note-2');
});

test('leaves references to out-of-kit types untouched', () => {
  const one = [
    {
      type: 'note',
      label: 'Note',
      sections: [{ title: 'x', fields: [{ key: 'r', kind: 'reference', targetType: 'place' }] }],
    },
  ];
  const out = cloneStarterSchemas(one, ['note']);
  assert.equal(out[0].type, 'note-2');
  assert.equal(out[0].sections[0].fields[0].targetType, 'place');
});
