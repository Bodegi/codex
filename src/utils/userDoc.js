/**
 * Codex — pure builder for the `users/{uid}` document.
 *
 * The sign-in upsert records a person in the global roster the admin grants access from. SDK-free so
 * it's Node-testable; the FirebaseManager upsert decides create-vs-merge and passes `isNew`.
 * `createdAt` is written once (on create); `lastSeenAt` on every sign-in.
 *
 * `invitedVia` is write-once provenance: the invite token this row was created against (invite-access
 * spec §3). It is stamped ONLY on create (`isNew`) and only when supplied — never on the lastSeenAt
 * refresh, so a returning user's merge can't forge or rewrite it, and the admin path (no token) omits
 * it. The `users` create rule requires it to name a live invite; keep the two in sync.
 */

export function buildUserDoc(profile, timestamp, { isNew = false, invitedVia } = {}) {
  const doc = {
    uid: profile.uid,
    email: profile.email ?? null,
    displayName: profile.displayName ?? null,
    photoURL: profile.photoURL ?? null,
    lastSeenAt: timestamp,
  };
  if (isNew) {
    doc.createdAt = timestamp;
    if (invitedVia) doc.invitedVia = invitedVia;
  }
  return doc;
}
