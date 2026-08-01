/**
 * Pure mapping from a Firebase Auth user to the app's user profile + allowlist decision.
 * Kept free of the Firebase SDK so it stays Node-testable.
 *
 * The allowlist gates the UI by email (empty = any signed-in Google account is authorized). Durable
 * per-user / per-codex enforcement belongs in Firestore rules + the users collection — see HANDOFF.md.
 */

const DEFAULT_AVATAR = 'https://www.gravatar.com/avatar/?d=mp';

export function toAuthProfile(fbUser, allowlist = []) {
  const email = (fbUser.email || '').toLowerCase();
  const list = allowlist.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  const isAuthorized = list.length === 0 || list.includes(email);
  const name = fbUser.displayName || fbUser.email || 'Signed-in user';

  return {
    uid: fbUser.uid,
    email: fbUser.email || null,
    username: name,
    globalName: name,
    avatar: fbUser.photoURL || DEFAULT_AVATAR,
    isAuthorized,
    authError: isAuthorized ? null : `${fbUser.email || 'This account'} is not on the private allowlist.`,
  };
}
