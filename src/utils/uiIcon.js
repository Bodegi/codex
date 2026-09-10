/**
 * Codex — design-kit UI icons.
 *
 * Standalone inline SVGs built from the kit's icon source of truth
 * (`design-kit/dist/icons/icon-data.js`: name → inner markup, 24×24, stroke-based). This keeps the
 * repo's inline-SVG convention — no external asset, no `<use>` sprite to inject and keep alive —
 * while sharing the kit's line-icon set and the `.ui-icon` utility (stroke: currentColor, sized by
 * `data-size`). Only the generic UI chrome rides this (carets, close, add, back, search, more…);
 * the author-managed domain glyphs/emblems keep their own registry.
 */

import { icons } from 'design-kit/dist/icons/icon-data.js';

/**
 * `name` — a kit icon id (see icon-data.js). `size` — a `.ui-icon` data-size (xs/sm/md/lg/xl);
 * omit for the 18px default. `cls` — extra classes. `label` — an accessible name; without it the
 * glyph is decorative (`aria-hidden`), which is right when it sits beside real text.
 */
export function icon(name, { size = '', cls = '', label = '' } = {}) {
  const inner = icons[name];
  if (!inner) return '';
  const attrs = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ui-icon${cls ? ` ${cls}` : ''}"${size ? ` data-size="${size}"` : ''} viewBox="0 0 24 24" ${attrs}>${inner}</svg>`;
}
