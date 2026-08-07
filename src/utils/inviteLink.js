/**
 * Codex — invite-link helpers (pure).
 *
 * An invite is a link the admin drops in Discord: `https://…/?invite=<token>`. These two pure
 * helpers are the only place the `invite` query-param name lives — `main.js` reads the token at
 * boot (before/through the Google sign-in popup) and the admin panel builds the link to copy.
 * SDK- and DOM-free (uses the URLSearchParams built-in), so Node-testable. See invite-access spec.
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

/** Compose the shareable invite URL for a token. Trailing slash on origin is normalized away. */
export function buildInviteUrl(origin, token) {
  return `${String(origin).replace(/\/+$/, '')}/?invite=${encodeURIComponent(token)}`;
}
