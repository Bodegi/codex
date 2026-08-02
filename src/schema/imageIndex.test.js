import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createImageIndex, publicUrl } from './imageIndex.js';

const config = { url: 'https://proj.supabase.co', anonKey: 'k', bucket: 'pool' };
const rec = (id, over = {}) => ({ id, label: id, status: 'active', codices: ['atm10'], ...over });

// --- publicUrl -------------------------------------------------------------

test('publicUrl builds the deterministic public storage URL', () => {
  assert.equal(
    publicUrl(config, 'abc123'),
    'https://proj.supabase.co/storage/v1/object/public/pool/abc123'
  );
});

test('publicUrl returns null without a usable config or id', () => {
  assert.equal(publicUrl(null, 'abc'), null);
  assert.equal(publicUrl(config, ''), null);
  assert.equal(publicUrl({ url: 'u' }, 'abc'), null); // no bucket
});

// --- createImageIndex.resolve ----------------------------------------------

test('resolve returns the deterministic URL for a known active image', () => {
  const idx = createImageIndex([rec('a')], config);
  assert.equal(idx.resolve('a'), publicUrl(config, 'a'));
});

test('resolve returns null for an unknown id (drives the not-found fallback)', () => {
  const idx = createImageIndex([rec('a')], config);
  assert.equal(idx.resolve('missing'), null);
});

test('resolve returns null for an archived image', () => {
  const idx = createImageIndex([rec('a', { status: 'archived' })], config);
  assert.equal(idx.resolve('a'), null);
});

// --- createImageIndex.listImages -------------------------------------------

test('listImages returns active images sorted by label, with resolved urls', () => {
  const idx = createImageIndex([rec('b', { label: 'Beta' }), rec('a', { label: 'Alpha' })], config);
  const list = idx.listImages();
  assert.deepEqual(list.map((i) => i.label), ['Alpha', 'Beta']);
  assert.equal(list[0].url, publicUrl(config, 'a'));
});

test('listImages omits archived images', () => {
  const idx = createImageIndex(
    [rec('a', { label: 'A' }), rec('z', { label: 'Z', status: 'archived' })],
    config
  );
  assert.deepEqual(idx.listImages().map((i) => i.id), ['a']);
});

test('listImages falls back to the id when a record has no label', () => {
  const idx = createImageIndex([{ id: 'x', status: 'active' }], config);
  assert.equal(idx.listImages()[0].label, 'x');
});

test('an empty or missing record set yields an empty index', () => {
  assert.deepEqual(createImageIndex([], config).listImages(), []);
  assert.deepEqual(createImageIndex(undefined, config).listImages(), []);
  assert.equal(createImageIndex(undefined, config).resolve('a'), null);
});
