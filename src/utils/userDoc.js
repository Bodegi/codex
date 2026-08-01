/**
 * ATM10 Codex — pure builder for the `users/{uid}` document.
 *
 * The sign-in upsert records a person in the global roster the admin grants access from. SDK-free so
 * it's Node-testable; the FirebaseManager upsert decides create-vs-merge and passes `isNew`.
 * `createdAt` is written once (on create); `lastSeenAt` on every sign-in.
 */

export function buildUserDoc(profile, timestamp, { isNew = false } = {}) {
  const doc = {
    uid: profile.uid,
    email: profile.email ?? null,
    displayName: profile.displayName ?? null,
    photoURL: profile.photoURL ?? null,
    lastSeenAt: timestamp,
  };
  if (isNew) doc.createdAt = timestamp;
  return doc;
}
