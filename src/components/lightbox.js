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
 *
 * Opening from a carousel image opens the whole gallery: the lightbox then carries ‹ ›
 * arrows and ←/→ keyboard navigation that step (looping) through the gallery's images.
 * Standalone images (inline, hero) open as a single frame with no navigation.
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

/**
 * Open the lightbox. Two call shapes:
 *   openLightbox(src, alt)            — a single image (backward-compatible).
 *   openLightbox([{src, alt}], start) — a gallery; arrows + ←/→ step through it, looping.
 * No-op for an empty/falsy first argument.
 */
export function openLightbox(images, start = 0) {
  const items = typeof images === 'string' ? [{ src: images, alt: start || '' }] : (images || []).filter((it) => it && it.src);
  if (!items.length) return;

  let idx = typeof images === 'string' ? 0 : Math.max(0, Math.min(start, items.length - 1));
  const many = items.length > 1;

  const caption = (it) => it.caption || '';

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    ${many ? `<button type="button" class="lightbox-arrow lightbox-prev" aria-label="Previous image" title="Previous">‹</button>` : ''}
    <div class="lightbox-body" role="dialog" aria-modal="true" aria-label="${escapeAttr(items[idx].alt) || 'Image'}">
      <button type="button" class="lightbox-close" aria-label="Close" title="Close">×</button>
      <img class="lightbox-img" src="${escapeAttr(items[idx].src)}" alt="${escapeAttr(items[idx].alt)}">
      <figcaption class="lightbox-caption"${caption(items[idx]) ? '' : ' hidden'}>${escapeAttr(caption(items[idx]))}</figcaption>
    </div>
    ${many ? `<button type="button" class="lightbox-arrow lightbox-next" aria-label="Next image" title="Next">›</button>` : ''}`;

  const imgEl = overlay.querySelector('.lightbox-img');
  const capEl = overlay.querySelector('.lightbox-caption');
  const show = (i) => {
    idx = (i + items.length) % items.length; // wrap both ways
    imgEl.src = items[idx].src;
    imgEl.alt = items[idx].alt || '';
    const cap = caption(items[idx]);
    capEl.textContent = cap;
    capEl.hidden = !cap;
  };

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') return close();
    if (!many) return;
    if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
  };

  overlay.addEventListener('click', (e) => {
    // Backdrop or the close button closes; the arrows navigate; a click on the image itself does not.
    if (e.target === overlay || e.target.closest('.lightbox-close')) return close();
    if (e.target.closest('.lightbox-prev')) return show(idx - 1);
    if (e.target.closest('.lightbox-next')) return show(idx + 1);
  });

  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

// The ordered image list for a carousel, plus the index of the clicked image. Loop clones
// (`.carousel-clone`) are excluded so the gallery isn't duplicated; a click that lands on a clone
// maps back to the matching real slide by src.
function carouselGallery(carousel, clicked) {
  const imgs = [...carousel.querySelectorAll('.carousel-slide:not(.carousel-clone) img')];
  const items = imgs.map((im) => {
    const cap = im.closest('.carousel-slide')?.dataset.caption || '';
    return { src: im.currentSrc || im.src, alt: im.alt, caption: cap };
  });
  let start = imgs.indexOf(clicked);
  if (start === -1) {
    const src = clicked.currentSrc || clicked.src;
    start = Math.max(0, items.findIndex((it) => it.src === src));
  }
  return { items, start };
}

/**
 * Delegate clicks within `root` so any content image opens the lightbox. Attach ONCE per
 * container — event delegation on the parent survives the innerHTML re-renders the reader
 * and gallery do, so no re-wiring is needed after each render.
 */
export function attachLightbox(root) {
  root.addEventListener('click', (e) => {
    const img = e.target.closest(ZOOMABLE);
    if (!img) return;
    const carousel = img.closest('.carousel');
    if (carousel) {
      const { items, start } = carouselGallery(carousel, img);
      return openLightbox(items, start);
    }
    openLightbox(img.currentSrc || img.src, img.alt);
  });
}
