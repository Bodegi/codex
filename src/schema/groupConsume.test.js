import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasData, planConsume, consumeEntry, consumeEntries } from './groupConsume.js';

// A saved schema: two top-level content fields, a title, no groups.
function savedSchema() {
  return {
    type: 'person',
    label: 'Person',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'motto', label: 'Motto', kind: 'text' },
      { key: 'sigil', label: 'Sigil', kind: 'banner' },
    ],
  };
}

// The working schema after creating a new "Heraldry" group that consumes motto + sigil.
function afterConsume() {
  return {
    type: 'person',
    label: 'Person',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      {
        key: 'heraldry',
        label: 'Heraldry',
        kind: 'group',
        fields: [
          { key: 'motto', label: 'Motto', kind: 'text' },
          { key: 'sigil', label: 'Sigil', kind: 'banner' },
        ],
      },
    ],
  };
}

test('hasData: blanks are empty, real values (incl. 0 / false) are present', () => {
  assert.equal(hasData(undefined), false);
  assert.equal(hasData(null), false);
  assert.equal(hasData(''), false);
  assert.equal(hasData('   '), false);
  assert.equal(hasData([]), false);
  assert.equal(hasData({}), false);
  assert.equal(hasData('x'), true);
  assert.equal(hasData(0), true);
  assert.equal(hasData(false), true);
  assert.equal(hasData(['a']), true);
  assert.equal(hasData({ url: 'x' }), true);
});

test('planConsume: a new group absorbing prior top-level fields', () => {
  const plans = planConsume(savedSchema(), afterConsume());
  assert.deepEqual(plans, [
    {
      groupKey: 'heraldry',
      groupLabel: 'Heraldry',
      consumedKeys: ['motto', 'sigil'],
      consumed: [
        { key: 'motto', label: 'Motto' },
        { key: 'sigil', label: 'Sigil' },
      ],
    },
  ]);
});

test('planConsume: a new group with only brand-new sub-fields consumes nothing', () => {
  const next = savedSchema();
  next.fields.push({
    key: 'notes',
    label: 'Notes',
    kind: 'group',
    fields: [{ key: 'note', label: 'Note', kind: 'text', provisional: true }],
  });
  assert.deepEqual(planConsume(savedSchema(), next), []);
});

test('planConsume: moving into a PRE-EXISTING group is not a consume (stays warn-and-orphan)', () => {
  const prev = afterConsume(); // heraldry already exists
  const next = structuredClone(prev);
  // Move top-level name into the existing heraldry group.
  const nameIdx = next.fields.findIndex((f) => f.key === 'name');
  const [name] = next.fields.splice(nameIdx, 1);
  next.fields.find((f) => f.key === 'heraldry').fields.push(name);
  assert.deepEqual(planConsume(prev, next), []);
});

test('consumeEntry: wraps top-level values into a single record, removes originals', () => {
  const entry = { id: 'e1', type: 'person', name: 'Ada', motto: 'Onward', sigil: { url: 'flag.png' }, version: 3 };
  const { changed, entry: out } = consumeEntry(entry, 'heraldry', ['motto', 'sigil']);
  assert.equal(changed, true);
  assert.deepEqual(out.heraldry, [{ motto: 'Onward', sigil: { url: 'flag.png' } }]);
  assert.equal('motto' in out, false);
  assert.equal('sigil' in out, false);
  assert.equal(out.name, 'Ada'); // untouched
  assert.equal(out.version, 3);
  // Input is not mutated.
  assert.equal(entry.motto, 'Onward');
});

test('consumeEntry: only data-bearing values enter the record', () => {
  const entry = { id: 'e2', type: 'person', motto: '  ', sigil: { url: 'flag.png' } };
  const { entry: out } = consumeEntry(entry, 'heraldry', ['motto', 'sigil']);
  assert.deepEqual(out.heraldry, [{ sigil: { url: 'flag.png' } }]); // blank motto dropped
  assert.equal('motto' in out, false); // still removed from top level
});

test('consumeEntry: no data under any consumed key → empty group, no fabricated record', () => {
  const entry = { id: 'e3', type: 'person', name: 'Ada', motto: '', sigil: null };
  const { changed, entry: out } = consumeEntry(entry, 'heraldry', ['motto', 'sigil']);
  assert.equal(changed, true);
  assert.deepEqual(out.heraldry, []);
  assert.equal('motto' in out, false);
  assert.equal('sigil' in out, false);
});

test('consumeEntry: idempotent — an already-migrated entry is unchanged', () => {
  const migrated = { id: 'e4', type: 'person', name: 'Ada', heraldry: [{ motto: 'Onward' }] };
  const result = consumeEntry(migrated, 'heraldry', ['motto', 'sigil']);
  assert.equal(result.changed, false);
  assert.equal(result.entry, migrated); // same reference, untouched
});

test('consumeEntry: an entry that never held any consumed field is unchanged', () => {
  const entry = { id: 'e5', type: 'person', name: 'Ada' };
  const result = consumeEntry(entry, 'heraldry', ['motto', 'sigil']);
  assert.equal(result.changed, false);
  assert.equal(result.entry, entry);
});

test('consumeEntries: returns only the changed docs', () => {
  const entries = [
    { id: 'a', type: 'person', name: 'Ada', motto: 'Onward' },
    { id: 'b', type: 'person', name: 'Bea' }, // no consumed data
    { id: 'c', type: 'person', name: 'Cy', heraldry: [{ motto: 'Done' }] }, // already migrated
    { id: 'd', type: 'person', name: 'Dot', sigil: { url: 'x.png' } },
  ];
  const migrated = consumeEntries(entries, 'heraldry', ['motto', 'sigil']);
  assert.deepEqual(migrated.map((e) => e.id), ['a', 'd']);
  assert.deepEqual(migrated[0].heraldry, [{ motto: 'Onward' }]);
  assert.deepEqual(migrated[1].heraldry, [{ sigil: { url: 'x.png' } }]);
});
