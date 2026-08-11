/**
 * Codex — invite-link helpers (pure).
 *
 * An invite is a link the admin drops in Discord: `https://…/?invite=<token>`. These two pure
 * helpers are the only place the `invite` query-param name lives — `main.js` reads the token at
 * boot (before/through the Google sign-in popup) and the admin panel builds the link to copy.
 * SDK- and DOM-free (uses the URLSearchParams built-in), so Node-testable.
 */

/**
 * Extract the invite token from a query string. Accepts a full search (`?invite=…`) or a bare
 * `invite=…`. A missing or blank token reads as null (not an empty string) so callers can branch
 * on presence directly.
 * @param {string} search - location.search, or any query string
 * @returns {string|null}
 */
export function parseInviteToken(search) {
  if (!search) return null;
  const token = new URLSearchParams(search).get('invite');
  return token ? token : null;
}

/**
 * Compose the shareable invite URL for a token. `base` is the app's public root — origin plus any
 * deploy sub-path (e.g. `https://host/codex/` under Vite's `base`), not the bare origin, or the
 * link lands off the app and 404s. A trailing slash on `base` is normalized away.
 */
export function buildInviteUrl(base, token) {
  return `${String(base).replace(/\/+$/, '')}/?invite=${encodeURIComponent(token)}`;
}
