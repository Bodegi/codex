import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveFirebaseConfig, resolveSupabaseConfig } from './appConfig.js';

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

// --- resolveSupabaseConfig -------------------------------------------------

const bakedSupa = { url: 'https://proj.supabase.co', anonKey: 'anon-key', bucket: 'pool' };

test('no override → baked supabase config', () => {
  assert.deepEqual(resolveSupabaseConfig(bakedSupa, null), bakedSupa);
  assert.deepEqual(resolveSupabaseConfig(bakedSupa, ''), bakedSupa);
  assert.deepEqual(resolveSupabaseConfig(bakedSupa, '   '), bakedSupa);
});

test('override "local" (bare or JSON-quoted) → null (image store off in local-only)', () => {
  assert.equal(resolveSupabaseConfig(bakedSupa, 'local'), null);
  assert.equal(resolveSupabaseConfig(bakedSupa, '  local  '), null);
  assert.equal(resolveSupabaseConfig(bakedSupa, '"local"'), null);
});

test('a JSON firebase override (dev firestore) still yields the baked supabase config', () => {
  const devFb = JSON.stringify({ apiKey: 'dev', projectId: 'dev' });
  assert.deepEqual(resolveSupabaseConfig(bakedSupa, devFb), bakedSupa);
});

test('a malformed override → ignored, falls back to baked supabase config', () => {
  assert.deepEqual(resolveSupabaseConfig(bakedSupa, '{ not json'), bakedSupa);
});

test('incomplete or missing baked supabase config → null', () => {
  assert.equal(resolveSupabaseConfig(null, null), null);
  assert.equal(resolveSupabaseConfig({ url: 'u', bucket: 'pool' }, null), null); // no anonKey
  assert.equal(resolveSupabaseConfig({ anonKey: 'a', bucket: 'pool' }, null), null); // no url
});
