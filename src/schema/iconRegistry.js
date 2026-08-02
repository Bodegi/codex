/**
 * Codex — Icon registry.
 *
 * Replaces hardcoded emoji with data-driven, per-type icons. An icon is just inline
 * SVG markup (text), so icons live as data: a type declares an `icon` key and the nav
 * looks it up here. `fill="currentColor"` lets CSS drive colour; sizing is CSS too — no
 * icon library, pure markup.
 *
 * `bundledIcons` is the always-present baseline (works with no Firebase). A future,
 * app-global Firestore `icons` collection is concatenated onto it via `mergeIcons`
 * (extra wins per key; the bundled baseline is never removed) — that side is not built
 * yet, but the merge is here so it is unit-testable and ready.
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
 * Resolve an icon key to its SVG markup against a registry (bundled by default).
 * Unknown/empty keys fall back to the default glyph — never a broken icon.
 */
export function getIcon(key, registry = bundledIcons) {
  if (!key) return DEFAULT_ICON;
  const entry = registry.find((e) => e.key === key);
  return entry ? entry.svg : DEFAULT_ICON;
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
