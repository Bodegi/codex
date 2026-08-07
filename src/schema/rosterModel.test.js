import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRoster } from './rosterModel.js';

const USERS = [
  { uid: 'u1', email: 'a@x.com', displayName: 'Ann', lastSeenAt: '2026-01-01' },
  { uid: 'u2', email: 'b@x.com', displayName: 'Bo', lastSeenAt: '2026-01-02' },
];

test('joins each user with their role for the given codex', () => {
  const perms = [
    { uid: 'u1', codexId: 'atm10', role: 'editor' },
    { uid: 'u2', codexId: 'atm10', role: 'viewer' },
  ];
  const rows = buildRoster({ users: USERS, perms, codexId: 'atm10', adminEmail: 'admin@x.com' });
  assert.deepEqual(rows.map((r) => [r.uid, r.role]), [['u1', 'editor'], ['u2', 'viewer']]);
});

test('a user with no permission doc for the codex gets role "none"', () => {
  const rows = buildRoster({ users: USERS, perms: [], codexId: 'atm10', adminEmail: 'admin@x.com' });
  assert.deepEqual(rows.map((r) => r.role), ['none', 'none']);
});

test('only permissions for the target codex count', () => {
  const perms = [
    { uid: 'u1', codexId: 'other', role: 'editor' }, // different codex — ignored
    { uid: 'u2', codexId: 'atm10', role: 'viewer' },
  ];
  const rows = buildRoster({ users: USERS, perms, codexId: 'atm10', adminEmail: 'admin@x.com' });
  assert.equal(rows.find((r) => r.uid === 'u1').role, 'none');
  assert.equal(rows.find((r) => r.uid === 'u2').role, 'viewer');
});

test('isAdmin flags the baked admin email, case-insensitively', () => {
  const users = [{ uid: 'u1', email: 'ADMIN@x.com', displayName: 'Ann', lastSeenAt: null }];
  const rows = buildRoster({ users, perms: [], codexId: 'atm10', adminEmail: 'admin@x.com' });
  assert.equal(rows[0].isAdmin, true);
});

test('non-admin users are not flagged', () => {
  const rows = buildRoster({ users: USERS, perms: [], codexId: 'atm10', adminEmail: 'admin@x.com' });
  assert.deepEqual(rows.map((r) => r.isAdmin), [false, false]);
});

test('carries through identity fields the panel renders', () => {
  const rows = buildRoster({ users: USERS, perms: [], codexId: 'atm10', adminEmail: 'admin@x.com' });
  assert.deepEqual(rows[0], {
    uid: 'u1',
    email: 'a@x.com',
    displayName: 'Ann',
    lastSeenAt: '2026-01-01',
    role: 'none',
    isAdmin: false,
  });
});

test('no users yields an empty roster', () => {
  assert.deepEqual(buildRoster({ users: [], perms: [], codexId: 'atm10', adminEmail: 'a@x.com' }), []);
});
