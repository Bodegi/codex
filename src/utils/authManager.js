/**
 * Google sign-in via Firebase Authentication for Codex Studio.
 *
 * Because Google is a native Firebase Auth provider, a signed-in user carries a real `request.auth`
 * into Firestore security rules — no custom-token bridge, serverless function, or Blaze plan needed.
 * Auth requires an initialized Firebase app, so this manager only exists when Firebase is configured;
 * local-only mode runs unauthenticated. This manager owns *identity* only — authorization (admin /
 * editor / viewer / none) is resolved separately by capabilities.js.
 */

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
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

  /**
   * Dev-only: sign in with an Admin-SDK custom token (see scripts/dev-mint-token.mjs), bypassing the
   * Google popup so an automated browser can act as a real user for testing. Never used in the normal
   * flow — main.js only calls this when the `codex_dev_custom_token` localStorage key is set, which no
   * production user ever has. The minted token is short-lived and exchanged for a normal session.
   */
  async loginWithCustomToken(token) {
    await signInWithCustomToken(this.auth, token);
  }

  async logout() {
    await signOut(this.auth);
  }
}
