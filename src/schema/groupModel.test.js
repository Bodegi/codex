import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_INNER_KINDS,
  isAllowedInnerKind,
  groupSubFields,
  normalizeGroup,
  isEmptyGroup,
  recordLabel,
  groupSchemaErrors,
} from './groupModel.js';

// --- allow-list ---

test('the allow-list holds the scalar/heraldry kinds and excludes nesting/structural/media kinds', () => {
  for (const k of ['text', 'prose', 'number', 'date', 'select', 'boolean', 'reference', 'banner']) {
    assert.equal(isAllowedInnerKind(k), true, `${k} should be allowed`);
  }
  for (const k of ['group', 'heading', 'hero', 'gallery', 'map', 'bogus']) {
    assert.equal(isAllowedInnerKind(k), false, `${k} should not be allowed`);
  }
  assert.equal(ALLOWED_INNER_KINDS.size, 8);
});

// --- sub-schema access ---

test('groupSubFields returns the fields array, or [] when absent/malformed', () => {
  assert.deepEqual(groupSubFields({ fields: [{ key: 'a' }] }), [{ key: 'a' }]);
  assert.deepEqual(groupSubFields({}), []);
  assert.deepEqual(groupSubFields({ fields: 'nope' }), []);
  assert.deepEqual(groupSubFields(null), []);
});

// --- normalize ---

test('normalizeGroup keeps plain record objects, drops non-objects and arrays, and clones', () => {
  const input = [{ a: 1 }, null, 'x', 42, ['nested'], { b: 2 }];
  const out = normalizeGroup(input);
  assert.deepEqual(out, [{ a: 1 }, { b: 2 }]);
  // Clones — mutating the result never touches the caller's value.
  out[0].a = 99;
  assert.equal(input[0].a, 1);
});

test('normalizeGroup of a non-array is an empty list', () => {
  assert.deepEqual(normalizeGroup(undefined), []);
  assert.deepEqual(normalizeGroup(null), []);
  assert.deepEqual(normalizeGroup('a,b'), []);
  assert.deepEqual(normalizeGroup({ 0: { a: 1 } }), []);
});

test('isEmptyGroup is true for no-record values, false once a record exists', () => {
  assert.equal(isEmptyGroup(undefined), true);
  assert.equal(isEmptyGroup([]), true);
  assert.equal(isEmptyGroup(['not-an-object']), true);
  assert.equal(isEmptyGroup([{ a: 1 }]), false);
});

// --- record label ---

test('recordLabel uses the itemLabel sub-value when set + non-empty, else a positional Item N', () => {
  const field = { itemLabel: 'caption' };
  assert.equal(recordLabel(field, { caption: 'Knights' }, 0), 'Knights');
  assert.equal(recordLabel(field, { caption: '  Guild  ' }, 1), 'Guild');
  assert.equal(recordLabel(field, { caption: '' }, 2), 'Item 3');
  assert.equal(recordLabel(field, {}, 0), 'Item 1');
  // No itemLabel designated → always positional.
  assert.equal(recordLabel({}, { caption: 'Knights' }, 4), 'Item 5');
  // A non-scalar itemLabel value (e.g. a nested banner object) falls back to positional.
  assert.equal(recordLabel(field, { caption: { base: 'red' } }, 0), 'Item 1');
  // A numeric scalar stringifies.
  assert.equal(recordLabel({ itemLabel: 'year' }, { year: 1420 }, 0), '1420');
});

// --- validation ---

const validGroup = () => ({
  key: 'heraldry',
  kind: 'group',
  label: 'Heraldry',
  itemLabel: 'caption',
  fields: [
    { key: 'crest', kind: 'banner', label: 'Crest' },
    { key: 'caption', kind: 'text', label: 'Caption' },
  ],
});

test('a well-formed group has no errors', () => {
  assert.deepEqual(groupSchemaErrors(validGroup()), []);
});

test('a group with no components is rejected', () => {
  assert.match(groupSchemaErrors({ key: 'g', fields: [] })[0], /at least one component/);
  assert.match(groupSchemaErrors({ key: 'g' })[0], /at least one component/);
});

test('a nested group is rejected as beyond one level', () => {
  const g = validGroup();
  g.fields.push({ key: 'inner', kind: 'group', fields: [{ key: 'x', kind: 'text' }] });
  assert.match(groupSchemaErrors(g).join(' '), /may not contain another group/);
});

test('a disallowed inner kind (heading/hero/gallery/map) is rejected', () => {
  for (const kind of ['heading', 'hero', 'gallery', 'map']) {
    const g = validGroup();
    g.fields.push({ key: 'bad', kind });
    assert.match(groupSchemaErrors(g).join(' '), /can't be nested/, `${kind} should be rejected`);
  }
});

test('a nested reference without a target, and a nested select without options, are rejected', () => {
  const g = validGroup();
  g.fields.push({ key: 'link', kind: 'reference' });
  g.fields.push({ key: 'pick', kind: 'select', options: [] });
  const msg = groupSchemaErrors(g).join(' ');
  assert.match(msg, /Reference "link"[^]*must have a target type/);
  assert.match(msg, /Select "pick"[^]*must define at least one option/);
});

test('missing and duplicate sub-keys are each reported', () => {
  const g = validGroup();
  g.fields.push({ key: '', kind: 'text' });
  g.fields.push({ key: 'crest', kind: 'text' }); // collides with the banner's key
  const msg = groupSchemaErrors(g).join(' ');
  assert.match(msg, /must have a key/);
  assert.match(msg, /Duplicate component key[^]*"crest"/);
});
