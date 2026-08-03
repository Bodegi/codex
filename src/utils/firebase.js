/**
 * Firebase Firestore Database & Real-Time Sync Module for Codex Studio.
 *
 * `FirebaseManager` owns the *connection* (the Firebase app + Firestore handle) and the
 * app-level `codices` / `permissions` collections. Per-codex content (entries, schemas,
 * atlas) is reached through `fbManager.codex(codexId)`, which returns a `CodexScope` bound
 * to `codices/${codexId}/…` — explicit and hard to mis-scope. See the multi-codex spec.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  runTransaction,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';

import {
  codicesCollectionPath,
  codexMetaPath,
  usersCollectionPath,
  userDocPath,
  permissionsCollectionPath,
  permissionDocPath,
  imagesCollectionPath,
  imageDocPath,
  entriesCollectionPath,
  entryDocPath,
  schemasCollectionPath,
  schemaDocPath,
  atlasDocPath
} from './codexPaths.js';
import { buildUserDoc } from './userDoc.js';
import { resolveSave } from '../schema/saveResolve.js';

const now = () => new Date().toISOString();

export class FirebaseManager {
  constructor(config) {
    this.config = config;
    this.app = null;
    this.db = null;

    if (config && config.apiKey) {
      this.init(config);
    }
  }

  init(config) {
    this.config = config;
    this.app = initializeApp(config);
    this.db = getFirestore(this.app);
  }

  isConfigured() {
    return this.db !== null;
  }

  /**
   * A codex-scoped view over entries / schemas / atlas. Cheap and stateless — a fresh
   * `CodexScope` per call is fine (it holds only the db handle + codexId).
   */
  codex(codexId) {
    if (!this.db) return null;
    return new CodexScope(this.db, codexId);
  }

  // ── App-level collections (codex registry + access grants) ─────────────────

  /** Read a codex's metadata doc, or null if it doesn't exist. Used as the seed's idempotency guard. */
  async getCodexMeta(codexId) {
    if (!this.db) return null;
    const snap = await getDoc(doc(this.db, ...codexMetaPath(codexId)));
    return snap.exists() ? snap.data() : null;
  }

  /** Create/update a codex's metadata doc (name, description, createdBy). */
  async saveCodexMeta(codexId, data) {
    if (!this.db) return;
    await setDoc(doc(this.db, ...codexMetaPath(codexId)), { ...data, codexId }, { merge: true });
  }

  /** Grant a user a role on a codex (admin-only per the rules). Deterministic id → idempotent. */
  async savePermission(uid, codexId, data) {
    if (!this.db) return;
    await setDoc(
      doc(this.db, ...permissionDocPath(uid, codexId)),
      { ...data, uid, codexId },
      { merge: true }
    );
  }

  /** Revoke a user's role on a codex. No-op when unconfigured. */
  async deletePermission(uid, codexId) {
    if (!this.db) return;
    await deleteDoc(doc(this.db, ...permissionDocPath(uid, codexId)));
  }

  /**
   * Record the signed-in person in the global `users` roster. createdAt is written once (on first
   * sign-in); lastSeenAt updates every time. This is what surfaces a user to the admin to grant access.
   */
  async upsertUser(profile) {
    if (!this.db || !profile || !profile.uid) return;
    const ref = doc(this.db, ...userDocPath(profile.uid));
    const snap = await getDoc(ref);
    await setDoc(ref, buildUserDoc(profile, now(), { isNew: !snap.exists() }), { merge: true });
  }

  /** Admin codex registry: every codex meta doc, on every change. Requires the `list` rule. No-op unconfigured. */
  subscribeCodices(callback) {
    if (!this.db) return () => {};
    return onSnapshot(collection(this.db, ...codicesCollectionPath()), (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()));
    });
  }

  /**
   * A non-admin's own permission grants across all codices (how they discover which codices they can
   * open). Queries `permissions where uid == uid`; requires the per-user `list` rule. No-op unconfigured.
   */
  subscribeOwnPermissions(uid, callback) {
    if (!this.db || !uid) return () => {};
    const q = query(collection(this.db, ...permissionsCollectionPath()), where('uid', '==', uid));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()));
    });
  }

  /** Watch one user's permission doc for the given codex; callback gets the data or null (absent). */
  subscribePermission(uid, codexId, callback) {
    if (!this.db) return () => {};
    return onSnapshot(doc(this.db, ...permissionDocPath(uid, codexId)), (snapshot) => {
      callback(snapshot.exists() ? snapshot.data() : null);
    });
  }

  /** Admin roster: every user doc, on every change. No-op when unconfigured. */
  subscribeUsers(callback) {
    if (!this.db) return () => {};
    return onSnapshot(collection(this.db, ...usersCollectionPath()), (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()));
    });
  }

  /** Admin roster: every permission doc, on every change. No-op when unconfigured. */
  subscribePermissions(callback) {
    if (!this.db) return () => {};
    return onSnapshot(collection(this.db, ...permissionsCollectionPath()), (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()));
    });
  }

  // ── Image library (shared `images` collection; bytes live in Supabase) ──────
  // Metadata is the source of truth for what exists and where it belongs; a record's id is the
  // content hash, so it is also the Supabase object key and the doc id. Byte upload is the
  // separate `imageStore` adapter — the upload coordinator drives both (see imageUpload.js).

  /** Read one image record, or null if absent. The coordinator's dedup/resurrect branch pivots on this. */
  async getImage(id) {
    if (!this.db) return null;
    const snap = await getDoc(doc(this.db, ...imageDocPath(id)));
    return snap.exists() ? snap.data() : null;
  }

  /** Create a new image record (the coordinator's "no record" branch). Stamps createdAt + updatedAt. */
  async createImage(id, data) {
    if (!this.db) return;
    const ts = now();
    await setDoc(doc(this.db, ...imageDocPath(id)), { ...data, id, createdAt: ts, updatedAt: ts });
  }

  /**
   * Live images for a codex: `images where codices array-contains {codexId}`, filtered to
   * `status == 'active'` in the callback. The active filter is client-side deliberately —
   * array-contains + an equality clause would force a composite index, and active-ness is a
   * cheap in-memory check (the render index drops archived downstream anyway). No-op unconfigured.
   */
  subscribeImagesForCodex(codexId, callback) {
    if (!this.db || !codexId) return () => {};
    const q = query(collection(this.db, ...imagesCollectionPath()), where('codices', 'array-contains', codexId));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()).filter((r) => r.status === 'active'));
    });
  }

  /** Admin all-images view: every image record, all statuses, on every change. No-op when unconfigured. */
  subscribeAllImages(callback) {
    if (!this.db) return () => {};
    return onSnapshot(collection(this.db, ...imagesCollectionPath()), (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()));
    });
  }

  /** Add a codex to an image's membership (editor upload/dedup path). arrayUnion → idempotent. */
  async addImageToCodex(id, codexId) {
    if (!this.db) return;
    await updateDoc(doc(this.db, ...imageDocPath(id)), { codices: arrayUnion(codexId), updatedAt: now() });
  }

  /** Remove a codex from membership (editor "delete = remove from my codex"). Other codices untouched. */
  async removeImageFromCodex(id, codexId) {
    if (!this.db) return;
    await updateDoc(doc(this.db, ...imageDocPath(id)), { codices: arrayRemove(codexId), updatedAt: now() });
  }

  /** Set the global soft-delete flag ('active' | 'archived') — admin archive/restore + resurrect. */
  async setImageStatus(id, status) {
    if (!this.db) return;
    await updateDoc(doc(this.db, ...imageDocPath(id)), { status, updatedAt: now() });
  }

  /** Rename an image (uploader or admin per the rules). */
  async updateImageLabel(id, label) {
    if (!this.db) return;
    await updateDoc(doc(this.db, ...imageDocPath(id)), { label, updatedAt: now() });
  }
}

