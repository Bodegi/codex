import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DYE_COLORS,
  PATTERNS,
  MAX_LAYERS,
  VIEWBOX,
  BANNER_W,
  BANNER_H,
  patternList,
  emptyBanner,
  normalizeBanner,
  isEmptyBanner,
  bannerToSvg,
  bannerToRecipe,
  validateBanner,
} from './bannerModel.js';

// --- palette / vocabulary ---------------------------------------------------

test('there are exactly 16 dyes, each with a unique id and a hex', () => {
  assert.equal(DYE_COLORS.length, 16);
  const ids = new Set(DYE_COLORS.map((d) => d.id));
  assert.equal(ids.size, 16);
  for (const d of DYE_COLORS) assert.match(d.hex, /^#[0-9A-Fa-f]{6}$/);
});

test('every pattern mask is a 20×40 alpha array (800 bytes)', () => {
  assert.ok(Object.keys(PATTERNS).length >= 42, 'all extracted patterns present');
  for (const [id, p] of Object.entries(PATTERNS)) {
    assert.equal(p.alpha.length, BANNER_W * BANNER_H, `${id}: alpha length`);
    assert.equal(typeof p.name, 'string', `${id}: has a name`);
  }
});

test('the six charges are present and named', () => {
  for (const id of ['creeper', 'skull', 'flower', 'mojang', 'globe', 'piglin']) {
    assert.ok(PATTERNS[id], `${id} extracted`);
  }
});

test('patternList mirrors PATTERNS in registry order', () => {
  assert.deepEqual(
    patternList().map((p) => p.id),
    Object.keys(PATTERNS)
  );
});

// --- normalize --------------------------------------------------------------

test('emptyBanner is a white base with no layers', () => {
  assert.deepEqual(emptyBanner(), { base: 'white', layers: [] });
});

test('normalizeBanner coerces junk to an empty banner', () => {
  assert.deepEqual(normalizeBanner(null), emptyBanner());
  assert.deepEqual(normalizeBanner('nope'), emptyBanner());
  assert.deepEqual(normalizeBanner({}), emptyBanner());
});

test('normalizeBanner falls back unknown base + layer colors to white, keeps unknown pattern ids', () => {
  const out = normalizeBanner({
    base: 'chartreuse',
    layers: [{ pattern: 'future_pattern', color: 'chartreuse' }, { pattern: 'cross', color: 'red' }],
  });
  assert.equal(out.base, 'white');
  // an unknown (newer-version) pattern survives the round-trip; its color defaults
  assert.deepEqual(out.layers[0], { pattern: 'future_pattern', color: 'white' });
  assert.deepEqual(out.layers[1], { pattern: 'cross', color: 'red' });
});

test('normalizeBanner drops layers with no pattern and caps at MAX_LAYERS', () => {
  const many = Array.from({ length: MAX_LAYERS + 3 }, () => ({ pattern: 'cross', color: 'red' }));
  const out = normalizeBanner({ base: 'blue', layers: [{ color: 'red' }, ...many] });
  assert.equal(out.layers.length, MAX_LAYERS);
});

test('isEmptyBanner is true only when there are no layers', () => {
  assert.equal(isEmptyBanner({ base: 'red', layers: [] }), true);
  assert.equal(isEmptyBanner({ base: 'red', layers: [{ pattern: 'cross', color: 'white' }] }), false);
});

// --- compose ----------------------------------------------------------------

test('bannerToSvg wraps in a 20×40 viewBox and always paints a base rect', () => {
  const out = bannerToSvg({ base: 'red', layers: [] });
  assert.match(out, new RegExp(`viewBox="${VIEWBOX.replace(/ /g, ' ')}"`));
  assert.match(out, /<rect x="0" y="0" width="20" height="40" fill="#B02E26"\/>/);
});

test('bannerToSvg paints layers in order (index 0 first / bottom)', () => {
  const out = bannerToSvg({
    base: 'white',
    layers: [{ pattern: 'half_horizontal', color: 'red' }, { pattern: 'stripe_center', color: 'blue' }],
  });
  assert.ok(out.indexOf('#B02E26') < out.indexOf('#3C44AA'), 'red half painted before blue stripe');
});

test('bannerToSvg merges a solid block into one rect (rows + cols coalesced)', () => {
  // top stripe fills the top third fully → the solid interior collapses to one tall, full-width rect
  const out = bannerToSvg({ base: 'white', layers: [{ pattern: 'stripe_top', color: 'black' }] });
  assert.match(out, /<rect x="0" y="0" width="20" height="\d+" fill="#1D1D21"\/>/);
});

test('bannerToSvg emits fill-opacity for a partial (gradient) cell', () => {
  const out = bannerToSvg({ base: 'white', layers: [{ pattern: 'gradient', color: 'black' }] });
  assert.match(out, /fill-opacity="/);
});

test('bannerToSvg skips a layer whose pattern is unknown rather than throwing', () => {
  const out = bannerToSvg({ base: 'white', layers: [{ pattern: 'not_a_pattern', color: 'red' }] });
  // only the base rect, no layer paint
  assert.equal((out.match(/<rect/g) || []).length, 1);
});

// --- recipe -----------------------------------------------------------------

test('bannerToRecipe lists base + layers in loom order with human names', () => {
  const recipe = bannerToRecipe({
    base: 'blue',
    layers: [{ pattern: 'creeper', color: 'lime' }, { pattern: 'future_pattern', color: 'white' }],
  });
  assert.deepEqual(recipe.base, { id: 'blue', name: 'Blue', hex: '#3C44AA' });
  assert.equal(recipe.layers.length, 2);
  assert.equal(recipe.layers[0].patternName, 'Creeper Charge');
  assert.equal(recipe.layers[0].colorName, 'Lime');
  // an unknown (newer-version) pattern falls back to its raw id as the name
  assert.equal(recipe.layers[1].patternName, 'future_pattern');
});

// --- validate ---------------------------------------------------------------

test('validateBanner passes a well-formed banner', () => {
  assert.deepEqual(
    validateBanner({ base: 'red', layers: [{ pattern: 'cross', color: 'white' }] }),
    []
  );
});

test('validateBanner flags bad base, over-cap, unknown pattern, unknown color', () => {
  const overCap = Array.from({ length: MAX_LAYERS + 1 }, () => ({ pattern: 'cross', color: 'white' }));
  const problems = validateBanner({ base: 'teal', layers: overCap });
  assert.ok(problems.some((p) => /base/i.test(p)));
  assert.ok(problems.some((p) => new RegExp(`${MAX_LAYERS} layers`).test(p)));

  const bad = validateBanner({ base: 'red', layers: [{ pattern: 'nope', color: 'teal' }] });
  assert.ok(bad.some((p) => /unknown pattern/i.test(p)));
  assert.ok(bad.some((p) => /not a known dye/i.test(p)));
});
