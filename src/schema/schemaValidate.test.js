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
    sections: [
      {
        title: 'Core',
        fields: [
          { key: 'id', label: 'ID', kind: 'text' },
          { key: 'name', label: 'Name', kind: 'text' },
          { key: 'owner', label: 'Owner', kind: 'reference', targetType: 'civilization' },
          { key: 'notes', label: 'Notes', kind: 'prose' },
        ],
      },
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
  schema.sections[0].fields.push({ key: 'heroImage', label: 'Hero', kind: 'hero' });
  schema.sections[0].fields.push({ key: 'gallery', label: 'Gallery', kind: 'gallery' });
  assert.equal(validateSchema(schema).ok, true);
});

test('rejects a non-object schema', () => {
  assert.equal(validateSchema(null).ok, false);
  assert.equal(validateSchema('nope').ok, false);
});

test('rejects a schema without a sections array', () => {
  const result = validateSchema({ idField: 'id', titleField: 'name' });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /sections array/);
});

test('rejects duplicate field keys', () => {
  const schema = validSchema();
  schema.sections[0].fields.push({ key: 'id', label: 'Dupe', kind: 'text' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Duplicate field key: "id"/.test(e)));
});

test('rejects an unknown field kind', () => {
  const schema = validSchema();
  schema.sections[0].fields.push({ key: 'weird', label: 'Weird', kind: 'sparkle' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /unknown kind: "sparkle"/.test(e)));
});

test('rejects a reference field with no target type', () => {
  const schema = validSchema();
  schema.sections[0].fields.push({ key: 'link', label: 'Link', kind: 'reference' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /"link" must have a target type/.test(e)));
});

test('rejects an empty section title', () => {
  const schema = validSchema();
  schema.sections[0].title = '   ';
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /non-empty title/.test(e)));
});

test('an absent idField is fine — the entry id is the opaque doc key, not a field', () => {
  const schema = validSchema();
  delete schema.idField;
  schema.sections[0].fields = schema.sections[0].fields.filter((f) => f.key !== 'id');
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
  schema.sections[0].fields.push({ label: 'No key', kind: 'text' });
  const result = validateSchema(schema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Every field must have a key/.test(e)));
});
