/**
 * Pure mapping from a Firebase Auth user to the app's *identity* profile. SDK-free so it stays
 * Node-testable. Authorization (admin / editor / viewer / none) is a separate concern resolved by
 * capabilities.js against the baked admin email + the user's per-codex permission doc.
 */

const DEFAULT_AVATAR = 'https://www.gravatar.com/avatar/?d=mp';

export function toAuthProfile(fbUser) {
  const name = fbUser.displayName || fbUser.email || 'Signed-in user';

  return {
    uid: fbUser.uid,
    email: fbUser.email || null,
    username: name,
    globalName: name,
    avatar: fbUser.photoURL || DEFAULT_AVATAR,
  };
}
