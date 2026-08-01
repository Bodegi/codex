import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toAuthProfile } from './authProfile.js';

const fbUser = { uid: 'u1', email: 'Friend@Example.com', displayName: 'Friend', photoURL: 'http://x/a.png' };

test('empty allowlist authorizes any signed-in account', () => {
  assert.equal(toAuthProfile(fbUser, []).isAuthorized, true);
  assert.equal(toAuthProfile(fbUser).isAuthorized, true);
});

test('allowlist matches email case-insensitively', () => {
  assert.equal(toAuthProfile(fbUser, ['friend@example.com']).isAuthorized, true);
  assert.equal(toAuthProfile(fbUser, ['  FRIEND@EXAMPLE.COM  ']).isAuthorized, true);
});

test('non-allowlisted account is denied with an error message', () => {
  const p = toAuthProfile(fbUser, ['someone@else.com']);
  assert.equal(p.isAuthorized, false);
  assert.match(p.authError, /not on the private allowlist/);
});

test('maps profile fields, falling back to a default avatar', () => {
  const p = toAuthProfile({ uid: 'u2', email: 'a@b.com' }, []);
  assert.equal(p.uid, 'u2');
  assert.equal(p.username, 'a@b.com'); // no displayName → email
  assert.match(p.avatar, /gravatar/); // no photoURL → default
});
