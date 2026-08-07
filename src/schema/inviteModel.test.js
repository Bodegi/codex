import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeInvite,
  isInviteRedeemable,
  resolveSignInAction,
  buildInviteRows,
  countPendingGrants,
} from './inviteModel.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 7, 7); // 2026-08-07T00:00:00.000Z

// ── makeInvite ────────────────────────────────────────────────────────────────
test('makeInvite builds an active invite with ISO createdAt and a 7-day default expiry', () => {
  const inv = makeInvite({ token: 'tok1', label: 'Discord', createdBy: 'admin@x.com', nowMs: NOW });
  assert.deepEqual(inv, {
    token: 'tok1',
    label: 'Discord',
    status: 'active',
    createdBy: 'admin@x.com',
    createdAt: new Date(NOW).toISOString(),
    expiresAt: NOW + 7 * DAY,
  });
});

test('makeInvite honors an explicit ttlDays', () => {
  assert.equal(makeInvite({ token: 't', createdBy: 'a', nowMs: NOW, ttlDays: 1 }).expiresAt, NOW + DAY);
});

test('makeInvite with ttlDays null means no expiry', () => {
  assert.equal(makeInvite({ token: 't', createdBy: 'a', nowMs: NOW, ttlDays: null }).expiresAt, null);
});

test('makeInvite defaults label to null', () => {
  assert.equal(makeInvite({ token: 't', createdBy: 'a', nowMs: NOW }).label, null);
});

// ── isInviteRedeemable ──────────────────────────────────────────────────────────
test('isInviteRedeemable: active + unexpired is redeemable', () => {
  assert.equal(isInviteRedeemable({ status: 'active', expiresAt: NOW + DAY }, NOW), true);
});

test('isInviteRedeemable: active with no expiry is redeemable', () => {
  assert.equal(isInviteRedeemable({ status: 'active', expiresAt: null }, NOW), true);
});

test('isInviteRedeemable: revoked is not redeemable even if unexpired', () => {
  assert.equal(isInviteRedeemable({ status: 'revoked', expiresAt: NOW + DAY }, NOW), false);
});

test('isInviteRedeemable: expired is not redeemable (now == expiresAt counts as expired)', () => {
  assert.equal(isInviteRedeemable({ status: 'active', expiresAt: NOW - 1 }, NOW), false);
  assert.equal(isInviteRedeemable({ status: 'active', expiresAt: NOW }, NOW), false);
});

test('isInviteRedeemable: null/absent invite is not redeemable', () => {
  assert.equal(isInviteRedeemable(null, NOW), false);
  assert.equal(isInviteRedeemable(undefined, NOW), false);
});

// ── resolveSignInAction ─────────────────────────────────────────────────────────
const REDEEMABLE = { token: 'tok1', status: 'active', expiresAt: NOW + DAY };

test('resolveSignInAction: existing user doc → refresh (returning user)', () => {
  assert.deepEqual(
    resolveSignInAction({ existingUserDoc: { uid: 'u1' }, pendingToken: null, invite: null, nowMs: NOW }),
    { action: 'refresh' }
  );
});

test('resolveSignInAction: returning user refreshes even with a stale token in the URL', () => {
  assert.deepEqual(
    resolveSignInAction({ existingUserDoc: { uid: 'u1' }, pendingToken: 'tok1', invite: REDEEMABLE, nowMs: NOW }),
    { action: 'refresh' }
  );
});

test('resolveSignInAction: new admin → create with no invitedVia (bypasses invites)', () => {
  assert.deepEqual(
    resolveSignInAction({ isAdmin: true, existingUserDoc: null, pendingToken: null, invite: null, nowMs: NOW }),
    { action: 'create' }
  );
});

test('resolveSignInAction: new user + redeemable invite → create with invitedVia', () => {
  assert.deepEqual(
    resolveSignInAction({ existingUserDoc: null, pendingToken: 'tok1', invite: REDEEMABLE, nowMs: NOW }),
    { action: 'create', invitedVia: 'tok1' }
  );
});

test('resolveSignInAction: new user, no token → blocked (no-invite)', () => {
  assert.deepEqual(
    resolveSignInAction({ existingUserDoc: null, pendingToken: null, invite: null, nowMs: NOW }),
    { action: 'blocked', reason: 'no-invite' }
  );
});

test('resolveSignInAction: new user, revoked invite → blocked (invalid-invite)', () => {
  assert.deepEqual(
    resolveSignInAction({
      existingUserDoc: null,
      pendingToken: 'tok1',
      invite: { token: 'tok1', status: 'revoked', expiresAt: NOW + DAY },
      nowMs: NOW,
    }),
    { action: 'blocked', reason: 'invalid-invite' }
  );
});

