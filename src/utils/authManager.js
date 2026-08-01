/**
 * Google sign-in via Firebase Authentication for ATM10 Codex Studio.
 *
 * Because Google is a native Firebase Auth provider, a signed-in user carries a real `request.auth`
 * into Firestore security rules — no custom-token bridge, serverless function, or Blaze plan needed.
 * Auth requires an initialized Firebase app, so this manager only exists when Firebase is configured;
 * local-only mode runs unauthenticated. This manager owns *identity* only — authorization (admin /
 * editor / viewer / none) is resolved separately by capabilities.js.
 */

import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { toAuthProfile } from './authProfile.js';

export class AuthManager {
  constructor(app) {
    this.auth = getAuth(app);
    this.provider = new GoogleAuthProvider();
    this.currentUser = null;
  }

  /**
   * Subscribe to auth-state changes. Fires cb(profile|null) once with the restored session (Firebase
   * persists it across reloads) and again on every sign-in / sign-out. Returns the unsubscribe fn.
   */
  onChange(cb) {
    return onAuthStateChanged(this.auth, (fbUser) => {
      this.currentUser = fbUser ? toAuthProfile(fbUser) : null;
      cb(this.currentUser);
    });
  }

  async login() {
    await signInWithPopup(this.auth, this.provider);
  }

  async logout() {
    await signOut(this.auth);
  }
}
