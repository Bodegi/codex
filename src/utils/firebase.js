/**
 * Firebase Firestore Database & Real-Time Sync Module for ATM10 Codex Studio.
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
  deleteDoc,
  collection,
  onSnapshot
} from 'firebase/firestore';

import {
  codexMetaPath,
  permissionDocPath,
  entryDocPath,
  schemasCollectionPath,
  schemaDocPath,
  atlasDocPath
} from './codexPaths.js';

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

  /**
   * Grant a user a role on a codex. Phase 1 uses this only to seed the owner's editor grant;
   * full permissions CRUD (and the rules that enforce it) arrive in Phase 2.
   */
  async savePermission(uid, codexId, data) {
    if (!this.db) return;
    await setDoc(
      doc(this.db, ...permissionDocPath(uid, codexId)),
      { ...data, uid, codexId },
      { merge: true }
    );
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

  /** Save an entry (Civilization, Mod, Region, Decision Log). */
  async saveDoc(type, id, data) {
    if (!this.db) throw new Error('Firebase DB is not initialized');
    await setDoc(
      doc(this.db, ...entryDocPath(this.codexId, type, id)),
      { ...data, type, id, updatedAt: now() },
      { merge: true }
    );
  }

  /** Subscribe to real-time updates for a specific entry. */
  subscribeToDoc(type, id, callback) {
    if (!this.db) return () => {};
    return onSnapshot(doc(this.db, ...entryDocPath(this.codexId, type, id)), (snapshot) => {
      if (snapshot.exists()) callback(snapshot.data());
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
