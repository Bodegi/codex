import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderCarousel, carouselOffset, carouselAutoplays, carouselCloneCount } from './carousel.js';

test('renderCarousel: empty gallery renders nothing', () => {
  assert.equal(renderCarousel([], () => 'x'), '');
  assert.equal(renderCarousel(null, () => 'x'), '');
});

test('renderCarousel: one slide per id, count attribute reflects length', () => {
  const html = renderCarousel(['a', 'b', 'c'], (id) => `http://img/${id}`);
  assert.match(html, /data-count="3"/);
  assert.equal((html.match(/carousel-slide/g) || []).length, 3);
  assert.match(html, /src="http:\/\/img\/a"/);
});

test('renderCarousel: an unresolved id degrades to the not-found frame, not a broken img', () => {
  const html = renderCarousel(['gone'], () => null);
  assert.match(html, /carousel-missing/);
  assert.doesNotMatch(html, /<img/);
});

test('renderCarousel: a captioned image carries data-caption + a figcaption, escaped', () => {
  const html = renderCarousel([{ id: 'a', caption: 'Dawn <harbor>' }, { id: 'b', caption: '' }], (id) => `/i/${id}`);
  assert.match(html, /data-caption="Dawn &lt;harbor&gt;"/);
  assert.match(html, /<figcaption class="carousel-caption">Dawn &lt;harbor&gt;<\/figcaption>/);
  // The uncaptioned second slide gets neither.
  assert.equal((html.match(/figcaption/g) || []).length, 2); // open+close of the one caption only
  assert.match(html, /alt="Dawn &lt;harbor&gt;"/); // caption doubles as alt text
});

test('renderCarousel: accepts the legacy bare-id array unchanged (count + slides)', () => {
  const html = renderCarousel(['a', 'b', 'c'], (id) => `/i/${id}`);
  assert.match(html, /data-count="3"/);
  assert.equal((html.match(/carousel-slide/g) || []).length, 3);
  assert.doesNotMatch(html, /figcaption/); // no captions in the legacy shape
});

test('carouselOffset: centers the chosen slide in the viewport', () => {
  // slideWidth 300, stride 320 (16px gap), viewport 800 → viewport center 400.
  // slide 0 center is 150 → offset 250; each further slide shifts left by one stride.
  assert.equal(carouselOffset({ index: 0, slideWidth: 300, stride: 320, viewportWidth: 800 }), 250);
  assert.equal(carouselOffset({ index: 1, slideWidth: 300, stride: 320, viewportWidth: 800 }), 250 - 320);
  assert.equal(carouselOffset({ index: 2, slideWidth: 300, stride: 320, viewportWidth: 800 }), 250 - 640);
});

test('carouselAutoplays: only when the laid-out track is wider than the viewport', () => {
  // 2 slides, stride 320, slideWidth 300 → track = 620, fits an 800 viewport → static.
  assert.equal(carouselAutoplays({ count: 2, slideWidth: 300, stride: 320, viewportWidth: 800 }), false);
  // 4 slides → track = 3*320 + 300 = 1260 > 800 → autoplay.
  assert.equal(carouselAutoplays({ count: 4, slideWidth: 300, stride: 320, viewportWidth: 800 }), true);
  // A single image never autoplays.
  assert.equal(carouselAutoplays({ count: 1, slideWidth: 300, stride: 320, viewportWidth: 200 }), false);
});

test('carouselCloneCount: covers a viewport-plus-one of slides, capped at the gallery size', () => {
  // 800/320 = 2.5 → ceil 3, +1 = 4, but only 6 slides so 4 clones each end.
  assert.equal(carouselCloneCount({ count: 6, stride: 320, viewportWidth: 800 }), 4);
  // Cap: never clone more than the whole gallery.
  assert.equal(carouselCloneCount({ count: 3, stride: 320, viewportWidth: 2000 }), 3);
  // Nothing to loop.
  assert.equal(carouselCloneCount({ count: 1, stride: 320, viewportWidth: 800 }), 0);
  // A slide wider than the viewport still clones at least a neighbor each side (ceil(<1)+1 = 2).
  assert.equal(carouselCloneCount({ count: 5, stride: 900, viewportWidth: 400 }), 2);
});
