import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveFirebaseConfig } from './appConfig.js';

const baked = { apiKey: 'baked-key', authDomain: 'baked.firebaseapp.com', projectId: 'baked' };

test('no override → baked config', () => {
  assert.deepEqual(resolveFirebaseConfig(baked, null), baked);
  assert.deepEqual(resolveFirebaseConfig(baked, ''), baked);
  assert.deepEqual(resolveFirebaseConfig(baked, '   '), baked);
});

test('override with a JSON Firebase config → that config wins', () => {
  const dev = { apiKey: 'dev-key', authDomain: 'dev.firebaseapp.com', projectId: 'dev' };
  assert.deepEqual(resolveFirebaseConfig(baked, JSON.stringify(dev)), dev);
});

test('override "local" (bare or JSON-quoted) → null (local-only)', () => {
  assert.equal(resolveFirebaseConfig(baked, 'local'), null);
  assert.equal(resolveFirebaseConfig(baked, '  local  '), null);
  assert.equal(resolveFirebaseConfig(baked, '"local"'), null);
});

test('malformed override → ignored, falls back to baked', () => {
  assert.deepEqual(resolveFirebaseConfig(baked, '{ not json'), baked);
});

test('override JSON without apiKey → ignored, falls back to baked', () => {
  assert.deepEqual(resolveFirebaseConfig(baked, '{}'), baked);
  assert.deepEqual(resolveFirebaseConfig(baked, JSON.stringify({ projectId: 'x' })), baked);
});

test('no baked config and no usable override → null (local-only)', () => {
  assert.equal(resolveFirebaseConfig(null, null), null);
  assert.equal(resolveFirebaseConfig({}, null), null);
});
