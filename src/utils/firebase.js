/**
 * Firebase Firestore Database & Real-Time Sync Module for ATM10 Codex Studio
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';

export class FirebaseManager {
  constructor(config) {
    this.config = config;
    this.app = null;
    this.db = null;
    this.listeners = new Map();

    if (config && config.apiKey) {
      this.init(config);
    }
  }

  init(config) {
    this.config = config;
    this.app = initializeApp(config);
    this.db = getFirestore(this.app);
    localStorage.setItem('atm10_firebase_config', JSON.stringify(config));
  }

  isConfigured() {
    return this.db !== null;
  }

  /**
   * Save a codex document (Civilization, Mod, Region, Decision Log) to Firestore
   */
  async saveDoc(type, id, data) {
    if (!this.db) throw new Error('Firebase DB is not initialized');
    const docRef = doc(this.db, 'codex_entries', `${type}_${id}`);
    await setDoc(docRef, {
      ...data,
      type,
      id,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }

  /**
   * Subscribe to real-time updates for a specific document
   */
  subscribeToDoc(type, id, callback) {
    if (!this.db) return () => {};
    const docRef = doc(this.db, 'codex_entries', `${type}_${id}`);
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      }
    });
  }

  /**
   * Subscribe to real-time updates for the type schemas. The callback receives the
   * full array of schema docs on every change; an unconfigured manager is a no-op.
   * Schema *writes* are the job of the (future) in-app schema editor.
   */
  subscribeSchemas(callback) {
    if (!this.db) return () => {};
    const col = collection(this.db, 'codex_schemas');
    return onSnapshot(col, (snapshot) => {
      callback(snapshot.docs.map((d) => d.data()));
    });
  }

  /**
   * Subscribe to real-time updates for the Interactive World Map vector data
   */
  subscribeToMapData(callback) {
    if (!this.db) return () => {};
    const mapRef = doc(this.db, 'atlas_map', 'world_vector_data');
    return onSnapshot(mapRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      }
    });
  }

  /**
   * Save Interactive World Map vector data (Waypoints, Roads, Territories)
   */
  async saveMapData(mapData) {
    if (!this.db) return;
    const mapRef = doc(this.db, 'atlas_map', 'world_vector_data');
    await setDoc(mapRef, {
      ...mapData,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }
}