/**
 * Per-codex content operations, all pathed under `codices/${codexId}/…`. Mirrors the method
 * surface the app used to call on `FirebaseManager` directly, so call sites just swap
 * `fbManager` → `fbManager.codex(id)`. An unconfigured scope is never constructed (see `.codex`).
 */
export class CodexScope {
  constructor(db, codexId) {
    this.db = db;
    this.codexId = codexId;
  }

  isConfigured() {
    return this.db !== null;
  }

  /**
   * Save an entry from the form, guarded by its version. Runs a transaction: read the live
   * version, and via `resolveSave` either write the full doc at `version + 1` (a full replace,
   * so dropped fields actually disappear) or reject with a `version-conflict` error carrying the
   * current doc. `force` is the "overwrite mine" path — write regardless of a stale base version.
   * Returns the new version. Full replace (not merge) is why deletions persist.
   */
  async saveEntry(type, id, data, baseVersion, { force = false } = {}) {
    if (!this.db) throw new Error('Firebase DB is not initialized');
    const ref = doc(this.db, ...entryDocPath(this.codexId, type, id));
    return runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      const currentVersion = snap.exists() ? snap.data().version : undefined;
      const { action, nextVersion } = resolveSave({ currentVersion, baseVersion, force });
      if (action === 'conflict') {
        const err = new Error('version-conflict');
        err.code = 'version-conflict';
        err.current = snap.exists() ? snap.data() : null;
        throw err;
      }
      tx.set(ref, { ...data, type, id, version: nextVersion, updatedAt: now() });
      return nextVersion;
    });
  }

  /**
   * Flip an entry's status (archive/restore) without clobbering a concurrent field edit: read the
   * live doc, set `status` on that fresh copy, and bump `version` so it stays monotonic (which is
   * what keeps a concurrent editor's form-Save conflict check honest). Always applies — this is a
   * deliberate action, not a guarded save. No-op if the doc is gone.
   */
  async saveEntryStatus(type, id, status) {
    if (!this.db) throw new Error('Firebase DB is not initialized');
    const ref = doc(this.db, ...entryDocPath(this.codexId, type, id));
    return runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return undefined;
      const current = snap.data();
      const nextVersion = (current.version ?? 0) + 1;
      tx.set(ref, { ...current, status, version: nextVersion, updatedAt: now() });
      return nextVersion;
    });
  }

  /**
   * Subscribe to this codex's entire entries collection (the live entry index). The callback gets
   * the full array of entry docs on every change; an unconfigured scope is a no-op.
   */
  subscribeEntries(callback) {
    if (!this.db) return () => {};
    const col = collection(this.db, ...entriesCollectionPath(this.codexId));
    return onSnapshot(col, (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()));
    });
  }

  /**
   * Subscribe to real-time updates for this codex's type schemas. The callback receives the
   * full array of schema docs on every change; an unconfigured scope is a no-op.
   */
  subscribeSchemas(callback) {
    if (!this.db) return () => {};
    const col = collection(this.db, ...schemasCollectionPath(this.codexId));
    return onSnapshot(col, (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()));
    });
  }

  /** One-shot read of this codex's schema docs (used to copy a template into a new codex). */
  async getSchemas() {
    if (!this.db) return [];
    const snap = await getDocs(collection(this.db, ...schemasCollectionPath(this.codexId)));
    return snap.docs.map((d) => d.data());
  }

  /**
   * Save a type schema (the write side of subscribeSchemas). Doc id is the type, so a save
   * replaces that type's overlay for every client. No-op when unconfigured.
   */
  async saveSchema(type, schema) {
    if (!this.db) return;
    await setDoc(doc(this.db, ...schemaDocPath(this.codexId, type)), {
      ...schema,
      type,
      updatedAt: now()
    });
  }

  /** Delete a type's schema overlay, so it falls back to the bundled seed. No-op when unconfigured. */
  async deleteSchema(type) {
    if (!this.db) return;
    await deleteDoc(doc(this.db, ...schemaDocPath(this.codexId, type)));
  }

  /** Subscribe to real-time updates for the Interactive World Map vector data. */
  subscribeToMapData(callback) {
    if (!this.db) return () => {};
    const mapRef = doc(this.db, ...atlasDocPath(this.codexId, 'world_vector_data'));
    return onSnapshot(mapRef, (snapshot) => {
      if (snapshot.exists()) callback(snapshot.data());
    });
  }

  /** Save Interactive World Map vector data (Waypoints, Roads, Territories). */
  async saveMapData(mapData) {
    if (!this.db) return;
    await setDoc(
      doc(this.db, ...atlasDocPath(this.codexId, 'world_vector_data')),
      { ...mapData, updatedAt: now() },
      { merge: true }
    );
  }
}
