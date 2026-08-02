/**
 * Codex — Firestore path builders for the codex-scoped data model.
 *
 * Pure, SDK-free segment builders so path construction is unit-testable without mocking
 * Firestore. Each returns an array of path segments spread into `doc(db, ...)` /
 * `collection(db, ...)`. Centralizing the layout here keeps the `codices/{id}/…` shape in
 * one place (see the multi-codex data-model spec).
 *
 *   users/{uid}                              (Phase 2)
 *   permissions/{uid}_{codexId}
 *   codices/{codexId}
 *   codices/{codexId}/entries/{type}_{id}
 *   codices/{codexId}/schemas/{type}
 *   codices/{codexId}/atlas/{docId}
 */

/** The deterministic entry doc id — keeps the `${type}_${id}` convention. */
export function entryId(type, id) {
  return `${type}_${id}`;
}

/** The deterministic permission doc id — one grant per (user, codex). */
export function permissionId(uid, codexId) {
  return `${uid}_${codexId}`;
}

// ── Top-level collections ───────────────────────────────────────────────────
export const usersCollectionPath = () => ['users'];
export const userDocPath = (uid) => ['users', uid];

export const permissionsCollectionPath = () => ['permissions'];
export const permissionDocPath = (uid, codexId) => ['permissions', permissionId(uid, codexId)];

export const codexMetaPath = (codexId) => ['codices', codexId];

// ── Per-codex subcollections ────────────────────────────────────────────────
export const entriesCollectionPath = (codexId) => ['codices', codexId, 'entries'];
export const entryDocPath = (codexId, type, id) => ['codices', codexId, 'entries', entryId(type, id)];

export const schemasCollectionPath = (codexId) => ['codices', codexId, 'schemas'];
export const schemaDocPath = (codexId, type) => ['codices', codexId, 'schemas', type];

export const atlasDocPath = (codexId, docId) => ['codices', codexId, 'atlas', docId];
