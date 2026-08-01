import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toAuthProfile } from './authProfile.js';

const fbUser = { uid: 'u1', email: 'Friend@Example.com', displayName: 'Friend', photoURL: 'http://x/a.png' };

test('maps the Firebase user to an identity profile', () => {
  const p = toAuthProfile(fbUser);
  assert.equal(p.uid, 'u1');
  assert.equal(p.email, 'Friend@Example.com');
  assert.equal(p.username, 'Friend');
  assert.equal(p.globalName, 'Friend');
  assert.equal(p.avatar, 'http://x/a.png');
});

test('falls back: no displayName → email as name; no photoURL → default avatar', () => {
  const p = toAuthProfile({ uid: 'u2', email: 'a@b.com' });
  assert.equal(p.username, 'a@b.com');
  assert.match(p.avatar, /gravatar/);
});

test('carries no authorization decision — that lives in capabilities', () => {
  const p = toAuthProfile(fbUser);
  assert.equal('isAuthorized' in p, false);
  assert.equal('authError' in p, false);
});
