import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSchemaChange, changePhrase } from './schemaDiff.js';

// A saved schema: two top-level fields, one group with two sub-fields.
function base() {
  return {
    type: 'person',
    label: 'Person',
    fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'sigil', label: 'Sigil', kind: 'banner' },
      {
        key: 'heraldry',
        label: 'Heraldry',
        kind: 'group',
        fields: [
          { key: 'crest', label: 'Crest', kind: 'banner' },
          { key: 'caption', label: 'Caption', kind: 'text' },
        ],
      },
    ],
  };
}

test('no structural change → empty (renames, reorders, config edits are not orphaning)', () => {
  const next = base();
  next.fields[0].label = 'Full Name'; // rename
  next.fields[1].placeholder = 'e.g. War banner'; // config edit
  [next.fields[0], next.fields[1]] = [next.fields[1], next.fields[0]]; // reorder
  assert.deepEqual(summarizeSchemaChange(base(), next), []);
});

test('adding a new (provisional) field orphans nothing', () => {
  const next = base();
  next.fields.push({ key: 'newField', label: 'New Field', kind: 'text', provisional: true });
  assert.deepEqual(summarizeSchemaChange(base(), next), []);
});

test('moving a top-level field into a group', () => {
  const next = base();
  const [sigil] = next.fields.splice(1, 1); // remove top-level sigil
  next.fields.find((f) => f.key === 'heraldry').fields.push(sigil); // into the group
  const changes = summarizeSchemaChange(base(), next);
  assert.deepEqual(changes, [{ kind: 'moved-into-group', key: 'sigil', label: 'Sigil', toGroup: 'Heraldry' }]);
  assert.equal(changePhrase(changes[0]), 'moved “Sigil” into group “Heraldry”');
});

test('moving a sub-field out of a group to the top level', () => {
  const next = base();
  const g = next.fields.find((f) => f.key === 'heraldry');
  const [caption] = g.fields.splice(1, 1);
  next.fields.push(caption);
  const changes = summarizeSchemaChange(base(), next);
  assert.deepEqual(changes, [{ kind: 'moved-out-of-group', key: 'caption', label: 'Caption', fromGroup: 'Heraldry' }]);
});

test('moving a sub-field from one group to another', () => {
  const prev = base();
  prev.fields.push({ key: 'extra', label: 'Extra', kind: 'group', fields: [] });
  const next = structuredClone(prev);
  const from = next.fields.find((f) => f.key === 'heraldry');
  const [crest] = from.fields.splice(0, 1);
  next.fields.find((f) => f.key === 'extra').fields.push(crest);
  assert.deepEqual(summarizeSchemaChange(prev, next), [
    { kind: 'moved-between-groups', key: 'crest', label: 'Crest', fromGroup: 'Heraldry', toGroup: 'Extra' },
  ]);
});

test('removing a top-level field and a sub-field', () => {
  const next = base();
  next.fields.splice(1, 1); // drop top-level sigil
  next.fields.find((f) => f.key === 'heraldry').fields.splice(1, 1); // drop the group's caption
  const changes = summarizeSchemaChange(base(), next);
  assert.deepEqual(changes.find((c) => c.key === 'sigil'), { kind: 'removed', key: 'sigil', label: 'Sigil' });
  assert.deepEqual(changes.find((c) => c.key === 'caption'), { kind: 'removed', key: 'caption', label: 'Caption', fromGroup: 'Heraldry' });
});

test('removing a whole group reports the group once, not each sub-field', () => {
  const next = base();
  next.fields = next.fields.filter((f) => f.key !== 'heraldry');
  const changes = summarizeSchemaChange(base(), next);
  assert.deepEqual(changes, [{ kind: 'group-removed', key: 'heraldry', label: 'Heraldry' }]);
  assert.equal(changePhrase(changes[0]), 'removed group “Heraldry”');
});
