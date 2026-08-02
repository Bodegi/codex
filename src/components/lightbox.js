/**
 * Codex — Lightbox (read-side).
 *
 * A reusable overlay that shows one image full-size on a dimmed backdrop; Esc or a
 * click outside the image closes it. Reuses the overlay idiom `imagePicker.js`
 * established (fixed full-screen backdrop, click-target routing, keydown cleanup).
 *
 * Content images across the reader (inline prose, hero, carousel) and the admin
 * gallery become click-to-expand via `attachLightbox(root)`, which delegates on the
 * shared "content image" selector below. Keeping that list here — not sprinkled
 * through the renderers — means the renderers stay dumb (no per-image wiring) and the
 * edit-side thumbs/picker are deliberately excluded from zooming.
 */

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The read-side content images that open in the lightbox on click. Edit-side thumbs
// (`.media-thumb`) and picker items are intentionally NOT here — they carry their own
// pick/remove behavior. Not-found placeholders are `<span>`, not `<img>`, so they never match.
const ZOOMABLE = 'img.inline-img, img.entry-hero, .carousel-slide img, img.gallery-card-img';

/** Open the lightbox on a single image URL. No-op for a falsy src. */
export function openLightbox(src, alt = '') {
  if (!src) return;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <div class="lightbox-body" role="dialog" aria-modal="true" aria-label="${escapeAttr(alt) || 'Image'}">
      <button type="button" class="lightbox-close" aria-label="Close">×</button>
      <img class="lightbox-img" src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">
    </div>`;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };

  overlay.addEventListener('click', (e) => {
    // Backdrop or the close button closes; a click on the image itself does not.
    if (e.target === overlay || e.target.closest('.lightbox-close')) close();
  });

  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

/**
 * Delegate clicks within `root` so any content image opens the lightbox. Attach ONCE per
 * container — event delegation on the parent survives the innerHTML re-renders the reader
 * and gallery do, so no re-wiring is needed after each render.
 */
export function attachLightbox(root) {
  root.addEventListener('click', (e) => {
    const img = e.target.closest(ZOOMABLE);
    if (img) openLightbox(img.currentSrc || img.src, img.alt);
  });
}
