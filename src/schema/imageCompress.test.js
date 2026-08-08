import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planCompression, chooseOutput, MAX_EDGE, QUALITY, MIN_BYTES } from './imageCompress.js';

const big = { type: 'image/png', size: 5 * 1024 * 1024, width: 4000, height: 3000 };

// --- planCompression: skip cases -------------------------------------------

test('passes animated GIFs through untouched', () => {
  const plan = planCompression({ type: 'image/gif', size: 9e6, width: 800, height: 600 });
  assert.deepEqual(plan, { skip: true, reason: 'gif' });
});

test('skips non-images defensively', () => {
  assert.equal(planCompression({ type: 'application/pdf', size: 9e6, width: 8, height: 8 }).reason, 'not-image');
});

test('skips when the file is already small', () => {
  const plan = planCompression({ ...big, size: MIN_BYTES });
  assert.deepEqual(plan, { skip: true, reason: 'small' });
});

test('skips undecodable dimensions', () => {
  assert.equal(planCompression({ type: 'image/png', size: 9e6, width: 0, height: 0 }).reason, 'undecodable');
  assert.equal(planCompression({ type: 'image/png', size: 9e6, width: NaN, height: 10 }).reason, 'undecodable');
});

test('skips WebP that needs no downscale (avoid WebP→WebP churn)', () => {
  const plan = planCompression({ type: 'image/webp', size: 2e6, width: 1000, height: 800 });
  assert.deepEqual(plan, { skip: true, reason: 'already-webp' });
});

// --- planCompression: encode plans -----------------------------------------

test('downscales the longest edge to the cap, preserving aspect ratio', () => {
  const plan = planCompression(big); // 4000x3000, longest 4000
  assert.equal(plan.mime, 'image/webp');
  assert.equal(plan.quality, QUALITY);
  assert.equal(plan.targetWidth, MAX_EDGE); // 2048
  assert.equal(plan.targetHeight, Math.round(3000 * (MAX_EDGE / 4000))); // 1536
});

test('caps by height when the image is portrait', () => {
  const plan = planCompression({ type: 'image/jpeg', size: 4e6, width: 3000, height: 5000 });
  assert.equal(plan.targetHeight, MAX_EDGE);
  assert.equal(plan.targetWidth, Math.round(3000 * (MAX_EDGE / 5000)));
});

test('re-encodes without downscaling when already within the cap', () => {
  const plan = planCompression({ type: 'image/jpeg', size: 4e6, width: 1600, height: 900 });
  assert.equal(plan.mime, 'image/webp');
  assert.equal(plan.targetWidth, 1600);
  assert.equal(plan.targetHeight, 900);
});

test('honors option overrides', () => {
  const plan = planCompression(big, { maxEdge: 1000, quality: 0.7 });
  assert.equal(plan.targetWidth, 1000);
  assert.equal(plan.quality, 0.7);
});

// --- chooseOutput: keep-original-if-bigger ---------------------------------

test('keeps the compressed output when it is smaller', () => {
  const original = { size: 1000, kind: 'orig' };
  const compressed = { size: 400, kind: 'webp' };
  assert.equal(chooseOutput(original, compressed).kind, 'webp');
});

test('keeps the original when the compressed result is larger or equal', () => {
  const original = { size: 1000, kind: 'orig' };
  assert.equal(chooseOutput(original, { size: 1000, kind: 'webp' }).kind, 'orig');
  assert.equal(chooseOutput(original, { size: 1200, kind: 'webp' }).kind, 'orig');
});

test('keeps the original when compression failed (null / no size)', () => {
  const original = { size: 1000, kind: 'orig' };
  assert.equal(chooseOutput(original, null).kind, 'orig');
  assert.equal(chooseOutput(original, { kind: 'webp' }).kind, 'orig');
});
