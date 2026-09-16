import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stringToSign, signUpload } from './cloudinarySign.js';

// Cloudinary's own documented worked example (docs: authentication_signatures). If our string
// assembly or digest drifts from theirs, this vector breaks — it's the proof the browser signer
// is byte-for-byte Cloudinary-compatible, not just plausible.
const VECTOR = {
  params: { timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' },
  apiSecret: 'abcd',
  string: 'eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510abcd',
  sha1: 'bfd09f95f331f558cbd1320e67aa8d488770583e',
};

test('stringToSign matches Cloudinary: signed params sorted, joined with &, secret appended raw', () => {
  assert.equal(stringToSign(VECTOR.params, VECTOR.apiSecret), VECTOR.string);
});

test('signUpload reproduces Cloudinary’s documented SHA-1 signature', async () => {
  assert.equal(await signUpload(VECTOR.params, VECTOR.apiSecret), VECTOR.sha1);
});

test('SHA-256 is available as the alternate digest Cloudinary accepts', async () => {
  const sig = await signUpload(VECTOR.params, VECTOR.apiSecret, 'SHA-256');
  assert.match(sig, /^[0-9a-f]{64}$/); // 32-byte digest, hex
  assert.notEqual(sig, VECTOR.sha1);
});

test('the four unsigned params never enter the signature', () => {
  const base = { public_id: 'x', timestamp: 1 };
  const withUnsigned = { ...base, file: 'BYTES', cloud_name: 'c', resource_type: 'image', api_key: 'k' };
  assert.equal(stringToSign(withUnsigned, 's'), stringToSign(base, 's'));
});

test('empty/nullish params are dropped, not signed as blank', () => {
  assert.equal(stringToSign({ public_id: 'x', folder: '', tags: null, timestamp: 1 }, 's'), stringToSign({ public_id: 'x', timestamp: 1 }, 's'));
});
