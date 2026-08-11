import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pruneTarget, HISTORY_KEEP } from './entryHistory.js';

test('default keep is 10', () => {
  assert.equal(HISTORY_KEEP, 10);
});

test('window not yet full → nothing to prune', () => {
  // Snapshotting version 1..10 with keep=10 fills the window but drops nothing.
  for (let v = 1; v <= 10; v++) {
    assert.equal(pruneTarget(v, 10), null);
  }
});

test('the eleventh snapshot drops version 1', () => {
  assert.equal(pruneTarget(11, 10), 1);
});

test('one snapshot leaves the window per save (off-by-one)', () => {
  assert.equal(pruneTarget(12, 10), 2);
  assert.equal(pruneTarget(20, 10), 10);
});

test('respects a custom keep', () => {
  assert.equal(pruneTarget(3, 3), null);
  assert.equal(pruneTarget(4, 3), 1);
});

test('missing/zero prevVersion coerces to nothing to prune', () => {
  assert.equal(pruneTarget(undefined, 10), null);
  assert.equal(pruneTarget(null, 10), null);
  assert.equal(pruneTarget(0, 10), null);
});
