import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGallery, galleryIds, isEmptyGallery } from './galleryModel.js';

test('normalizeGallery reads the {id,caption} shape as-is (coercing caption to a string)', () => {
  assert.deepEqual(
    normalizeGallery([{ id: 'a', caption: 'First' }, { id: 'b' }]),
    [{ id: 'a', caption: 'First' }, { id: 'b', caption: '' }]
  );
});

test('normalizeGallery reads a legacy bare-id array (back-compat), captions empty', () => {
  assert.deepEqual(normalizeGallery(['a', 'b']), [{ id: 'a', caption: '' }, { id: 'b', caption: '' }]);
});

test('normalizeGallery drops id-less / blank entries and trims ids', () => {
  assert.deepEqual(
    normalizeGallery([' a ', '', { caption: 'no id' }, { id: '  ' }, { id: 'c', caption: 'C' }]),
    [{ id: 'a', caption: '' }, { id: 'c', caption: 'C' }]
  );
});

test('normalizeGallery of a non-array is empty', () => {
  assert.deepEqual(normalizeGallery(undefined), []);
  assert.deepEqual(normalizeGallery('a,b'), []);
});

test('galleryIds returns just the ids in order', () => {
  assert.deepEqual(galleryIds([{ id: 'a', caption: 'x' }, 'b']), ['a', 'b']);
});

test('isEmptyGallery reflects whether any image survives normalization', () => {
  assert.equal(isEmptyGallery([]), true);
  assert.equal(isEmptyGallery([{ caption: 'no id' }]), true);
  assert.equal(isEmptyGallery(['a']), false);
});
