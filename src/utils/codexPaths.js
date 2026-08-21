/**
 * Codex — Firestore path builders for the codex-scoped data model.
 *
 * Pure, SDK-free segment builders so path construction is unit-testable without mocking
 * Firestore. Each returns an array of path segments spread into `doc(db, ...)` /
 * `collection(db, ...)`. Centralizing the layout here keeps the `codices/{id}/…` shape in
 * one place.
 *
 *   users/{uid}                              (Phase 2)
 *   invites/{token}                          (private-site invite gate; token == doc id == the secret)
 *   permissions/{uid}_{codexId}
 *   codices/{codexId}
 *   codices/{codexId}/entries/{type}_{id}
 *   codices/{codexId}/schemas/{type}
 *   codices/{codexId}/atlas/{docId}
 *   images/{contentHash}                     (shared image library; membership via codices[])
 *   icons/{key}                              (app-global icon overlay; SVG-as-text, admin-curated)
 *   emblems/{key}                            (app-global emblem set; full-color glyphs, admin-curated)
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

// Invite gate: the doc id IS the secret token. Admin-only per firestore.rules.
export const invitesCollectionPath = () => ['invites'];
export const inviteDocPath = (token) => ['invites', token];

export const codicesCollectionPath = () => ['codices'];
export const codexMetaPath = (codexId) => ['codices', codexId];

export const imagesCollectionPath = () => ['images'];
export const imageDocPath = (id) => ['images', id];

// App-global icon overlay: SVG-as-text records keyed by icon key (the doc id).
export const iconsCollectionPath = () => ['icons'];
export const iconDocPath = (key) => ['icons', key];

// App-global emblem set: full-color glyph records keyed by emblem key (the doc id). Sibling of
// `icons` — no bundled baseline, different consumption surface (content + map markers).
export const emblemsCollectionPath = () => ['emblems'];
export const emblemDocPath = (key) => ['emblems', key];

// ── Per-codex subcollections ────────────────────────────────────────────────
export const entriesCollectionPath = (codexId) => ['codices', codexId, 'entries'];
export const entryDocPath = (codexId, type, id) => ['codices', codexId, 'entries', entryId(type, id)];

// Per-entry recovery ring: prior versions live under the entry, keyed by version (the doc id).
export const entryHistoryCollectionPath = (codexId, type, id) => [...entryDocPath(codexId, type, id), 'history'];
export const entryHistoryDocPath = (codexId, type, id, version) => [...entryHistoryCollectionPath(codexId, type, id), String(version)];

export const schemasCollectionPath = (codexId) => ['codices', codexId, 'schemas'];
export const schemaDocPath = (codexId, type) => ['codices', codexId, 'schemas', type];

// Per-type structure-history ring: prior schema versions live under the type, keyed by version (the
// doc id) — the schema analogue of the entry ring above (issue #54).
export const schemaHistoryCollectionPath = (codexId, type) => [...schemaDocPath(codexId, type), 'history'];
export const schemaHistoryDocPath = (codexId, type, version) => [...schemaHistoryCollectionPath(codexId, type), String(version)];
