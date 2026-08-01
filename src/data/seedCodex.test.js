import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAtm10Seed, ATM10_CODEX_ID } from './seedCodex.js';
import { seedCivilizations, seedMods, seedRegions, seedDecisionLogs } from './seedData.js';
import { seedSchemas } from '../schema/seedSchemas.js';

const OWNER = 'owner-uid-123';
const TS = '2026-08-01T00:00:00.000Z';
const seed = () => buildAtm10Seed({ ownerUid: OWNER, timestamp: TS });

test('seed targets the atm10 codex with owner-stamped metadata', () => {
  const p = seed();
  assert.equal(p.codexId, ATM10_CODEX_ID);
  assert.equal(p.meta.codexId, ATM10_CODEX_ID);
  assert.equal(p.meta.createdBy, OWNER);
  assert.equal(p.meta.createdAt, TS);
  assert.ok(p.meta.name, 'codex needs a display name');
});

test('every bundled entry is seeded under a deterministic ${type}_${id} doc id', () => {
  const p = seed();
  const expected =
    seedCivilizations.length + seedMods.length + seedRegions.length + seedDecisionLogs.length;
  assert.equal(p.entries.length, expected);

  const civ = p.entries.find((e) => e.type === 'civilization' && e.id === seedCivilizations[0].id);
  assert.ok(civ, 'first civilization should be present');
  assert.equal(civ.docId, `civilization_${seedCivilizations[0].id}`);
  assert.equal(civ.data.type, 'civilization');
  assert.equal(civ.data.updatedAt, TS);
});

test('all four bundled schemas are seeded, keyed by type', () => {
  const p = seed();
  assert.equal(p.schemas.length, seedSchemas.length);
  assert.deepEqual(
    p.schemas.map((s) => s.type).sort(),
    seedSchemas.map((s) => s.type).sort()
  );
});

test('atlas seeds an empty default vector doc', () => {
  const { data } = seed().atlas;
  assert.deepEqual(data.waypoints, []);
  assert.deepEqual(data.roads, []);
  assert.deepEqual(data.territories, []);
});

test('owner is granted an editor permission with a deterministic id', () => {
  const p = seed();
  assert.equal(p.permission.id, `${OWNER}_${ATM10_CODEX_ID}`);
  assert.equal(p.permission.data.role, 'editor');
  assert.equal(p.permission.data.uid, OWNER);
  assert.equal(p.permission.data.grantedBy, OWNER);
});

test('the payload is deterministic — same inputs yield an identical shape', () => {
  assert.deepEqual(seed(), seed());
});
