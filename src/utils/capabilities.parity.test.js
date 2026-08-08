/**
 * Parity guard: firestore.rules ↔ capabilities.js.
 *
 * `capabilities.test.js` proves the JS mirror behaves correctly in isolation, but nothing catches
 * the two SOURCES drifting apart. These tests read `firestore.rules` as text and assert the shared,
 * machine-checkable facts still line up:
 *   1. the admin-email allowlist matches `appConfig.auth.adminEmail` (the highest-risk drift — it
 *      grants or revokes god-mode);
 *   2. every role literal the rules gate on is one `resolveCapabilities` recognizes (so a role added
 *      to the rules can't silently fall through the mirror).
 *
 * A full semantic diff across two languages isn't possible; this is the proportionate tripwire. If
 * one fails, update BOTH files together (per CLAUDE.md's rules ↔ capabilities invariant).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appConfig } from '../config/appConfig.js';
import { resolveCapabilities } from './capabilities.js';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

/** The admin-email allowlist from isAdmin(): `request.auth.token.email in [ '…', '…' ]`. */
function adminEmailsFromRules(src) {
  const list = src.match(/request\.auth\.token\.email\s+in\s+\[([^\]]*)\]/);
  assert.ok(list, 'firestore.rules isAdmin() should compare email against a literal list');
  return [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Every role string the rules compare against: `…role == 'X'`. */
function roleLiteralsFromRules(src) {
  return [...src.matchAll(/\.role\s*==\s*'([^']+)'/g)].map((m) => m[1]);
}

test('admin-email allowlist matches between firestore.rules and appConfig', () => {
  const fromRules = adminEmailsFromRules(rules).map((e) => e.toLowerCase()).sort();
  const baked = [].concat(appConfig.auth.adminEmail).map((e) => e.toLowerCase()).sort();
  assert.deepEqual(
    fromRules,
    baked,
    'firestore.rules isAdmin() emails must mirror appConfig.auth.adminEmail — update BOTH together'
  );
});

test('every role the rules gate on is one capabilities.js recognizes', () => {
  const roles = new Set(roleLiteralsFromRules(rules));
  assert.ok(roles.size > 0, 'expected at least one `role == \'…\'` literal in firestore.rules');
  for (const role of roles) {
    const caps = resolveCapabilities({ user: { email: 'u@example.com' }, permission: { role }, adminEmail: [] });
    assert.notEqual(
      caps.role,
      'none',
      `firestore.rules gates on role '${role}' but capabilities.js falls through to 'none' — mirror it`
    );
  }
});
