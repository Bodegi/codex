/**
 * Codex — Cloudinary upload-signature (pure).
 *
 * The signed-upload seam that lets a *backendless* client authenticate to Cloudinary: sign the
 * upload params with the account `api_secret` in the browser, so no unsigned preset (which anyone
 * could scrape from the bundle) is exposed. The secret itself never lives in code — it's read at
 * runtime from a `firestore.rules`-gated Firestore doc by an authenticated editor (see main.js /
 * cloudinaryStore.js). This module only does the math; it never sees where the secret came from.
 *
 * Algorithm is Cloudinary's (verified against their documented test vector in the test beside this):
 * take every signed param, sort by name, join `k=v` with `&`, append the secret with NO separator,
 * then hex-encode the SHA-1 (or SHA-256) digest. `file`, `cloud_name`, `resource_type`, and `api_key`
 * are never signed. Uses Web Crypto (`crypto.subtle.digest`) — the same call in the browser and in
 * Node's test runner — so the module imports nothing and stays Node-testable.
 */

// Never part of the signature (Cloudinary's rule): the bytes, the account locator, the resource
// kind, and the public api_key all travel unsigned.
const UNSIGNED = new Set(['file', 'cloud_name', 'resource_type', 'api_key']);

/** Cloudinary's canonical string-to-sign for a param set: sorted `k=v&…` with the secret appended raw. */
export function stringToSign(params, apiSecret) {
  return (
    Object.keys(params)
      .filter((k) => !UNSIGNED.has(k) && params[k] != null && params[k] !== '')
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&') + apiSecret
  );
}

/**
 * The hex signature for an upload param set. `algo` is a Web Crypto digest name — 'SHA-1' (Cloudinary's
 * default) or 'SHA-256' (also accepted). Async because `crypto.subtle.digest` is.
 */
export async function signUpload(params, apiSecret, algo = 'SHA-1') {
  const bytes = new TextEncoder().encode(stringToSign(params, apiSecret));
  const digest = await crypto.subtle.digest(algo, bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
