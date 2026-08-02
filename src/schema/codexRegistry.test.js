import { test } from 'node:test';
import assert from 'node:assert/strict';

import { switcherCodices, archivedCodices } from './codexRegistry.js';

const CODICES = [
  { codexId: 'atm10', name: 'ATM10', status: 'active' },
  { codexId: 'dnd', name: 'Dungeons', status: 'active' },
  { codexId: 'retired', name: 'Retired', status: 'archived' },
  { codexId: 'legacy', name: 'Legacy' }, // no status → active
];

const PERMISSIONS = [
  { uid: 'u1', codexId: 'dnd', role: 'editor' },
  { uid: 'u1', codexId: 'retired', role: 'viewer' },
  { uid: 'u2', codexId: 'atm10', role: 'viewer' },
];

test('an admin sees every active codex, sorted by name', () => {
  const list = switcherCodices(CODICES, PERMISSIONS, { isAdmin: true, uid: 'admin' });
  assert.deepEqual(list.map((c) => c.codexId), ['atm10', 'dnd', 'legacy']);
});

test('an admin never sees archived codices in the switcher', () => {
  const list = switcherCodices(CODICES, PERMISSIONS, { isAdmin: true, uid: 'admin' });
  assert.ok(!list.some((c) => c.codexId === 'retired'));
});

test('a non-admin sees only active codices they hold a permission for', () => {
  const list = switcherCodices(CODICES, PERMISSIONS, { isAdmin: false, uid: 'u1' });
  assert.deepEqual(list.map((c) => c.codexId), ['dnd']); // retired is archived, so excluded
});

test('a non-admin with no permissions sees nothing', () => {
  const list = switcherCodices(CODICES, PERMISSIONS, { isAdmin: false, uid: 'nobody' });
  assert.deepEqual(list, []);
});

test('a codex with no status is treated as active', () => {
  const list = switcherCodices(CODICES, PERMISSIONS, { isAdmin: true, uid: 'admin' });
  assert.ok(list.some((c) => c.codexId === 'legacy'));
});

test('archivedCodices returns only archived codices', () => {
  assert.deepEqual(archivedCodices(CODICES).map((c) => c.codexId), ['retired']);
});
