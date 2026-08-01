/**
 * Awaiting-Access Screen.
 *
 * Shown to a person who is authenticated but has no role on the current codex (and isn't the
 * super-admin). They already exist in `users/{uid}` (from the sign-in upsert), so the admin can see
 * them in the roster and grant access — this screen just explains the limbo and offers sign-out.
 */

export function renderAwaitingAccess(currentUser) {
  const who = currentUser?.email || currentUser?.globalName || 'your account';

  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:80vh; text-align:center; padding:24px;">
      <div style="font-size:64px; margin-bottom:16px;">⏳</div>
      <h1 style="font-family:var(--font-heading); color:var(--accent-gold); font-size:28px; margin-bottom:8px;">
        Awaiting Access
      </h1>
      <p style="font-size:14px; color:var(--text-muted); max-width:480px; margin-bottom:24px;">
        You're signed in as <strong>${who}</strong>, but haven't been granted access to this codex yet.
        Ask the admin to grant your account a role — you'll appear in their roster automatically.
      </p>

      <button id="awaiting-logout-btn" class="btn btn-secondary btn-sm">
        Sign Out
      </button>

      <div style="margin-top:32px; font-size:11px; color:var(--text-dim);">
        Protected by Firebase Authentication & Firestore Security Rules
      </div>
    </div>
  `;
}
