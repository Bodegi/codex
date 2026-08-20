import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSchema } from './schemaValidate.js';

/** A minimal well-formed schema; each test clones and breaks one thing. */
function validSchema() {
  return {
    type: 'demo',
    label: 'Demo',
    idField: 'id',
    titleField: 'name',
    fields: [
      { key: 'id', label: 'ID', kind: 'text' },
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'owner', label: 'Owner', kind: 'reference', targetType: 'civilization' },
      { key: 'notes', label: 'Notes', kind: 'prose' },
    ],
  };
}

test('a well-formed schema passes with no errors', () => {
  const result = validateSchema(validSchema());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('an optional top-level icon key is tolerated', () => {
  const schema = validSchema();
  schema.icon = 'civilization';
  assert.equal(validateSchema(schema).ok, true);
});

test('media kinds are accepted as known kinds', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'heroImage', label: 'Hero', kind: 'hero' });
  schema.fields.push({ key: 'gallery', label: 'Gallery', kind: 'gallery' });
  assert.equal(validateSchema(schema).ok, true);
});

test('a heading component is accepted as a known kind', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'sec_more', label: 'More', kind: 'heading' });
  assert.equal(validateSchema(schema).ok, true);
});

test('a well-formed group field is accepted', () => {
  const schema = validSchema();
  schema.fields.push({
    key: 'crests',
    label: 'Crests',
    kind: 'group',
    fields: [
      { key: 'crest', kind: 'banner', label: 'Crest' },
      { key: 'caption', kind: 'text', label: 'Caption' },
    ],
  });
  assert.equal(validateSchema(schema).ok, true);
});

test('a group with a malformed sub-schema surfaces its errors through validateSchema', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'empty', kind: 'group', fields: [] });
  schema.fields.push({ key: 'nested', kind: 'group', fields: [{ key: 'inner', kind: 'group', fields: [] }] });
  const { ok, errors } = validateSchema(schema);
  assert.equal(ok, false);
  assert.match(errors.join(' '), /at least one component/);
  assert.match(errors.join(' '), /may not contain another group/);
});

test('titleField may not point at a group, whose value is a list', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'crests', kind: 'group', fields: [{ key: 'crest', kind: 'banner' }] });
  schema.titleField = 'crests';
  const { ok, errors } = validateSchema(schema);
  assert.equal(ok, false);
  assert.match(errors.join(' '), /titleField "crests" is a group/);
});

test('rejects a non-object schema', () => {
  assert.equal(validateSchema(null).ok, false);
  assert.equal(validateSchema('nope').ok, false);
});

test('rejects a schema without a fields array', () => {
  const result = validateSchema({ idField: 'id', titleField: 'name' });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /fields array/);
});

test('rejects duplicate field keys', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'id', label: 'Dupe', kind: 'text' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Duplicate field key: "id"/.test(e)));
});

test('rejects an unknown field kind', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'weird', label: 'Weird', kind: 'sparkle' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /unknown kind: "sparkle"/.test(e)));
});

test('rejects a reference field with no target type', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'link', label: 'Link', kind: 'reference' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /"link" must have a target type/.test(e)));
});

test('the new first-class kinds (number/date/select/boolean) are accepted', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'pop', label: 'Population', kind: 'number' });
  schema.fields.push({ key: 'founded', label: 'Founded', kind: 'date' });
  schema.fields.push({ key: 'tier', label: 'Tier', kind: 'select', options: ['A', 'B'] });
  schema.fields.push({ key: 'active', label: 'Active', kind: 'boolean' });
  assert.equal(validateSchema(schema).ok, true);
});

test('rejects a select field with no options — symmetric with reference→target', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'tier', label: 'Tier', kind: 'select', options: [] });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /"tier" must define at least one option/.test(e)));
});

test('a select field with at least one option passes', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'tier', label: 'Tier', kind: 'select', options: ['Gold'] });
  assert.equal(validateSchema(schema).ok, true);
});

test('rejects a heading with a blank label — its label is the rendered text', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'sec_blank', label: '   ', kind: 'heading' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Heading "sec_blank" must have a label/.test(e)));
});

test('rejects a titleField that points at a heading — a heading holds no entry data', () => {
  const schema = validSchema();
  schema.fields.push({ key: 'sec_more', label: 'More', kind: 'heading' });
  schema.titleField = 'sec_more';
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /titleField "sec_more" is a heading/.test(e)));
});

test('an absent idField is fine — the entry id is the opaque doc key, not a field', () => {
  const schema = validSchema();
  delete schema.idField;
  schema.fields = schema.fields.filter((f) => f.key !== 'id');
  assert.equal(validateSchema(schema).ok, true);
});

test('rejects an idField that, when present, names no existing field', () => {
  const schema = validSchema();
  schema.idField = 'ghost';
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /idField "ghost" does not match any field key/.test(e)));
});

test('still requires titleField', () => {
  const schema = validSchema();
  delete schema.titleField;
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /must define titleField/.test(e)));
});

test('rejects a titleField that names no existing field', () => {
  const schema = validSchema();
  schema.titleField = 'ghost';
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /titleField "ghost" does not match any field key/.test(e)));
});

test('flags a field missing its key', () => {
  const schema = validSchema();
  schema.fields.push({ label: 'No key', kind: 'text' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Every field must have a key/.test(e)));
});