test('resolveSignInAction: new user, expired invite → blocked (invalid-invite)', () => {
  assert.deepEqual(
    resolveSignInAction({
      existingUserDoc: null,
      pendingToken: 'tok1',
      invite: { token: 'tok1', status: 'active', expiresAt: NOW - 1 },
      nowMs: NOW,
    }),
    { action: 'blocked', reason: 'invalid-invite' }
  );
});

test('resolveSignInAction: new user, token present but invite doc missing → blocked (invalid-invite)', () => {
  assert.deepEqual(
    resolveSignInAction({ existingUserDoc: null, pendingToken: 'tokX', invite: null, nowMs: NOW }),
    { action: 'blocked', reason: 'invalid-invite' }
  );
});

// ── buildInviteRows ─────────────────────────────────────────────────────────────
const USERS = [
  { uid: 'u1', email: 'a@x.com', displayName: 'Ann', invitedVia: 'tok1' },
  { uid: 'u2', email: 'b@x.com', displayName: 'Bo', invitedVia: 'tok1' },
  { uid: 'u3', email: 'c@x.com', displayName: 'Cy', invitedVia: 'tok2' },
  { uid: 'u4', email: 'd@x.com', displayName: 'Di' }, // no invitedVia (legacy/admin)
];

test('buildInviteRows joins redeemers by invitedVia and counts them', () => {
  const invites = [
    { token: 'tok1', label: 'Discord', status: 'active', createdAt: '2026-08-01T00:00:00.000Z', expiresAt: NOW + DAY },
    { token: 'tok2', label: 'Twitter', status: 'active', createdAt: '2026-08-02T00:00:00.000Z', expiresAt: NOW + DAY },
    { token: 'tok3', label: 'Unused', status: 'active', createdAt: '2026-08-03T00:00:00.000Z', expiresAt: NOW + DAY },
  ];
  const rows = buildInviteRows({ invites, users: USERS, nowMs: NOW });
  const byToken = Object.fromEntries(rows.map((r) => [r.token, r]));
  assert.equal(byToken.tok1.redeemedCount, 2);
  assert.deepEqual(byToken.tok1.redeemers.map((r) => r.uid), ['u1', 'u2']);
  assert.deepEqual(byToken.tok1.redeemers[0], { uid: 'u1', email: 'a@x.com', displayName: 'Ann' });
  assert.equal(byToken.tok2.redeemedCount, 1);
  assert.equal(byToken.tok3.redeemedCount, 0);
  assert.deepEqual(byToken.tok3.redeemers, []);
});

test('buildInviteRows sorts newest-first by createdAt', () => {
  const invites = [
    { token: 'old', status: 'active', createdAt: '2026-08-01T00:00:00.000Z', expiresAt: null },
    { token: 'new', status: 'active', createdAt: '2026-08-05T00:00:00.000Z', expiresAt: null },
    { token: 'mid', status: 'active', createdAt: '2026-08-03T00:00:00.000Z', expiresAt: null },
  ];
  const rows = buildInviteRows({ invites, users: [], nowMs: NOW });
  assert.deepEqual(rows.map((r) => r.token), ['new', 'mid', 'old']);
});

test('buildInviteRows derives isExpired from expiresAt vs now', () => {
  const invites = [
    { token: 'live', status: 'active', createdAt: '2026-08-01T00:00:00.000Z', expiresAt: NOW + DAY },
    { token: 'dead', status: 'active', createdAt: '2026-08-01T00:00:00.000Z', expiresAt: NOW - DAY },
    { token: 'forever', status: 'active', createdAt: '2026-08-01T00:00:00.000Z', expiresAt: null },
  ];
  const byToken = Object.fromEntries(buildInviteRows({ invites, users: [], nowMs: NOW }).map((r) => [r.token, r]));
  assert.equal(byToken.live.isExpired, false);
  assert.equal(byToken.dead.isExpired, true);
  assert.equal(byToken.forever.isExpired, false);
});

// ── countPendingGrants ──────────────────────────────────────────────────────────
test('countPendingGrants counts non-admin roster rows with role "none"', () => {
  const rows = [
    { role: 'none', isAdmin: false },
    { role: 'none', isAdmin: false },
    { role: 'viewer', isAdmin: false },
    { role: 'none', isAdmin: true }, // admin awaiting nothing — excluded
  ];
  assert.equal(countPendingGrants(rows), 2);
});

test('countPendingGrants is 0 for an empty roster', () => {
  assert.equal(countPendingGrants([]), 0);
});
