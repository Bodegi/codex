import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seedCivilizations, seedMods, seedRegions, seedDecisionLogs } from './seedData.js';
import { getSchema } from '../schema/schemaStore.js';

const SEED = {
  civilization: seedCivilizations,
  mod: seedMods,
  region: seedRegions,
  decision: seedDecisionLogs,
};

const fieldsOf = (schema) => schema.sections.flatMap((s) => s.fields);

test('every seed entry has an id', () => {
  for (const entries of Object.values(SEED)) {
    for (const entry of entries) assert.ok(entry.id, 'entry is missing an id');
  }
});

test('every reference field in seed resolves to an existing target entry id', () => {
  for (const [type, entries] of Object.entries(SEED)) {
    const refFields = fieldsOf(getSchema(type)).filter((f) => f.kind === 'reference');
    for (const entry of entries) {
      for (const field of refFields) {
        const value = entry[field.key];
        if (value == null || value === '') continue;
        const targetIds = SEED[field.targetType].map((e) => e.id);
        assert.ok(
          targetIds.includes(value),
          `${type}.${entry.id}.${field.key} -> "${value}" is not a valid ${field.targetType} id`
        );
      }
    }
  }
});
