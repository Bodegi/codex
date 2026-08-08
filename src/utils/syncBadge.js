/**
 * Codex — sync-status badge model (pure).
 *
 * The header badge tells an author whether their edits are actually landing.
 * "Cloud vs local" isn't enough: a tab left open for hours can keep showing a
 * healthy "Cloud sync on" long after the live subscription dropped or the
 * author's access was revoked — editing against stale state with full
 * confidence (issue #1). This maps the two signals the app already tracks — run
 * mode + live-connection health — to the badge's label, dot, and tone, so
 * `main.js` just renders the result and the badge can't drift from the
 * connection banner (both read the same `connection` state). Connection only
 * matters in cloud mode; local-only has no live sync to lose.
 */

/**
 * @param {{ configured: boolean, connection?: 'healthy'|'lost'|'access-changed' }} state
 * @returns {{ label: string, dotClass: string, toneClass: string }}
 *   dotClass ∈ { 'idle-dot', 'pulse-dot', 'stale-dot' }; toneClass is the
 *   `.compliance-badge` modifier ('', ' is-local', ' is-stale').
 */
export function syncBadge({ configured, connection = 'healthy' }) {
  if (!configured) {
    return { label: 'Local only — changes reset on reload', dotClass: 'idle-dot', toneClass: ' is-local' };
  }
  switch (connection) {
    case 'access-changed':
      return { label: 'Access changed — reload to continue', dotClass: 'stale-dot', toneClass: ' is-stale' };
    case 'lost':
      return { label: 'Connection lost — showing last loaded', dotClass: 'stale-dot', toneClass: ' is-stale' };
    default:
      return { label: 'Cloud sync on', dotClass: 'pulse-dot', toneClass: '' };
  }
}
