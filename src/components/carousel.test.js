import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderCarousel, carouselOffset, carouselAutoplays } from './carousel.js';

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
