/**
 * Codex — invite-access policy (pure). See docs/superpowers/specs/invite-access.md.
 *
 * The private-site gate: a signed-in Google account becomes a `users/{uid}` roster row ONLY if it
 * arrived via a live invite the admin issued. This module owns every decision; `main.js`/`firebase.js`
 * only act on the result and the DOM only renders `buildInviteRows`. SDK- and DOM-free → Node-tested.
 *
 * `isInviteRedeemable` is the pure MIRROR of the `inviteRedeemable()` predicate in firestore.rules
 * (active && not-expired). The rules are the actual gate; this mirror just lets the client pick the
 * right screen without a round-trip. If you change one, change both (spec §4).
 *
 * Time is passed as epoch millis (`nowMs`) so the module is deterministic; `expiresAt` is epoch
 * millis or null (no expiry), matching the stored shape (spec §3).
 */

const DAY_MS = 86400000;
const DEFAULT_TTL_DAYS = 7;

/**
 * Build a fresh invite doc. `ttlDays` defaults to 7 (spec §9); pass `null` for no expiry. `createdAt`
 * is an ISO string (human-facing); `expiresAt` is epoch millis (rule-comparable) or null.
 */
export function makeInvite({ token, label = null, createdBy, nowMs, ttlDays = DEFAULT_TTL_DAYS }) {
  return {
    token,
    label: label ?? null,
    status: 'active',
    createdBy,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: ttlDays == null ? null : nowMs + ttlDays * DAY_MS,
  };
}

/** Mirror of firestore.rules inviteRedeemable(): active AND (no expiry OR now strictly before it). */
export function isInviteRedeemable(invite, nowMs) {
  if (!invite || invite.status !== 'active') return false;
  return invite.expiresAt == null || nowMs < invite.expiresAt;
}

/**
 * Decide what the sign-in upsert should do. Returns one of:
 *   { action: 'refresh' }                        — returning user (doc exists); just bump lastSeenAt.
 *   { action: 'create' }                         — new admin (bypasses invites, no invitedVia).
 *   { action: 'create', invitedVia }             — new user with a redeemable invite.
 *   { action: 'blocked', reason: 'no-invite' }   — new user, no token in the link.
 *   { action: 'blocked', reason: 'invalid-invite' } — new user, token names a dead/missing invite.
 * A returning user always refreshes, even if a stale token rides in the URL.
 */
export function resolveSignInAction({ isAdmin = false, existingUserDoc, pendingToken, invite, nowMs }) {
  if (existingUserDoc) return { action: 'refresh' };
  if (isAdmin) return { action: 'create' };
  if (!pendingToken) return { action: 'blocked', reason: 'no-invite' };
  if (isInviteRedeemable(invite, nowMs)) return { action: 'create', invitedVia: pendingToken };
  return { action: 'blocked', reason: 'invalid-invite' };
}

/**
 * Admin invites panel rows: one per invite with its redeemers joined from the user roster (by
 * `invitedVia`), an `isExpired` flag, and `redeemedCount`. Sorted newest-first by createdAt. This is
 * the redemption "alert" surface — an invite with redeemers whose roster role is still 'none' is
 * someone awaiting a grant (see countPendingGrants for the badge count).
 */
export function buildInviteRows({ invites = [], users = [], nowMs } = {}) {
  const redeemersByToken = new Map();
  for (const u of users) {
    if (!u.invitedVia) continue;
    if (!redeemersByToken.has(u.invitedVia)) redeemersByToken.set(u.invitedVia, []);
    redeemersByToken.get(u.invitedVia).push({ uid: u.uid, email: u.email, displayName: u.displayName });
  }
  return invites
    .map((inv) => {
      const redeemers = redeemersByToken.get(inv.token) || [];
      return {
        token: inv.token,
        label: inv.label ?? null,
        status: inv.status,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt ?? null,
        isExpired: inv.expiresAt != null && nowMs >= inv.expiresAt,
        redeemers,
        redeemedCount: redeemers.length,
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** The pending-grants badge count: non-admin roster rows still at role 'none' (awaiting access). */
export function countPendingGrants(rosterRows = []) {
  return rosterRows.filter((r) => !r.isAdmin && r.role === 'none').length;
}
