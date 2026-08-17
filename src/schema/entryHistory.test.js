import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pruneTarget, retainedVersions, HISTORY_KEEP } from './entryHistory.js';

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

test('missing/zero snapshotVersion coerces to nothing to prune', () => {
  assert.equal(pruneTarget(undefined, 10), null);
  assert.equal(pruneTarget(null, 10), null);
  assert.equal(pruneTarget(0, 10), null);
});

// #44: the ring keys snapshots by the version written, so the live version is always recoverable.
test('the live version is itself retained — newest state is recoverable', () => {
  for (const n of [1, 2, 5, 20]) {
    assert.equal(retainedVersions(n).at(0), n, `live version ${n} must be in the ring`);
  }
});

test('a single-save entry still has history', () => {
  // The old "snapshot prior" model left create-only entries with no history at all.
  assert.deepEqual(retainedVersions(1), [1]);
});

test('retained window holds the last keep versions, newest first', () => {
  assert.deepEqual(retainedVersions(3), [3, 2, 1]);
  assert.deepEqual(retainedVersions(12), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal(retainedVersions(20).length, HISTORY_KEEP);
});

test('retained set agrees with pruneTarget — the dropped version is just below the window', () => {
  // After the save that wrote version v, pruneTarget(v) is exactly the version no longer retained.
  for (const v of [11, 12, 20]) {
    const kept = retainedVersions(v);
    assert.equal(pruneTarget(v), kept.at(-1) - 1);
  }
});

test('retained window respects a custom keep', () => {
  assert.deepEqual(retainedVersions(5, 3), [5, 4, 3]);
});

test('no saves → empty ring', () => {
  assert.deepEqual(retainedVersions(0), []);
  assert.deepEqual(retainedVersions(undefined), []);
});
