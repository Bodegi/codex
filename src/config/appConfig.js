/**
 * Baked application config for Codex Studio.
 *
 * These values ship in the build (and, once deployed, in the public bundle). The Firebase web
 * config is a project *locator*, not a secret — real access control lives in Firestore security
 * rules, not here.
 *
 * Local dev override — set localStorage key `codex_firebase_override` to one of:
 *   - a JSON Firebase config `{ apiKey, authDomain, projectId }` → point a local build at a *dev*
 *     Firestore project, so local work never touches deployed entries; or
 *   - the string `local` → force local-only mode (no Firestore; the bundled demo codex, in-memory).
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
    adminEmail: ['bodegigaming@gmail.com', 'aspensquare.chuck@gmail.com', 'tomchalm@gmail.com'],
  },
  // Cloudinary hosts uploaded image bytes (Firestore keeps the metadata).
  // `cloudName` + `apiKey` are public locators, safe to ship: they appear in delivery/upload URLs by
  // design. The sensitive `api_secret` is NOT here — it lives in a firestore.rules-gated `secrets`
  // doc, read at runtime and used to sign uploads in the browser (see cloudinaryStore.js). Empty →
  // resolveCloudinaryConfig returns null and the byte store stays off (local-only for images).
  cloudinary: {
    cloudName: 'izjbtl82',
    apiKey: '876162768617657',
    // Cloudinary asset folder new uploads land in — Media Library organization only (dynamic-folder
    // metadata), NOT part of the public_id, so it never affects the delivery URL or authorization.
    folder: 'codex-images',
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

/**
 * Resolve the effective Cloudinary config from the baked default and the same optional override string.
 * Pure and Node-testable. The byte store is coupled to Firebase (the upload signature's secret lives in
 * Firestore), so the `local` sentinel — which forces Firebase local-only — turns Cloudinary off too. Any
 * other override (e.g. a dev-Firestore JSON config) leaves the baked config in place. Returns the config,
 * or `null` (byte store off) when local-only or the baked config lacks a cloudName/apiKey.
 */
export function resolveCloudinaryConfig(baked, overrideRaw) {
  const raw = typeof overrideRaw === 'string' ? overrideRaw.trim() : '';
  if (raw === 'local') return null;
  try {
    if (raw && JSON.parse(raw) === 'local') return null;
  } catch {
    // non-JSON override (e.g. a Firebase config object) → not the local sentinel; ignore
  }
  return baked && baked.cloudName && baked.apiKey ? baked : null;
}
