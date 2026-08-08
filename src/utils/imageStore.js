/**
 * Codex — Supabase byte store (the image byte adapter).
 *
 * The ONLY module importing `@supabase/supabase-js`, mirroring how `firebase.js`
 * quarantines Firestore: Supabase is confined to byte storage, nothing else. URL
 * construction is deliberately NOT here — it is pure (`imageIndex.publicUrl`) so the
 * render path's synchronous `resolve()` needs no SDK.
 *
 * Auth is injected as a port, not imported: the store takes an async `getAccessToken`
 * that yields the current Firebase ID token. That token flows to Supabase through the
 * SDK's third-party-auth `accessToken` option, so Supabase trusts our Firebase project's
 * JWTs without a separate login. The store stays decoupled from
 * `AuthManager` — it depends on "a thing that returns a token", wired in `main.js`.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Storage RLS the `codex-images` bucket depends on. The version-controlled SSOT is
 * supabase/migrations/ (deploy recipe in supabase/config.toml), reconciled against the live project.
 * Two write-policy pins are load-bearing and BOTH fail SILENTLY if "hardened" the wrong way:
 *   - Granted `to public`, NOT `to authenticated`: Storage's RLS context can't read the Firebase
 *     `iss`/`aud` claims on the authenticated-role path, and we mint no per-user `role:'authenticated'`
 *     claim — so `to authenticated` (which looks stricter) silently denies every new user's first upload.
 *   - `with check` pins `auth.jwt()->>'iss'`/`'aud'` to THIS Firebase project (`codex-80902`), not merely
 *     "is authenticated": Firebase shares one signing key across all its projects, so a loose pin lets any
 *     Firebase project's token write — and the bucket is public-read, so those bytes go world-visible.
 *   - The policy hard-codes `bucket_id = 'codex-images'`; `appConfig.supabase.bucket` is the SSOT for the
 *     URL/upload path only, NOT authorization — renaming it without recreating the bucket + policy 403s.
 */

/**
 * Build the byte store, or return `null` in local-only mode (no Supabase config), matching
 * the `fbManager.codex()` unconfigured convention — the caller guards and the upload UI is
 * hidden, so a null store is never handed to the upload coordinator.
 *
 *   config          — resolved Supabase config `{ url, anonKey, bucket }` (or null)
 *   getAccessToken  — async () => current Firebase ID token (or null when signed out)
 *
 * Returns `{ uploadBytes(hash, bytes, contentType) }`.
 */
export function createImageStore(config, getAccessToken) {
  if (!config || !config.url || !config.anonKey || !config.bucket) return null;

  const client = createClient(config.url, config.anonKey, {
    // Called by the SDK per request to attach the bearer token. Signed-out → null, so the
    // request carries only the anon key and Storage RLS denies the write (the correct default).
    accessToken: async () => (await getAccessToken()) ?? null,
  });

  return {
    /**
     * Store the bytes at `{bucket}/{hash}` with their content-type. A plain insert, NOT an upsert:
     * content-hash identity makes the bytes immutable (same id ⇒ same bytes), so a stored blob is
     * never rewritten. A 409 "already exists" (a re-upload race, or bytes some other codex already
     * shares) is therefore a harmless no-op, swallowed here. Any other error propagates so the caller
     * surfaces an error toast.
     *
     * Insert, not upsert: an upsert makes Supabase Storage exercise its UPDATE policy, whose RLS
     * context cannot see the Firebase `iss`/`aud` claims the write pin needs — so it's denied even
     * for a valid caller. Insert-only matches the immutable content-hash model anyway.
     */
    async uploadBytes(hash, bytes, contentType) {
      const { error } = await client.storage
        .from(config.bucket)
        .upload(hash, bytes, { contentType });
      if (error && !isAlreadyExists(error)) throw error;
    },
  };
}

/** A Supabase Storage 409 (key already exists) — the content-hash no-op case, not a failure. */
function isAlreadyExists(error) {
  return String(error?.statusCode) === '409' || /already exists/i.test(error?.message || '');
}
