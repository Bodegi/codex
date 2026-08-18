/**
 * Codex — Carousel (read-side)
 *
 * Renders an entry's `gallery` as a centered "Inspiration" gallery: one active card sits in the
 * middle with its neighbors peeking (and dimmed) on either side, driven by an index + a track
 * transform — no scrollbar. Prev/next re-center by one; autoplay advances every 10s but only when
 * there are more images than fit. Composed into the preview after the entry HTML — never part of
 * the entry body. Empty gallery -> renders nothing.
 *
 * The centering geometry (`carouselOffset`) and the autoplay-eligibility test (`carouselAutoplays`)
 * are pure and Node-tested; `initCarousel` is the browser-only seam that measures the DOM and wires
 * the timers/arrows. `initCarousel` tears down the carousels it set up on the previous render of the
 * same root (the reader pane re-renders by innerHTML), so timers and listeners never leak.
 */

import { notFoundImage } from '../schema/notFoundImage.js';

const AUTOPLAY_MS = 10000;

/**
 * translateX (px) that centers slide `index` in a viewport of width `viewportWidth`, given a
 * uniform slide `stride` (slideWidth + gap) and `slideWidth`. Pure geometry — no DOM.
 */
export function carouselOffset({ index, slideWidth, stride, viewportWidth }) {
  const slideCenter = index * stride + slideWidth / 2;
  return viewportWidth / 2 - slideCenter;
}

/**
 * True when a gallery's slides don't all fit the viewport, so autoplay / arrows earn their place.
 * `stride` is slideWidth + gap; the laid-out track spans `(count-1)*stride + slideWidth`. A gallery
 * that already fits stays static.
 */
export function carouselAutoplays({ count, slideWidth, stride, viewportWidth }) {
  if (count < 2 || stride <= 0) return false;
  const trackWidth = (count - 1) * stride + slideWidth;
  return trackWidth > viewportWidth + 1; // +1px slack so an exact fit doesn't autoplay
}

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
    <div class="carousel" data-count="${ids.length}">
      <h2>Inspiration</h2>
      <div class="carousel-viewport">
        <button type="button" class="carousel-arrow carousel-prev" aria-label="Previous" title="Previous">‹</button>
        <div class="carousel-track">${slides}</div>
        <button type="button" class="carousel-arrow carousel-next" aria-label="Next" title="Next">›</button>
      </div>
    </div>`;
}

// Measure a single carousel's geometry from the laid-out DOM. Returns null when it can't yet
// (0 or 1 slide, or nothing measurable) — the caller then leaves it as a static single frame.
// Uses layout geometry (offsetLeft/offsetWidth), NOT getBoundingClientRect: slides carry a
// scale() transform (active 1, others 0.9) that distorts client rects but never layout boxes,
// and the track translate we apply lives in that same layout space.
function measure(carousel) {
  const track = carousel.querySelector('.carousel-track');
  const viewport = carousel.querySelector('.carousel-viewport');
  const slides = track ? [...track.querySelectorAll('.carousel-slide')] : [];
  if (!track || !viewport || slides.length === 0) return null;
  const slideWidth = slides[0].offsetWidth;
  // Stride = distance between adjacent slide origins (slideWidth + gap); fall back to slideWidth.
  const stride = slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : slideWidth;
  return { track, viewport, slides, slideWidth, stride, viewportWidth: viewport.clientWidth };
}

// Wire one carousel: centering, arrows, ping-pong autoplay. Returns a cleanup fn that clears the
// timer and detaches listeners (called on the next render of the same root).
function setupCarousel(carousel) {
  const prev = carousel.querySelector('.carousel-prev');
  const next = carousel.querySelector('.carousel-next');
  const count = Number(carousel.dataset.count) || carousel.querySelectorAll('.carousel-slide').length;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let index = 0;
  let dir = 1;
  let timer = null;

  const apply = () => {
    const m = measure(carousel);
    if (!m) return;
    index = Math.max(0, Math.min(index, m.slides.length - 1));
    const offset = carouselOffset({ index, slideWidth: m.slideWidth, stride: m.stride, viewportWidth: m.viewportWidth });
    m.track.style.transform = `translateX(${offset}px)`;
    m.slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === m.slides.length - 1;
  };

  const go = (i) => {
    index = Math.max(0, Math.min(i, count - 1));
    apply();
  };

  const stopAuto = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const startAuto = () => {
    stopAuto();
    if (reduceMotion) return;
    const m = measure(carousel);
    if (!m || !carouselAutoplays({ count, slideWidth: m.slideWidth, stride: m.stride, viewportWidth: m.viewportWidth })) return;
    timer = setInterval(() => {
      // Ping-pong so the active card never snaps back across the whole track.
      if (index + dir > count - 1 || index + dir < 0) dir = -dir;
      go(index + dir);
    }, AUTOPLAY_MS);
  };

  const onPrev = () => {
    go(index - 1);
    startAuto(); // user interaction resets the autoplay clock
  };
  const onNext = () => {
    go(index + 1);
    startAuto();
  };
  const onEnter = () => stopAuto();
  const onLeave = () => startAuto();
  const onResize = () => apply();

  prev?.addEventListener('click', onPrev);
  next?.addEventListener('click', onNext);
  carousel.addEventListener('mouseenter', onEnter);
  carousel.addEventListener('mouseleave', onLeave);
  window.addEventListener('resize', onResize);

  apply();
  startAuto();

  return () => {
    stopAuto();
    prev?.removeEventListener('click', onPrev);
    next?.removeEventListener('click', onNext);
    carousel.removeEventListener('mouseenter', onEnter);
    carousel.removeEventListener('mouseleave', onLeave);
    window.removeEventListener('resize', onResize);
  };
}

/**
 * Wire every carousel within a rendered preview root. Safe to call always, and idempotent across
 * re-renders of the same root: it tears down the carousels it wired last time before wiring the
 * new DOM, so autoplay timers and resize listeners never accumulate.
 */
export function initCarousel(root) {
  (root.__carouselCleanups || []).forEach((fn) => fn());
  root.__carouselCleanups = [...root.querySelectorAll('.carousel')].map(setupCarousel);
}
