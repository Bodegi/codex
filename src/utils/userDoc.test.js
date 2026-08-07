import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildUserDoc } from './userDoc.js';

const profile = { uid: 'u1', email: 'a@b.com', displayName: 'Ana', photoURL: 'http://x/a.png' };
const TS = '2026-08-01T00:00:00.000Z';

test('maps an identity profile to the stored user fields with lastSeenAt', () => {
  const doc = buildUserDoc(profile, TS);
  assert.equal(doc.uid, 'u1');
  assert.equal(doc.email, 'a@b.com');
  assert.equal(doc.displayName, 'Ana');
  assert.equal(doc.photoURL, 'http://x/a.png');
  assert.equal(doc.lastSeenAt, TS);
});

test('createdAt is set only on first write (isNew)', () => {
  assert.equal(buildUserDoc(profile, TS, { isNew: true }).createdAt, TS);
  assert.equal('createdAt' in buildUserDoc(profile, TS), false);
});

test('missing optional fields fall back to null, not undefined', () => {
  const doc = buildUserDoc({ uid: 'u2' }, TS);
  assert.equal(doc.email, null);
  assert.equal(doc.displayName, null);
  assert.equal(doc.photoURL, null);
});

test('invitedVia is stamped only on create, alongside createdAt', () => {
  const doc = buildUserDoc(profile, TS, { isNew: true, invitedVia: 'tok1' });
  assert.equal(doc.invitedVia, 'tok1');
  assert.equal(doc.createdAt, TS);
});

test('invitedVia is never written on the lastSeenAt refresh (update)', () => {
  // A returning user's merge must not carry invitedVia — it is write-once provenance.
  const doc = buildUserDoc(profile, TS, { invitedVia: 'tok1' });
  assert.equal('invitedVia' in doc, false);
});

test('invitedVia is omitted on create when not supplied (admin path)', () => {
  const doc = buildUserDoc(profile, TS, { isNew: true });
  assert.equal('invitedVia' in doc, false);
});
