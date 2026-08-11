/**
 * Codex — pure access-capability resolution.
 *
 * The one safety-critical fact (who can do what) expressed for the app UI. Pure and SDK-free
 * (parallels authProfile.js) so it's Node-testable, and it mirrors the Firestore security rules
 * predicate-for-predicate: admin by baked email, else the current codex's permission role.
 *
 * `capabilities.parity.test.js` guards the mirror against drift: it reads firestore.rules and asserts
 * the admin-email allowlist and role vocabulary stay in lockstep with this file + appConfig. Change
 * one side and the test fails — update BOTH the rules and this module together.
 *
 * Inputs:
 *   user        the signed-in identity ({ uid, email, … }) or null
 *   permission  the user's permission doc for the CURRENT codex ({ role } ) or null
 *   adminEmail  the baked super-admin email, or a list of them (mirrors the rules literal(s))
 */

const NONE = Object.freeze({ role: 'none', canRead: false, canEdit: false, canAdmin: false });

/** Whether `email` is one of the baked super-admins. `adminEmail` may be a string or a list. */
export function isAdminEmail(email, adminEmail) {
  const target = String(email || '').toLowerCase();
  if (!target) return false;
  const list = Array.isArray(adminEmail) ? adminEmail : [adminEmail];
  return list.some((a) => String(a || '').toLowerCase() === target);
}

export function resolveCapabilities({ user, permission, adminEmail } = {}) {
  if (!user) return { isAuthed: false, ...NONE };

  if (isAdminEmail(user.email, adminEmail)) {
    return { isAuthed: true, role: 'admin', canRead: true, canEdit: true, canAdmin: true };
  }

  const role = permission && permission.role;
  if (role === 'editor') return { isAuthed: true, role: 'editor', canRead: true, canEdit: true, canAdmin: false };
  if (role === 'viewer') return { isAuthed: true, role: 'viewer', canRead: true, canEdit: false, canAdmin: false };

  return { isAuthed: true, ...NONE };
}

/**
 * A user-facing role signal for the workspace chrome (#22): the role you hold on the current
 * codex plus a one-line summary of what it lets you do. Returns null for admin (the management
 * controls already announce their reach) and for no-access (they never reach the workspace), so
 * only editors/viewers — who otherwise infer their role from the *absence* of controls — get a
 * badge. Pure so the copy is Node-tested; the DOM caller just paints what this returns.
 */
export function roleBadge(caps) {
  if (!caps || !caps.isAuthed) return null;
  if (caps.role === 'editor') {
    return { role: 'editor', label: 'Editor', blurb: 'You can add and edit entries in this codex.' };
  }
  if (caps.role === 'viewer') {
    return { role: 'viewer', label: 'Viewer', blurb: 'You have read-only access to this codex.' };
  }
  return null;
}
