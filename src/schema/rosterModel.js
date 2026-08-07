/**
 * Codex — Access roster join (pure).
 *
 * The Admin › Access panel shows one row per known user with their role for the *current* codex.
 * This is the join: users (from the global roster subscription) × permissions (for one codex) +
 * the baked admin-email check. Kept pure and Node-testable so `main.js` only feeds it state —
 * the DOM rendering (`renderAccessPanel`) reads these rows.
 *
 * `role` is 'none' when a user has no permission doc for the codex. `isAdmin` mirrors the
 * baked-email admin from `capabilities.js`/`firestore.rules` — an admin outranks any per-codex
 * role, so the panel badges them separately.
 */

import { isAdminEmail } from '../utils/capabilities.js';

/**
 * Join users with their permission for one codex.
 * @param {object} args
 * @param {Array<{uid,email,displayName,lastSeenAt}>} args.users - global user roster
 * @param {Array<{uid,codexId,role}>} args.perms - permission docs (any codex)
 * @param {string} args.codexId - the codex whose roles to surface
 * @param {string} args.adminEmail - baked admin email (appConfig.auth.adminEmail)
 * @returns {Array<{uid,email,displayName,lastSeenAt,role,isAdmin}>}
 */
export function buildRoster({ users = [], perms = [], codexId, adminEmail } = {}) {
  const roleByUid = new Map(
    perms.filter((p) => p.codexId === codexId).map((p) => [p.uid, p.role])
  );
  return users.map((u) => ({
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    lastSeenAt: u.lastSeenAt,
    role: roleByUid.get(u.uid) || 'none',
    isAdmin: isAdminEmail(u.email, adminEmail),
  }));
}
