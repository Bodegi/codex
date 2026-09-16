/**
 * Codex — Cloudinary byte store (the image byte adapter).
 *
 * Drop-in replacement for the Supabase `imageStore` behind the same `uploadImage()` port: returns
 * `{ uploadBytes(hash, bytes, contentType) }`, or `null` in local-only mode (no config → upload UI
 * hidden, so the coordinator never sees a null store). URL construction stays OUT of here — it is
 * pure (`imageIndex.publicUrl`) so the render path's synchronous `resolve()` needs no await.
 *
 * Auth is injected as a port, not imported: the store takes an async `getSecret` that yields the
 * Cloudinary `api_secret`, read at runtime from a `firestore.rules`-gated Firestore doc by an
 * authenticated editor (wired in main.js). The secret signs the upload IN THE BROWSER
 * (`cloudinarySign.js`) — no backend, and no unsigned preset scrapeable from the bundle. Cloudinary's
 * free plan offers API keys only two roles — Master Admin or Media Library User — and Media Library
 * User can't upload via the API, so the key is Master Admin. The mitigations that hold: the secret is
 * readable only by authenticated editors (the gate), the account has NO card so no charge is ever
 * possible, and codex integrity is enforced separately at the `images` create rule. A leaked secret's
 * worst case is a trusted editor's browser tampering with the Cloudinary account — recoverable by
 * re-upload, never a bill.
 *
 * The `public_id` IS the content hash, so the deterministic delivery URL (`publicUrl`) resolves the
 * asset without a lookup — the same immutable content-hash identity the Supabase key had.
 */

import { signUpload } from '../schema/cloudinarySign.js';

/**
 * Build the byte store, or `null` when config is absent/incomplete (local-only), matching imageStore.
 *
 *   config     — resolved Cloudinary config `{ cloudName, apiKey }` (or null)
 *   getSecret  — async () => the Cloudinary api_secret (or null when unavailable)
 *
 * Returns `{ uploadBytes(hash, bytes, contentType) }`.
 */
export function createCloudinaryStore(config, getSecret) {
  if (!config || !config.cloudName || !config.apiKey) return null;
  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;

  return {
    /**
     * Store the bytes under `public_id = hash` (image resource). The hash is of the SOURCE image and
     * written once; re-uploading identical bytes overwrites with the same content (harmless, idempotent
     * — the content-hash model's no-op case). Any HTTP error propagates so the caller surfaces a toast.
     */
    async uploadBytes(hash, bytes, contentType) {
      const secret = await getSecret();
      if (!secret) throw new Error('Cloudinary upload key unavailable — sign in as an editor.');
      const timestamp = Math.floor(Date.now() / 1000);
      // Signed params: public_id, timestamp, and (when set) the organizing asset_folder. api_key/file
      // travel unsigned (see cloudinarySign.js). asset_folder is Media Library metadata only — it keeps
      // uploads out of the account root without changing the public_id, so the delivery URL is unaffected.
      const params = { public_id: hash, timestamp };
      if (config.folder) params.asset_folder = config.folder;
      const signature = await signUpload(params, secret);

      const form = new FormData();
      form.append('file', new Blob([bytes], { type: contentType || 'application/octet-stream' }));
      form.append('public_id', hash);
      form.append('timestamp', String(timestamp));
      if (config.folder) form.append('asset_folder', config.folder);
      form.append('api_key', config.apiKey);
      form.append('signature', signature);

      const res = await fetch(endpoint, { method: 'POST', body: form });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Cloudinary upload failed (${res.status}): ${detail.slice(0, 300)}`);
      }
    },
  };
}
