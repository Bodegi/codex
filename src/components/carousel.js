/**
 * Codex — Carousel (read-side)
 *
 * Renders an entry's `gallery` as a centered "Inspiration" gallery: one active card sits in the
 * middle with its neighbors peeking (and dimmed) on either side, driven by an index + a track
 * transform — no scrollbar. Prev/next re-center by one; autoplay advances every 10s but only when
 * there are more images than fit. Composed into the preview after the entry HTML — never part of
 * the entry body. Empty gallery -> renders nothing.
 *
 * When the strip overflows, it loops **seamlessly** in one direction: copies of the slides are
 * cloned onto both ends, so advancing off the last slide keeps sliding forward into a clone of the
 * first, then snaps back to the real first once the transition ends (clone and real are identical,
 * so the snap is invisible). The end clones also give the first/last slides a neighbor to peek and
 * let the arrows wrap both ways. A gallery that already fits stays a static, un-cloned strip.
 *
 * The pure, Node-tested core is the centering geometry (`carouselOffset`), the overflow test
 * (`carouselAutoplays`), and the clone count (`carouselCloneCount`); `initCarousel` is the
 * browser-only seam that measures the DOM, clones, and wires the timers/arrows. It tears down the
 * carousels it set up on the previous render of the same root (the reader pane re-renders by
 * innerHTML), so timers and listeners never leak.
 */

import { notFoundImage } from '../schema/notFoundImage.js';
import { normalizeGallery } from '../schema/galleryModel.js';

const AUTOPLAY_MS = 10000;

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
 * Clones to add on EACH end for the seamless loop: enough to cover a viewport-plus-one of slides so
 * a slide sitting on a clone still has real-looking neighbors peeking, capped at `count` (cloning
 * more than the whole gallery just repeats it). 0 when there's nothing to loop. Pure — no DOM.
 */
export function carouselCloneCount({ count, stride, viewportWidth }) {
  if (count < 2 || stride <= 0) return 0;
  return Math.min(count, Math.ceil(viewportWidth / stride) + 1);
}

/**
 * HTML for the carousel, or '' when there are no gallery images. Accepts either the `{id,caption}`
 * gallery shape or a legacy bare-id array (normalizeGallery reads both). `resolveImage(id) → url|null`
 * is injected (the live image index lives in main.js); an unresolved id degrades to the not-found SVG
 * so a removed image never breaks the strip. A slide's caption rides a `data-caption` attribute so the
 * lightbox can surface it, and renders as a `<figcaption>` under the image.
 */
