import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildNavModel } from './navModel.js';

const TYPES = [
  { type: 'civilization', label: 'Civilization', icon: 'civilization' },
  { type: 'mod', label: 'Mod', icon: 'mod' },
];

test('builds one node per type, in order, carrying label and icon', () => {
  const nav = buildNavModel(TYPES, {});
  assert.deepEqual(
    nav.map((n) => [n.type, n.label, n.icon]),
    [
      ['civilization', 'Civilization', 'civilization'],
      ['mod', 'Mod', 'mod'],
    ]
  );
});

test('attaches each type its entries from entriesByType, preserving order', () => {
  const entriesByType = {
    civilization: [
      { id: 'dwarves', title: 'Dwarves' },
      { id: 'orcs', title: 'Orcs' },
    ],
  };
  const nav = buildNavModel(TYPES, entriesByType);
  const civ = nav.find((n) => n.type === 'civilization');
  assert.deepEqual(civ.entries.map((e) => e.id), ['dwarves', 'orcs']);
});

test('a type with no entries gets an empty entries array, never undefined', () => {
  const nav = buildNavModel(TYPES, { civilization: [{ id: 'dwarves', title: 'Dwarves' }] });
  const mod = nav.find((n) => n.type === 'mod');
  assert.deepEqual(mod.entries, []);
});

test('no types yields an empty nav', () => {
  assert.deepEqual(buildNavModel([], { civilization: [{ id: 'x', title: 'X' }] }), []);
});

test('entriesByType keys with no matching type are ignored', () => {
  const nav = buildNavModel(TYPES, { ghost: [{ id: 'boo', title: 'Boo' }] });
  assert.equal(nav.length, 2);
  assert.ok(nav.every((n) => n.entries.length === 0));
});
