/**
 * Codex — Image optimize (browser-only edge).
 *
 * The canvas half of issue #10: downscale-then-WebP an upload before it is stored,
 * so a 9 MB hero or a 5000px map doesn't ship full-size to Supabase and load
 * full-size in every reader view. The *policy* (dims, quality, skip rules) is the
 * pure `schema/imageCompress.js`; this module only does the DOM-bound decode/encode
 * and hands back the winning bytes.
 *
 * Wired into `uploadImage` as its `compress()` port. It runs ONLY on a dedup miss
 * (the id is hashed from the source first), so a re-upload of a known image skips
 * this work entirely.
 *
 * Every failure path degrades to the source bytes — an undecodable file, no 2D
 * context, a `toBlob` that yields null (older Safari without WebP), or a "compressed"
 * result that came out larger. We never block or inflate an upload by optimizing it.
 */

import { planCompression, chooseOutput } from '../schema/imageCompress.js';

/**
 * Optimize one File/Blob for storage. Returns `{ bytes: Uint8Array, contentType }` —
 * the WebP re-encode when it's a smaller win, otherwise the source bytes unchanged.
 */
export async function optimizeImage(file) {
  let bitmap;
  try {
    // `from-image` applies EXIF orientation so phone photos aren't stored sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return passthrough(file); // undecodable here → let the raw bytes through
  }

  const plan = planCompression({
    type: file.type,
    size: file.size,
    width: bitmap.width,
    height: bitmap.height,
  });
  if (plan.skip) {
    bitmap.close?.();
    return passthrough(file);
  }

  const blob = await encode(bitmap, plan);
  bitmap.close?.();
  if (!blob) return passthrough(file); // toBlob unsupported / failed

  const winner = chooseOutput({ size: file.size, kind: 'original' }, { size: blob.size, kind: 'compressed' });
  if (winner.kind === 'original') return passthrough(file);

  // Trust the blob's own type, not plan.mime: an older Safari that can't do WebP hands back a
  // PNG instead, and we must label the stored bytes with what they actually are.
  return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type || plan.mime };
}

async function passthrough(file) {
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: file.type || 'application/octet-stream',
  };
}

function encode(bitmap, plan) {
  const canvas = document.createElement('canvas');
  canvas.width = plan.targetWidth;
  canvas.height = plan.targetHeight;
  const cx = canvas.getContext('2d');
  if (!cx) return Promise.resolve(null);
  cx.drawImage(bitmap, 0, 0, plan.targetWidth, plan.targetHeight);
  return new Promise((resolve) => canvas.toBlob(resolve, plan.mime, plan.quality));
}
