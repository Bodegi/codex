/**
 * Private Auth Gateway — the not-signed-in login wall.
 *
 * Shown only when there is no authenticated session. A signed-in user without a role goes to the
 * awaiting-access screen instead (see awaitingAccess.js), so this screen never needs an
 * "access denied" branch.
 */

export function renderAuthGateway() {
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:80vh; text-align:center; padding:24px;">
      <div style="font-size:64px; margin-bottom:16px;">🔒</div>
      <h1 style="font-family:var(--font-heading); color:var(--accent-gold); font-size:28px; margin-bottom:8px;">
        Private World Codex
      </h1>
      <p style="font-size:14px; color:var(--text-muted); max-width:480px; margin-bottom:24px;">
        This ATM10 world design codex is a private workspace. Please sign in with Google to view lore,
        maps, and manage world data.
      </p>

      <button id="gateway-login-btn" class="btn btn-primary" style="font-size:15px; padding:12px 28px; background:linear-gradient(135deg, #4285F4, #1a73e8); color:#fff; box-shadow:0 4px 20px rgba(66,133,244,0.4);">
        <span style="font-size:18px;">🔑</span> Sign In with Google
      </button>

      <div style="margin-top:32px; font-size:11px; color:var(--text-dim);">
        Protected by Firebase Authentication & Firestore Security Rules
      </div>
    </div>
  `;
}
