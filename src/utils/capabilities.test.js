import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCapabilities, isAdminEmail, roleBadge } from './capabilities.js';

const ADMIN = 'owner@example.com';
const caps = (user, permission, adminEmail = ADMIN) =>
  resolveCapabilities({ user, permission, adminEmail });

test('no user → not authed, no capabilities (→ gateway)', () => {
  const c = caps(null, null);
  assert.equal(c.isAuthed, false);
  assert.equal(c.role, 'none');
  assert.equal(c.canRead, false);
  assert.equal(c.canEdit, false);
  assert.equal(c.canAdmin, false);
});

test('admin email → admin with all capabilities', () => {
  const c = caps({ uid: 'u1', email: ADMIN }, null);
  assert.equal(c.role, 'admin');
  assert.deepEqual([c.canRead, c.canEdit, c.canAdmin], [true, true, true]);
});

test('admin email is admin even with a viewer permission doc', () => {
  const c = caps({ uid: 'u1', email: ADMIN }, { role: 'viewer' });
  assert.equal(c.role, 'admin');
  assert.equal(c.canAdmin, true);
});

test('admin email match is case-insensitive', () => {
  const c = caps({ uid: 'u1', email: 'Owner@Example.COM' }, null);
  assert.equal(c.role, 'admin');
});

test('editor permission → read + write, not admin', () => {
  const c = caps({ uid: 'u2', email: 'friend@example.com' }, { role: 'editor' });
  assert.equal(c.role, 'editor');
  assert.deepEqual([c.canRead, c.canEdit, c.canAdmin], [true, true, false]);
});

test('viewer permission → read only', () => {
  const c = caps({ uid: 'u3', email: 'reader@example.com' }, { role: 'viewer' });
  assert.equal(c.role, 'viewer');
  assert.deepEqual([c.canRead, c.canEdit, c.canAdmin], [true, false, false]);
});

test('signed in with no permission doc → role none, no read (→ awaiting access)', () => {
  const c = caps({ uid: 'u4', email: 'nobody@example.com' }, null);
  assert.equal(c.isAuthed, true);
  assert.equal(c.role, 'none');
  assert.deepEqual([c.canRead, c.canEdit, c.canAdmin], [false, false, false]);
});

test('unknown role value is treated as no access', () => {
  const c = caps({ uid: 'u5', email: 'weird@example.com' }, { role: 'superuser' });
  assert.equal(c.role, 'none');
  assert.equal(c.canRead, false);
});

test('empty adminEmail never grants admin', () => {
  const c = caps({ uid: 'u6', email: '' }, null, '');
  assert.notEqual(c.role, 'admin');
  assert.equal(c.canAdmin, false);
});

test('adminEmail may be a list — any listed email is a super-admin', () => {
  const admins = ['owner@example.com', 'second@example.com'];
  assert.equal(caps({ uid: 'a', email: 'second@example.com' }, null, admins).canAdmin, true);
  assert.equal(caps({ uid: 'b', email: 'OWNER@example.com' }, null, admins).canAdmin, true); // case-insensitive
  assert.equal(caps({ uid: 'c', email: 'stranger@example.com' }, null, admins).canAdmin, false);
});

test('roleBadge: editor and viewer get a labelled badge with a capability blurb', () => {
  const ed = roleBadge(caps({ uid: 'e', email: 'friend@example.com' }, { role: 'editor' }));
  assert.equal(ed.label, 'Editor');
  assert.match(ed.blurb, /edit entries/);
  const vw = roleBadge(caps({ uid: 'v', email: 'reader@example.com' }, { role: 'viewer' }));
  assert.equal(vw.label, 'Viewer');
  assert.match(vw.blurb, /read-only/);
});

test('roleBadge: admin, no-access, and signed-out get no badge', () => {
  assert.equal(roleBadge(caps({ uid: 'a', email: ADMIN }, null)), null);       // admin: controls speak for themselves
  assert.equal(roleBadge(caps({ uid: 'n', email: 'nobody@example.com' }, null)), null); // no access → never sees workspace
  assert.equal(roleBadge(caps(null, null)), null);                              // signed out
  assert.equal(roleBadge(null), null);
});

test('isAdminEmail matches against a string or a list, case-insensitively', () => {
  assert.equal(isAdminEmail('a@b.com', 'a@b.com'), true);
  assert.equal(isAdminEmail('A@B.com', ['x@y.com', 'a@b.com']), true);
  assert.equal(isAdminEmail('c@d.com', ['a@b.com']), false);
  assert.equal(isAdminEmail('', ['a@b.com']), false);
  assert.equal(isAdminEmail('a@b.com', []), false);
});