export function renderCarousel(gallery, resolveImage) {
  const items = normalizeGallery(gallery);
  if (!items.length) return '';

  const slides = items
    .map(({ id, caption }) => {
      const url = resolveImage ? resolveImage(id) : null;
      const cap = caption ? ` data-caption="${escapeHtml(caption)}"` : '';
      const figcaption = caption ? `<figcaption class="carousel-caption">${escapeHtml(caption)}</figcaption>` : '';
      return url
        ? `<div class="carousel-slide"${cap}><img src="${url}" alt="${escapeHtml(caption)}" loading="lazy">${figcaption}</div>`
        : `<div class="carousel-slide carousel-missing"${cap}>${notFoundImage('image-missing-slide')}${figcaption}</div>`;
    })
    .join('');

  return `
    <div class="carousel" data-count="${items.length}">
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

// Wire one carousel: centering, arrows, seamless-loop autoplay. Returns a cleanup fn that clears
// the timer and detaches listeners (called on the next render of the same root).
//
// Loop layout (when the strip overflows): the track holds [k tail clones][n reals][k head clones].
// `i` is the logical index (0..n-1); `dom` is the DOM slot we center. Stepping off the real band
// into a clone animates smoothly, then a snap of ±n (a no-transition reposition onto the identical
// real slide) brings `dom` back into the real band without a visible jump. A gallery that fits is
// left un-cloned and simply clamps at its ends, with the arrows disabling there.
function setupCarousel(carousel) {
  const prev = carousel.querySelector('.carousel-prev');
  const next = carousel.querySelector('.carousel-next');
  const track = carousel.querySelector('.carousel-track');
  const count = carousel.querySelectorAll('.carousel-slide').length;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Decide loop vs. static from a first measurement of the real (un-cloned) slides.
  const m0 = measure(carousel);
  const looping = !!m0 && carouselAutoplays({ count, slideWidth: m0.slideWidth, stride: m0.stride, viewportWidth: m0.viewportWidth });

  // Everything fits → pure-CSS layout, no transform/arrows/autoplay. `is-fill` (2+ images) grows a
  // centered row to fill the width; `is-single` (one image) stays centered with space both sides.
  if (!looping) {
    carousel.classList.add('is-static', count === 1 ? 'is-single' : 'is-fill');
    return () => carousel.classList.remove('is-static', 'is-single', 'is-fill');
  }

  let k = 0;
  if (looping && track) {
    k = carouselCloneCount({ count, stride: m0.stride, viewportWidth: m0.viewportWidth });
    const reals = [...track.querySelectorAll('.carousel-slide')];
    const clone = (node) => {
      const c = node.cloneNode(true);
      c.classList.add('carousel-clone');
      c.setAttribute('aria-hidden', 'true');
      return c;
    };
    // Tail clones (last k reals) go before the block; head clones (first k) after — so the sequence
    // tiles continuously and every real slide has a neighbor to peek on both sides.
    reals.slice(count - k).forEach((s) => track.insertBefore(clone(s), reals[0]));
    reals.slice(0, k).forEach((s) => track.appendChild(clone(s)));
  }

  const realStart = k; // DOM slot of real slide 0
  let dom = realStart; // DOM slot currently centered
  let timer = null;
  let snapArmed = false;

  const inClones = () => dom < realStart || dom > realStart + count - 1;

  const apply = (animate) => {
    const m = measure(carousel);
    if (!m) return;
    if (!animate) track.style.transition = 'none';
    const offset = carouselOffset({ index: dom, slideWidth: m.slideWidth, stride: m.stride, viewportWidth: m.viewportWidth });
    track.style.transform = `translateX(${offset}px)`;
    if (!animate) {
      void track.offsetWidth; // flush the jump before restoring the transition
      track.style.transition = '';
    }
    m.slides.forEach((s, idx) => s.classList.toggle('is-active', idx === dom));
  };

  // Bring `dom` back into the real band with an instant (no-transition) reposition onto the
  // identical real slide. A no-op when already in the band.
  const snap = () => {
    if (dom < realStart) dom += count;
    else if (dom > realStart + count - 1) dom -= count;
    snapArmed = false;
    apply(false);
  };

  const go = (delta) => {
    if (inClones()) snap(); // collapse a pending snap first so rapid steps never outrun the clones
    dom += delta;
    apply(true);
    if (inClones()) snapArmed = true; // finish the wrap once the slide-in transition ends
  };

  const stopAuto = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const startAuto = () => {
    stopAuto();
    if (reduceMotion || !looping) return;
    timer = setInterval(() => go(1), AUTOPLAY_MS);
  };

  const onPrev = () => {
    go(-1);
    startAuto(); // user interaction resets the autoplay clock
  };
  const onNext = () => {
    go(1);
    startAuto();
  };
  const onEnter = () => stopAuto();
  const onLeave = () => startAuto();
  const onTransitionEnd = (e) => {
    if (e.target === track && e.propertyName === 'transform' && snapArmed) snap();
  };

  prev?.addEventListener('click', onPrev);
  next?.addEventListener('click', onNext);
  carousel.addEventListener('mouseenter', onEnter);
  carousel.addEventListener('mouseleave', onLeave);
  track?.addEventListener('transitionend', onTransitionEnd);

  apply(false); // initial center is instant — don't slide in from 0
  startAuto();

  return () => {
    stopAuto();
    prev?.removeEventListener('click', onPrev);
    next?.removeEventListener('click', onNext);
    carousel.removeEventListener('mouseenter', onEnter);
    carousel.removeEventListener('mouseleave', onLeave);
    track?.removeEventListener('transitionend', onTransitionEnd);
    // Reset to pristine real slides so a resize re-init starts clean.
    track?.querySelectorAll('.carousel-clone').forEach((c) => c.remove());
    if (track) {
      track.style.transform = '';
      track.style.transition = '';
    }
    track?.querySelectorAll('.carousel-slide').forEach((s) => s.classList.remove('is-active'));
    if (prev) prev.disabled = false;
    if (next) next.disabled = false;
  };
}

/**
 * Wire every carousel within a rendered preview root. Safe to call always, and idempotent across
 * re-renders of the same root: it tears down the carousels it wired last time (resetting their DOM)
 * before wiring the new DOM, so autoplay timers, clones, and listeners never accumulate. A single
 * debounced resize handler re-runs the whole pass, so a window resize re-decides loop-vs-static and
 * re-centers every carousel at once.
 */
export function initCarousel(root) {
  (root.__carouselCleanups || []).forEach((fn) => fn());
  if (root.__onCarouselResize) {
    window.removeEventListener('resize', root.__onCarouselResize);
    root.__onCarouselResize = null;
  }
  const carousels = [...root.querySelectorAll('.carousel')];
  root.__carouselCleanups = carousels.map(setupCarousel);
  if (carousels.length) {
    let t;
    root.__onCarouselResize = () => {
      clearTimeout(t);
      t = setTimeout(() => initCarousel(root), 150);
    };
    window.addEventListener('resize', root.__onCarouselResize);
  }
}
