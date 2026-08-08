import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncBadge } from './syncBadge.js';

test('local-only ignores connection and shows the reset warning', () => {
  const badge = syncBadge({ configured: false, connection: 'lost' });
  assert.equal(badge.dotClass, 'idle-dot');
  assert.equal(badge.toneClass, ' is-local');
  assert.match(badge.label, /Local only/);
});

test('configured + healthy → pulsing "Cloud sync on", no tone modifier', () => {
  const badge = syncBadge({ configured: true, connection: 'healthy' });
  assert.equal(badge.label, 'Cloud sync on');
  assert.equal(badge.dotClass, 'pulse-dot');
  assert.equal(badge.toneClass, '');
});

test('connection defaults to healthy when omitted', () => {
  assert.deepEqual(syncBadge({ configured: true }), syncBadge({ configured: true, connection: 'healthy' }));
});

test('lost connection → stale dot + stale tone + last-loaded label', () => {
  const badge = syncBadge({ configured: true, connection: 'lost' });
  assert.equal(badge.dotClass, 'stale-dot');
  assert.equal(badge.toneClass, ' is-stale');
  assert.match(badge.label, /Connection lost/);
});

test('access-changed → stale tone + reload-to-continue label', () => {
  const badge = syncBadge({ configured: true, connection: 'access-changed' });
  assert.equal(badge.dotClass, 'stale-dot');
  assert.equal(badge.toneClass, ' is-stale');
  assert.match(badge.label, /reload to continue/i);
});
