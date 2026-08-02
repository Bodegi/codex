/**
 * Codex — pure access-capability resolution.
 *
 * The one safety-critical fact (who can do what) expressed for the app UI. Pure and SDK-free
 * (parallels authProfile.js) so it's Node-testable, and it mirrors the Firestore security rules
 * predicate-for-predicate: admin by baked email, else the current codex's permission role.
 *
 * Inputs:
 *   user        the signed-in identity ({ uid, email, … }) or null
 *   permission  the user's permission doc for the CURRENT codex ({ role } ) or null
 *   adminEmail  the baked super-admin email (mirrors the rules literal)
 */

const NONE = Object.freeze({ role: 'none', canRead: false, canEdit: false, canAdmin: false });

export function resolveCapabilities({ user, permission, adminEmail } = {}) {
  if (!user) return { isAuthed: false, ...NONE };

  const email = String(user.email || '').toLowerCase();
  const admin = String(adminEmail || '').toLowerCase();
  if (admin && email === admin) {
    return { isAuthed: true, role: 'admin', canRead: true, canEdit: true, canAdmin: true };
  }

  const role = permission && permission.role;
  if (role === 'editor') return { isAuthed: true, role: 'editor', canRead: true, canEdit: true, canAdmin: false };
  if (role === 'viewer') return { isAuthed: true, role: 'viewer', canRead: true, canEdit: false, canAdmin: false };

  return { isAuthed: true, ...NONE };
}
