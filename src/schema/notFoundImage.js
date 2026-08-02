/**
 * Codex — Not-found image placeholder.
 *
 * One bundled, data-driven inline SVG (icon-registry ethos: markup-as-data,
 * `fill="currentColor"`, sized by CSS — no external asset, no library). Rendered
 * wherever an image id fails to resolve (removed, archived, or never existed), on
 * both the read side (inline prose, hero, carousel) and the edit side (media thumbs,
 * picker). A missing image never breaks a page — it degrades to this glyph.
 */

// A picture frame with a diagonal slash — reads as "no image here".
export const NOT_FOUND_IMAGE = `<svg viewBox="0 0 24 24" class="image-missing-glyph" aria-hidden="true" fill="currentColor"><path d="M2.1 3.5 3.5 2.1l18.4 18.4-1.4 1.4-2-2H5a2 2 0 0 1-2-2V5.4l-.9-1.9zM5 18h11.1l-3.6-3.6-1.5 1.9-2-2.5L5 18zm16-2.9V5a2 2 0 0 0-2-2H8.9l12.1 12.1z"/></svg>`;

/**
 * Wrap the glyph in a labelled placeholder box. `extraClass` lets each consumer keep
 * its own sizing container (hero / slide / thumb / inline) while sharing one glyph and
 * the muted `.image-missing` styling.
 */
export function notFoundImage(extraClass = '') {
  const cls = extraClass ? `image-missing ${extraClass}` : 'image-missing';
  return `<span class="${cls}" role="img" aria-label="Image not found">${NOT_FOUND_IMAGE}</span>`;
}
