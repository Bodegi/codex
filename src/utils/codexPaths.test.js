import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  entryId,
  permissionId,
  usersCollectionPath,
  userDocPath,
  permissionsCollectionPath,
  codexMetaPath,
  permissionDocPath,
  entriesCollectionPath,
  entryDocPath,
  schemasCollectionPath,
  schemaDocPath,
  atlasDocPath,
  imagesCollectionPath,
  imageDocPath,
  iconsCollectionPath,
  iconDocPath,
} from './codexPaths.js';

test('entryId keeps the ${type}_${id} convention', () => {
  assert.equal(entryId('civilization', 'dwarves'), 'civilization_dwarves');
});

test('permissionId is one deterministic grant per (uid, codexId)', () => {
  assert.equal(permissionId('user123', 'atm10'), 'user123_atm10');
});

test('top-level docs live outside the codex subtree', () => {
  assert.deepEqual(codexMetaPath('atm10'), ['codices', 'atm10']);
  assert.deepEqual(permissionDocPath('user123', 'atm10'), ['permissions', 'user123_atm10']);
});

test('users + permissions are global top-level collections', () => {
  assert.deepEqual(usersCollectionPath(), ['users']);
  assert.deepEqual(userDocPath('user123'), ['users', 'user123']);
  assert.deepEqual(permissionsCollectionPath(), ['permissions']);
});

test('images are a global top-level library keyed by content hash', () => {
  assert.deepEqual(imagesCollectionPath(), ['images']);
  assert.deepEqual(imageDocPath('a1b2c3d4e5f6'), ['images', 'a1b2c3d4e5f6']);
  assert.deepEqual(iconsCollectionPath(), ['icons']);
  assert.deepEqual(iconDocPath('civilization'), ['icons', 'civilization']);
});

test('entries are scoped under codices/{id}/entries', () => {
  assert.deepEqual(entriesCollectionPath('atm10'), ['codices', 'atm10', 'entries']);
  assert.deepEqual(entryDocPath('atm10', 'mod', 'create'), ['codices', 'atm10', 'entries', 'mod_create']);
});

test('schemas are scoped under codices/{id}/schemas, keyed by type', () => {
  assert.deepEqual(schemasCollectionPath('atm10'), ['codices', 'atm10', 'schemas']);
  assert.deepEqual(schemaDocPath('atm10', 'region'), ['codices', 'atm10', 'schemas', 'region']);
});

test('atlas is scoped under codices/{id}/atlas', () => {
  assert.deepEqual(atlasDocPath('atm10', 'world_vector_data'), [
    'codices',
    'atm10',
    'atlas',
    'world_vector_data',
  ]);
});

test('paths re-scope cleanly for a different codex', () => {
  assert.deepEqual(entryDocPath('dnd-campaign', 'civilization', 'elves'), [
    'codices',
    'dnd-campaign',
    'entries',
    'civilization_elves',
  ]);
});
