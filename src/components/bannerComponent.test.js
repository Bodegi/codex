import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderBannerRead, designerHtml } from './bannerComponent.js';

const field = { key: 'sigil', label: 'Sigil' };

// renderBannerRead / designerHtml are pure string functions (no DOM), so they're Node-testable even
// though the mount that wires them is browser-only.

test('renderBannerRead is empty for an unset value', () => {
  assert.equal(renderBannerRead(field, null), '');
  assert.equal(renderBannerRead(field, undefined), '');
});

test('renderBannerRead composes the banner svg + a click-to-open recipe (no inline expander)', () => {
  const html = renderBannerRead(field, {
    base: 'blue',
    layers: [{ pattern: 'creeper', color: 'green' }, { pattern: 'border', color: 'white' }],
  });
  assert.match(html, /<svg /);
  assert.match(html, /<figure class="banner-read" data-banner-recipe/); // clickable, opens the modal
  assert.match(html, /class="banner-recipe-content" hidden/); // recipe rides along hidden, lifted by the modal
  assert.doesNotMatch(html, /<details/); // the inline expander is gone
  assert.ok(html.indexOf('Base: Blue') < html.indexOf('Creeper Charge'), 'base before layers');
  assert.ok(html.indexOf('Creeper Charge') < html.indexOf('Border'), 'layers in loom order');
});

test('renderBannerRead recipe carries the composed banner figure and a shape mask per layer', () => {
  const html = renderBannerRead(field, {
    base: 'blue',
    layers: [{ pattern: 'creeper', color: 'green' }, { pattern: 'border', color: 'white' }],
  });
  assert.match(html, /banner-recipe-figure/); // composed banner rides beside the bullets in the modal
  assert.equal((html.match(/banner-recipe-thumb/g) || []).length, 2); // one white-on-black shape mask per layer
});

test('renderBannerRead shows a caption as a figcaption when set, and omits it when blank', () => {
  const withCap = renderBannerRead(field, { base: 'red', layers: [{ pattern: 'border', color: 'white' }], caption: 'War banner <b>' });
  assert.match(withCap, /<figcaption class="banner-caption">War banner &lt;b&gt;<\/figcaption>/);
  const noCap = renderBannerRead(field, { base: 'red', layers: [{ pattern: 'border', color: 'white' }] });
  assert.doesNotMatch(noCap, /banner-caption/);
});

test('designerHtml renders a caption input carrying the current caption', () => {
  const html = designerHtml({ base: 'red', layers: [], caption: 'House guard' }, field, -1);
  assert.match(html, /data-banner-caption/);
  assert.match(html, /value="House guard"/);
});

test('designerHtml hides the pattern grid until a layer is edited', () => {
  const banner = { base: 'red', layers: [{ pattern: 'border', color: 'white' }, { pattern: 'creeper', color: 'lime' }] };

  const collapsed = designerHtml(banner, field, -1);
  assert.doesNotMatch(collapsed, /banner-pattern-grid/, 'no grid when nothing is being edited');
  assert.match(collapsed, /data-act="add"/, 'a distinct Add-layer button');

  const editing = designerHtml(banner, field, 1);
  assert.equal((editing.match(/banner-pattern-grid/g) || []).length, 1, 'grid only for the edited layer');
});

test('the edited layer gold-flags its current pattern in the grid', () => {
  const editing = designerHtml({ base: 'red', layers: [{ pattern: 'creeper', color: 'lime' }] }, field, 0);
  assert.match(editing, /class="banner-pat is-selected" data-act="pattern" data-pattern="creeper"/);
});
