/**
 * Discord OAuth2 & Access Control Manager for ATM10 Codex Studio
 */

export class DiscordAuth {
  constructor(clientId, redirectUri, allowedUserIds = []) {
    this.clientId = clientId;
    this.redirectUri = redirectUri || window.location.origin;
    this.allowedUserIds = allowedUserIds; // List of authorized Discord User IDs
    this.currentUser = JSON.parse(localStorage.getItem('atm10_discord_user') || 'null');
  }

  /**
   * Save configured allowed Discord IDs
   */
  setAllowedUserIds(ids) {
    this.allowedUserIds = ids.map(id => id.trim());
    localStorage.setItem('atm10_allowed_discord_ids', JSON.stringify(this.allowedUserIds));
  }

  getAllowedUserIds() {
    if (this.allowedUserIds.length === 0) {
      this.allowedUserIds = JSON.parse(localStorage.getItem('atm10_allowed_discord_ids') || '[]');
    }
    return this.allowedUserIds;
  }

  /**
   * Redirect user to Discord OAuth Authorization URL
   */
  login() {
    if (!this.clientId) {
      throw new Error('Discord Client ID is not configured. Click Discord Setup in header.');
    }

    const scope = encodeURIComponent('identify');
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=token&scope=${scope}`;
    window.location.href = authUrl;
  }

  /**
   * Handle OAuth2 callback token in URL hash (#access_token=...)
   */
  async handleCallback() {
    const hash = window.location.hash;
    if (!hash.includes('access_token=')) return null;

    const params = new URLSearchParams(hash.substring(1));
    const token = params.get('access_token');
    const tokenType = params.get('token_type') || 'Bearer';

    if (!token) return null;

    // Fetch user profile from Discord API
    try {
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: {
          'Authorization': `${tokenType} ${token}`
        }
      });

      if (!res.ok) throw new Error('Failed to fetch Discord user profile');
      const userData = await res.json();

      const userProfile = {
        id: userData.id,
        username: userData.username,
        globalName: userData.global_name || userData.username,
        avatar: userData.avatar 
          ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
          : 'https://cdn.discordapp.com/embed/avatars/0.png',
        loggedInAt: new Date().toISOString()
      };

      // Clear token from URL hash
      window.history.replaceState(null, null, window.location.pathname);

      // Check authorization against allowed user IDs
      const allowed = this.getAllowedUserIds();
      if (allowed.length > 0 && !allowed.includes(userProfile.id)) {
        userProfile.isAuthorized = false;
        userProfile.authError = `Discord ID (${userProfile.id}) is not on the private allowlist!`;
      } else {
        userProfile.isAuthorized = true;
      }

      this.currentUser = userProfile;
      localStorage.setItem('atm10_discord_user', JSON.stringify(userProfile));
      return userProfile;
    } catch (err) {
      console.error('Discord login error:', err);
      return null;
    }
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('atm10_discord_user');
  }

  isAuthenticated() {
    return this.currentUser !== null && this.currentUser.isAuthorized === true;
  }
}
