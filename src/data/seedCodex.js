/**
 * ATM10 Codex — idempotent seed for the `atm10` codex.
 *
 * Writes the bundled seed content into the codex-scoped Firestore layout (`codices/atm10/…`),
 * reusing the app's own Firebase connection + super-admin auth — no service account, no separate
 * script env (we have no backend by design). Firestore was empty at Phase 1, so this seeds purely
 * from the bundled `seedData` / `seedSchemas`; nothing is copy-migrated.
 *
 * `buildAtm10Seed` is pure (JSON-able payload → unit-testable); `seedAtm10Codex` is the writer,
 * guarded on "does codices/atm10 exist?" and using deterministic ids + merge writes, so re-running
 * cannot duplicate or clobber. Console-invokable in Phase 1; becomes an admin-tab button in Phase 2.
 */

import { seedCivilizations, seedMods, seedRegions, seedDecisionLogs } from './seedData.js';
import { seedSchemas } from '../schema/seedSchemas.js';
import { entryId, permissionId } from '../utils/codexPaths.js';

export const ATM10_CODEX_ID = 'atm10';

const SEED_ENTRIES_BY_TYPE = {
  civilization: seedCivilizations,
  mod: seedMods,
  region: seedRegions,
  decision: seedDecisionLogs,
};

/**
 * Build the full seed payload for the ATM10 codex. Pure and JSON-able — every timestamp/owner
 * is injected, so the shape is deterministic and testable.
 *
 * @param {{ ownerUid: string, timestamp?: string }} opts
 */
export function buildAtm10Seed({ ownerUid, timestamp = '' } = {}) {
  const codexId = ATM10_CODEX_ID;

  const entries = Object.entries(SEED_ENTRIES_BY_TYPE).flatMap(([type, list]) =>
    list.map((entry) => ({
      type,
      id: entry.id,
      docId: entryId(type, entry.id),
      data: { ...entry, type, id: entry.id, updatedAt: timestamp },
    }))
  );

  const schemas = seedSchemas.map((schema) => ({
    type: schema.type,
    data: { ...schema, type: schema.type, updatedAt: timestamp },
  }));

  return {
    codexId,
    meta: {
      codexId,
      name: 'ATM10 Codex',
      description: 'Design codex for the handcrafted ATM10-inspired Minecraft world.',
      createdBy: ownerUid,
      createdAt: timestamp,
    },
    schemas,
    entries,
    atlas: {
      docId: 'world_vector_data',
      data: { waypoints: [], roads: [], territories: [], mapImageId: '', updatedAt: timestamp },
    },
    permission: {
      id: permissionId(ownerUid, codexId),
      data: {
        uid: ownerUid,
        codexId,
        role: 'editor',
        grantedBy: ownerUid,
        grantedAt: timestamp,
      },
    },
  };
}

/**
 * Write the ATM10 seed into Firestore, once. Idempotent: skips if `codices/atm10` already exists,
 * and even a forced re-run only merge-writes deterministic-id docs. Must be called while signed in
 * as the super-admin (test-mode rules in Phase 1 permit it regardless).
 *
 * @param {import('../utils/firebase.js').FirebaseManager} fbManager
 * @param {string} ownerUid  the signed-in super-admin's Firebase Auth uid
 * @returns {Promise<{ seeded: boolean, counts?: object }>}
 */
export async function seedAtm10Codex(fbManager, ownerUid) {
  if (!fbManager || !fbManager.isConfigured()) throw new Error('Firebase is not configured.');
  if (!ownerUid) throw new Error('An owner uid is required — sign in as the super-admin first.');

  const existing = await fbManager.getCodexMeta(ATM10_CODEX_ID);
  if (existing) {
    return { seeded: false, counts: { reason: 'codices/atm10 already exists' } };
  }

  const payload = buildAtm10Seed({ ownerUid, timestamp: new Date().toISOString() });
  const scope = fbManager.codex(payload.codexId);

  await fbManager.saveCodexMeta(payload.codexId, payload.meta);
  await Promise.all(payload.schemas.map((s) => scope.saveSchema(s.type, s.data)));
  await Promise.all(payload.entries.map((e) => scope.saveDoc(e.type, e.id, e.data)));
  await scope.saveMapData(payload.atlas.data);
  await fbManager.savePermission(ownerUid, payload.codexId, payload.permission.data);

  return {
    seeded: true,
    counts: {
      schemas: payload.schemas.length,
      entries: payload.entries.length,
      atlas: 1,
      permissions: 1,
    },
  };
}
