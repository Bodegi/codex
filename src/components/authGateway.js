/**
 * Private Auth Gateway & Locked Access Screen Component
 */

export function renderAuthGateway(discordAuth, onLoginClick) {
  const currentUser = discordAuth.currentUser;
  const isUnauthorized = currentUser && !currentUser.isAuthorized;

  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:80vh; text-align:center; padding:24px;">
      <div style="font-size:64px; margin-bottom:16px;">🔒</div>
      <h1 style="font-family:var(--font-heading); color:var(--accent-gold); font-size:28px; margin-bottom:8px;">
        Private World Codex
      </h1>
      <p style="font-size:14px; color:var(--text-muted); max-width:480px; margin-bottom:24px;">
        ${isUnauthorized 
          ? `<strong style="color:var(--accent-crimson);">Access Denied:</strong> Your Discord account (${currentUser.globalName}) is not on the private project allowlist.`
          : 'This ATM10 world design codex is a private workspace. Please sign in with Discord to view lore, maps, and manage world data.'}
      </p>

      <div style="display:flex; flex-direction:column; gap:12px; align-items:center;">
        <button id="gateway-login-btn" class="btn btn-primary" style="font-size:15px; padding:12px 28px; background:linear-gradient(135deg, #5865F2, #4752C4); color:#fff; box-shadow:0 4px 20px rgba(88,101,242,0.4);">
          <span style="font-size:18px;">💬</span> Sign In with Discord
        </button>

        ${currentUser ? `
          <button id="gateway-logout-btn" class="btn btn-secondary btn-sm" style="margin-top:8px;">
            Sign Out (${currentUser.globalName})
          </button>
        ` : ''}
      </div>

      <div style="margin-top:32px; font-size:11px; color:var(--text-dim);">
        Protected by Firebase Firestore Security Rules & Discord OAuth2
      </div>
    </div>
  `;
}
