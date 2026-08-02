/**
 * Baked application config for Codex Studio.
 *
 * These values ship in the build (and, once deployed, in the public bundle). The Firebase web
 * config is a project *locator*, not a secret — real access control lives in Firestore security
 * rules, not here. See HANDOFF.md §9 and the "Auth: soft gate now → enforced later" parking-lot item.
 *
 * Local dev override — set localStorage key `codex_firebase_override` to one of:
 *   - a JSON Firebase config `{ apiKey, authDomain, projectId }` → point a local build at a *dev*
 *     Firestore project, so local work never touches deployed entries; or
 *   - the string `local` → force local-only mode (no Firestore; bundled data + manual JSON save/open).
 * The override wins over the baked config; a malformed override is ignored (falls back to baked).
 */

export const appConfig = {
  firebase: {
    apiKey: 'AIzaSyAOSiuf2deoDztSFwIZ8CSENncuvx-zTCc',
    authDomain: 'codex-80902.firebaseapp.com',
    projectId: 'codex-80902',
  },
  // Google sign-in via Firebase Auth — no OAuth client ID needed (Firebase `authDomain` handles the
  // handshake). `adminEmail` lists the baked super-admins, mirrored by the Firestore security rules
  // (isAdmin()). Everyone else's access comes from their per-codex `permissions` doc (editor/viewer),
  // resolved by capabilities.js and enforced by the rules — no baked allowlist.
  auth: {
    adminEmail: ['bodegigaming@gmail.com', 'aspensquare.chuck@gmail.com'],
  },
};

/**
 * Resolve the effective Firebase config from the baked default and an optional raw override string
 * (localStorage `codex_firebase_override`). Pure — every input is passed in, so it is Node-testable.
 *
 * Returns a Firebase config object to connect with, or `null` to run local-only. `null` covers both
 * "no usable config" and the explicit `local` sentinel — the caller treats both as local-only.
 */
export function resolveFirebaseConfig(baked, overrideRaw) {
  const raw = typeof overrideRaw === 'string' ? overrideRaw.trim() : '';
  if (raw) {
    if (raw === 'local') return null; // explicit local-only
    try {
      const parsed = JSON.parse(raw);
      if (parsed === 'local') return null;
      if (parsed && parsed.apiKey) return parsed;
    } catch {
      // malformed override → ignore and fall through to the baked config
    }
  }
  return baked && baked.apiKey ? baked : null;
}
