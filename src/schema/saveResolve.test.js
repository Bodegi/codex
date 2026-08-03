import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSave } from './saveResolve.js';

test('a brand-new entry (no versions yet) writes version 1', () => {
  assert.deepEqual(resolveSave({ currentVersion: undefined, baseVersion: undefined }), {
    action: 'write',
    nextVersion: 1,
  });
});

test('a matched base version writes the next version', () => {
  assert.deepEqual(resolveSave({ currentVersion: 3, baseVersion: 3 }), {
    action: 'write',
    nextVersion: 4,
  });
});

test('a stale base version is a conflict (no write)', () => {
  assert.deepEqual(resolveSave({ currentVersion: 4, baseVersion: 3 }), {
    action: 'conflict',
    nextVersion: 5,
  });
});

test('force overrides a stale base version and writes the next version', () => {
  assert.deepEqual(resolveSave({ currentVersion: 4, baseVersion: 3, force: true }), {
    action: 'write',
    nextVersion: 5,
  });
});

test('null/undefined versions coerce to 0 (matched → write version 1)', () => {
  assert.deepEqual(resolveSave({ currentVersion: null, baseVersion: null }), {
    action: 'write',
    nextVersion: 1,
  });
});
