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

// A deterministic stand-in for the opaque-id mint, so assertions can name the ids.
const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

test('clones one schema per source, each with a fresh opaque id', () => {
  const out = cloneStarterSchemas(kit(), counter());
  assert.deepEqual(out.map((s) => s.type), ['id-1', 'id-2']);
});

test('does not mutate the sources', () => {
  const sources = kit();
  cloneStarterSchemas(sources, counter());
  assert.equal(sources[0].type, 'note');
});

test('every clone is active', () => {
  const out = cloneStarterSchemas(kit(), counter());
  assert.ok(out.every((s) => s.status === 'active'));
});

test('remaps in-kit references to the clones new ids', () => {
  const out = cloneStarterSchemas(kit(), counter());
  // note (id-1) points at person (id-2); person (id-2) points back at note (id-1).
  assert.equal(out[0].sections[1].fields[0].association.refType, 'id-2');
  assert.equal(out[1].sections[0].fields[0].targetType, 'id-1');
});

test('leaves references to out-of-kit types untouched', () => {
  const one = [
    {
      type: 'note',
      label: 'Note',
      sections: [{ title: 'x', fields: [{ key: 'r', kind: 'reference', targetType: 'place' }] }],
    },
  ];
  const out = cloneStarterSchemas(one, counter());
  assert.equal(out[0].type, 'id-1');
  assert.equal(out[0].sections[0].fields[0].targetType, 'place');
});
