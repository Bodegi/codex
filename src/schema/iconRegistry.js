/**
 * Codex — Icon registry.
 *
 * Replaces hardcoded emoji with data-driven, per-type icons. An icon is just inline
 * SVG markup (text), so icons live as data: a type declares an `icon` key and the nav
 * looks it up here. `fill="currentColor"` lets CSS drive colour; sizing is CSS too — no
 * icon library, pure markup.
 *
 * `bundledIcons` is the always-present baseline (works with no Firebase). The
 * app-global Firestore `icons` collection is concatenated onto it via `mergeIcons`
 * (extra wins per key; the bundled baseline is never removed). The app installs that
 * overlay through `setOverlayIcons` when the `icons` subscription fires; `getIcon`
 * renders against the merged result by default, so callers pass no registry.
 */

const svg = (body) =>
  `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" fill="currentColor">${body}</svg>`;

/** Key of the generic fallback icon, used when a type declares no/unknown icon. */
export const DEFAULT_ICON_KEY = 'dot';

/** The generic fallback glyph. */
export const DEFAULT_ICON = svg('<circle cx="12" cy="12" r="5"/>');

/**
 * Baseline icon set. `[{ key, svg }]` (an array so a Firestore set can be concatenated
 * onto it). Keys are unique; the seed types each have an entry so nav is never bare.
 */
export const bundledIcons = [
  { key: DEFAULT_ICON_KEY, svg: DEFAULT_ICON },
  { key: 'civilization', svg: svg('<path d="M3 21V8l3-2v3l3-2v3l3-2v3l3-2v3l3-2v13H3zm4 0h3v-5H7v5z"/>') },
  { key: 'mod', svg: svg('<path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.5 4.9l1.8 1.4-1.8 3.1-2.2-.9a6.9 6.9 0 01-1.6.9l-.3 2.3h-3.6l-.3-2.3a6.9 6.9 0 01-1.6-.9l-2.2.9-1.8-3.1 1.8-1.4a7 7 0 010-1.8L3.4 9.7l1.8-3.1 2.2.9a6.9 6.9 0 011.6-.9l.3-2.3h3.6l.3 2.3a6.9 6.9 0 011.6.9l2.2-.9 1.8 3.1-1.8 1.4a7 7 0 010 1.8z"/>') },
  { key: 'region', svg: svg('<path d="M3 20h18L14 6l-4 7-2-3-5 10z"/>') },
  { key: 'decision', svg: svg('<path d="M6 2h9l3 3v17H6V2zm2 6h8V6h-8v2zm0 4h8v-2H8v2zm0 4h5v-2H8v2z"/>') },
  { key: 'admin', svg: svg('<path d="M12 2l8 3v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V5l8-3zm0 5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm-4 9c0-2 2-3 4-3s4 1 4 3v.5H8V16z"/>') },
];

/**
 * The live registry the app renders against: the bundled baseline plus any installed
 * Firestore overlay. Starts as the bundled set (so icons work with no Firebase);
 * `setOverlayIcons` swaps in the merged set when the icons subscription fires.
 */
let activeRegistry = bundledIcons;

/**
 * Install the Firestore icon overlay: rebuild the active registry as
 * `mergeIcons(bundledIcons, extra)`. `extra` is the active (non-archived) icon
 * records as `[{ key, svg }]`. Always rebuilt from the bundled baseline, so it is
 * idempotent and passing `[]` restores the bundled-only set. Returns the new registry.
 */
export function setOverlayIcons(extra) {
  activeRegistry = mergeIcons(bundledIcons, extra);
  return activeRegistry;
}

/** The registry the app currently renders against (bundled + overlay). */
export function activeIcons() {
  return activeRegistry;
}

/**
 * Resolve an icon key to its SVG markup against a registry (the active bundled+overlay
 * registry by default). Unknown/empty keys fall back to the default glyph — never a
 * broken icon. The default is read at call time, so it reflects the latest overlay.
 */
export function getIcon(key, registry = activeRegistry) {
  if (!key) return DEFAULT_ICON;
  const entry = registry.find((e) => e.key === key);
  return entry ? entry.svg : DEFAULT_ICON;
}

/**
 * Strict lookup: an icon key → its SVG markup, or `null` when the key is unknown or empty.
 * Unlike `getIcon`, this never substitutes the default glyph — the `null` is load-bearing for the
 * map component's glyph fallback chain (`resolveMarkerGlyph`, map-component spec §5.2), which must
 * fall through to a palette dot when a marker's glyph doesn't resolve. Same active bundled+overlay
 * registry by default.
 */
export function findIcon(key, registry = activeRegistry) {
  if (!key) return null;
  const entry = registry.find((e) => e.key === key);
  return entry ? entry.svg : null;
}

/**
 * Concatenate `extra` icons onto `bundled`: keys stay unique, `extra` wins on a
 * collision (keeping the bundled slot's position), and extra-only keys are appended.
 * The bundled baseline is never dropped.
 */
export function mergeIcons(bundled, extra) {
  const map = new Map();
  for (const e of bundled || []) map.set(e.key, e);
  for (const e of extra || []) map.set(e.key, e);
  return [...map.values()];
}

/** A valid icon key: lowercase letters/digits in hyphen-separated words (matches type-key slugs). */
export const ICON_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Max icon-key length, mirrored by the create input's maxlength. Keys are short slugs. */
export const ICON_KEY_MAX_LENGTH = 32;

/**
 * Validate a candidate icon for the admin form. Returns a list of human-readable
 * problems ([] when valid). Pure — no DOM, so it is unit-testable and the same gate
 * can guard both the form and (belt-and-suspenders) a write. `existingKeys` flags a
 * duplicate on create; pass the key being edited's own key out of it (or omit) so an
 * edit-in-place is not rejected as a duplicate of itself.
 */
export function validateIcon({ key, svg } = {}, existingKeys = []) {
  const problems = [];
  const k = String(key ?? '').trim();
  if (!k) problems.push('Key is required.');
  else if (!ICON_KEY_PATTERN.test(k)) problems.push('Key must be lowercase letters, digits, and hyphens.');
  else if (k.length > ICON_KEY_MAX_LENGTH) problems.push(`Key must be ${ICON_KEY_MAX_LENGTH} characters or fewer.`);
  else if (existingKeys.includes(k)) problems.push(`An icon "${k}" already exists.`);
  const s = String(svg ?? '').trim();
  if (!s) problems.push('SVG markup is required.');
  else if (!/<svg[\s>]/i.test(s)) problems.push('SVG must contain an <svg> element.');
  return problems;
}
