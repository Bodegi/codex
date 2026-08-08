import { test } from 'node:test';
import assert from 'node:assert/strict';

import { filterRows } from './filterRows.js';

const rows = [
  { id: 'a', label: 'Red Dragon' },
  { id: 'b', label: 'Blue Wyvern' },
  { id: 'c', label: 'red herring' },
  { id: 'd', label: null },
];
const byLabel = (r) => r.label;

test('empty or whitespace query keeps every row (same reference)', () => {
  assert.equal(filterRows(rows, '', byLabel), rows);
  assert.equal(filterRows(rows, '   ', byLabel), rows);
  assert.equal(filterRows(rows, null, byLabel), rows);
});

test('substring match is case-insensitive', () => {
  const out = filterRows(rows, 'RED', byLabel);
  assert.deepEqual(out.map((r) => r.id), ['a', 'c']);
});

test('multiple tokens are AND-combined across the extracted text', () => {
  assert.deepEqual(filterRows(rows, 'red dragon', byLabel).map((r) => r.id), ['a']);
  // Order-independent, and every token must appear.
  assert.deepEqual(filterRows(rows, 'dragon blue', byLabel).map((r) => r.id), []);
});

test('no match yields an empty array', () => {
  assert.deepEqual(filterRows(rows, 'griffin', byLabel), []);
});

test('a null/undefined extracted value never throws and simply does not match', () => {
  assert.deepEqual(filterRows(rows, 'dragon', byLabel).map((r) => r.id), ['a']);
  assert.deepEqual(filterRows(rows, '', byLabel).map((r) => r.id), ['a', 'b', 'c', 'd']);
});

test('extractor can flatten derived/array text (e.g. joined names)', () => {
  const invites = [
    { token: '1', label: 'Discord', redeemers: [{ displayName: 'Ada' }, { displayName: 'Grace' }] },
    { token: '2', label: 'Twitter', redeemers: [] },
  ];
  const toText = (r) => `${r.label} ${r.redeemers.map((u) => u.displayName).join(' ')}`;
  assert.deepEqual(filterRows(invites, 'grace', toText).map((r) => r.token), ['1']);
});

test('missing rows argument is treated as empty', () => {
  assert.deepEqual(filterRows(undefined, 'x', byLabel), []);
});
