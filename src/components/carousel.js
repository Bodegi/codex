/**
 * Codex — Carousel (read-side)
 *
 * Renders an entry's `gallery` as a manual scroll-snap "Inspiration" strip and wires
 * its prev/next arrows. Composed into the preview after the entry HTML — it is never
 * part of the entry body. Empty gallery -> renders nothing.
 */

import { notFoundImage } from '../schema/notFoundImage.js';

/**
 * HTML for the carousel, or '' when there are no gallery images. `resolveImage(id) → url|null`
 * is injected (the live image index lives in main.js); an unresolved id degrades to the
 * not-found SVG so a removed image never breaks the strip.
 */
export function renderCarousel(gallery, resolveImage) {
  const ids = Array.isArray(gallery) ? gallery : [];
  if (!ids.length) return '';

  const slides = ids
    .map((id) => {
      const url = resolveImage ? resolveImage(id) : null;
      return url
        ? `<div class="carousel-slide"><img src="${url}" alt="" loading="lazy"></div>`
        : `<div class="carousel-slide carousel-missing">${notFoundImage('image-missing-slide')}</div>`;
    })
    .join('');

  return `
    <div class="carousel">
      <h2>Inspiration</h2>
      <div class="carousel-viewport">
        <button type="button" class="carousel-arrow carousel-prev" aria-label="Previous" title="Previous">‹</button>
        <div class="carousel-track">${slides}</div>
        <button type="button" class="carousel-arrow carousel-next" aria-label="Next" title="Next">›</button>
      </div>
    </div>`;
}

/** Wire the prev/next arrows within a rendered preview root. Safe to call always. */
export function initCarousel(root) {
  const track = root.querySelector('.carousel-track');
  if (!track) return;
  const step = () => Math.max(track.clientWidth * 0.8, 200);
  root.querySelector('.carousel-prev')?.addEventListener('click', () =>
    track.scrollBy({ left: -step(), behavior: 'smooth' })
  );
  root.querySelector('.carousel-next')?.addEventListener('click', () =>
    track.scrollBy({ left: step(), behavior: 'smooth' })
  );
}
