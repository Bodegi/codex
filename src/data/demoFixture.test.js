/**
 * Integrity tests for the neutral demo fixture.
 *
 * The fixture is the single codex shown in local-only mode and the shared content for
 * headless smoke tests, so it must be internally valid AND exercise every field kind —
 * otherwise the screenshots it drives can't cover the app. These tests fail if the
 * fixture drifts out of that contract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { demoCodexId, demoSchemas, demoEntriesByType } from './demoFixture.js';
import { validateSchema } from '../schema/schemaValidate.js';
import { fieldKinds } from '../schema/fieldKinds.js';

const ALL_KINDS = Object.keys(fieldKinds);

test('the demo codex has a non-empty id', () => {
  assert.equal(typeof demoCodexId, 'string');
  assert.ok(demoCodexId.trim().length > 0);
});

test('every demo schema passes the real validateSchema gate', () => {
  for (const schema of demoSchemas) {
    const { ok, errors } = validateSchema(schema);
    assert.ok(ok, `schema "${schema.type}" is invalid: ${errors.join('; ')}`);
  }
});

test('every demo schema carries type, label, and icon for the nav/registry', () => {
  for (const schema of demoSchemas) {
    assert.ok(schema.type && schema.label && schema.icon, `schema missing type/label/icon: ${JSON.stringify(schema)}`);
  }
});

test('the fixture collectively exercises every field kind', () => {
  const kindsUsed = new Set();
  for (const schema of demoSchemas) {
    for (const section of schema.sections) {
      for (const field of section.fields) kindsUsed.add(field.kind);
    }
  }
  for (const kind of ALL_KINDS) {
    assert.ok(kindsUsed.has(kind), `no demo field exercises kind "${kind}"`);
  }
});

test('every demo entry has a type matching a schema and a set id', () => {
  const schemaByType = new Map(demoSchemas.map((s) => [s.type, s]));
  for (const [type, entries] of Object.entries(demoEntriesByType)) {
    const schema = schemaByType.get(type);
    assert.ok(schema, `entries exist for unknown type "${type}"`);
    for (const entry of entries) {
      assert.equal(entry.type, type, `entry.type mismatch in "${type}"`);
      const idVal = entry[schema.idField];
      assert.ok(idVal && String(idVal).trim() !== '', `entry in "${type}" missing idField "${schema.idField}"`);
    }
  }
});

test('every reference field value points to an existing entry of its target type', () => {
  const idsByType = new Map(
    Object.entries(demoEntriesByType).map(([type, entries]) => [
      type,
      new Set(entries.map((e) => e[demoSchemas.find((s) => s.type === type).idField])),
    ])
  );
  const schemaByType = new Map(demoSchemas.map((s) => [s.type, s]));

  for (const [type, entries] of Object.entries(demoEntriesByType)) {
    const refFields = schemaByType
      .get(type)
      .sections.flatMap((sec) => sec.fields)
      .filter((f) => f.kind === 'reference');
    for (const entry of entries) {
      for (const field of refFields) {
        const targetId = entry[field.key];
        if (!targetId) continue; // an unset optional reference is fine
        const targetIds = idsByType.get(field.targetType);
        assert.ok(targetIds, `reference field "${field.key}" targets unknown type "${field.targetType}"`);
        assert.ok(targetIds.has(targetId), `reference "${field.key}"="${targetId}" has no matching ${field.targetType} entry`);
      }
    }
  }
});
