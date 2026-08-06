import { test } from 'node:test';
import assert from 'node:assert/strict';

import { layersToSvg, validateLayers, validateGlyph, newLayer, SHAPES, VIEWBOX } from './glyphModel.js';

// --- wrapper / byte-compat with iconRegistry -------------------------------

test('layersToSvg wraps in the same shell as iconRegistry.svg()', () => {
  const out = layersToSvg([{ shape: 'circle', geo: { cx: 12, cy: 12, r: 5 } }], { palette: 'mono' });
  assert.equal(out, '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>');
});

test('a mono currentColor layer omits fill (inherits the wrapper, like bundled markup)', () => {
  const out = layersToSvg([{ shape: 'rect', geo: { x: 5, y: 5, w: 14, h: 14 }, fill: 'currentColor' }], { palette: 'mono' });
  assert.match(out, /<rect x="5" y="5" width="14" height="14"\/>/); // element carries no fill attr
});

test('layersToSvg paints layers in order (index 0 first / bottom)', () => {
  const out = layersToSvg(
    [
      { shape: 'circle', geo: { cx: 12, cy: 12, r: 9 } },
      { shape: 'rect', geo: { x: 10, y: 6, w: 4, h: 12 } },
    ],
    { palette: 'mono' }
  );
  assert.ok(out.indexOf('<circle') < out.indexOf('<rect'), 'circle painted before rect');
});

// --- mono vs color ---------------------------------------------------------

test('mono strips a literal fill (layer inherits the wrapper currentColor)', () => {
  const out = layersToSvg([{ shape: 'circle', geo: { cx: 12, cy: 12, r: 5 }, fill: '#ff0000' }], { palette: 'mono' });
  assert.doesNotMatch(out, /#ff0000/);
  assert.match(out, /<circle cx="12" cy="12" r="5"\/>/); // element carries no fill attr
});

test('color mode emits the literal fill and stroke', () => {
  const out = layersToSvg(
    [{ shape: 'circle', geo: { cx: 12, cy: 12, r: 5 }, fill: '#3366ff', stroke: '#000000', strokeWidth: 2 }],
    { palette: 'color' }
  );
  assert.match(out, /fill="#3366ff"/);
  assert.match(out, /stroke="#000000"/);
  assert.match(out, /stroke-width="2"/);
});

test('fill:none is preserved in both palettes', () => {
  assert.match(layersToSvg([{ shape: 'circle', geo: { cx: 12, cy: 12, r: 5 }, fill: 'none', stroke: 'currentColor', strokeWidth: 1 }], { palette: 'mono' }), /fill="none"/);
  assert.match(layersToSvg([{ shape: 'circle', geo: { cx: 12, cy: 12, r: 5 }, fill: 'none', stroke: '#111111' }], { palette: 'color' }), /fill="none"/);
});

test('stroke is omitted when none, and stroke-width rides only with a stroke', () => {
  const out = layersToSvg([{ shape: 'rect', geo: { x: 2, y: 2, w: 4, h: 4 }, fill: 'currentColor', stroke: 'none', strokeWidth: 3 }], { palette: 'color' });
  assert.doesNotMatch(out, /stroke=/);
  assert.doesNotMatch(out, /stroke-width/);
});

test('polygon serializes its points; unknown-shape layers are dropped', () => {
  const out = layersToSvg(
    [
      { shape: 'polygon', geo: { points: [[12, 3], [21, 21], [3, 21]] } },
      { shape: 'bogus', geo: {} },
    ],
    { palette: 'mono' }
  );
  assert.match(out, /<polygon points="12,3 21,21 3,21"/);
  assert.doesNotMatch(out, /bogus/);
});

test('rect corner radius emitted only when set', () => {
  assert.doesNotMatch(layersToSvg([{ shape: 'rect', geo: { x: 1, y: 1, w: 2, h: 2, rx: 0 } }], { palette: 'mono' }), /rx=/);
  assert.match(layersToSvg([{ shape: 'rect', geo: { x: 1, y: 1, w: 2, h: 2, rx: 3 } }], { palette: 'mono' }), /rx="3"/);
});

// --- newLayer --------------------------------------------------------------

test('newLayer centers a solid area shape with a unique id', () => {
  const a = newLayer('circle');
  const b = newLayer('circle');
  assert.equal(a.shape, 'circle');
  assert.deepEqual(a.geo, { cx: 12, cy: 12, r: 8 });
  assert.equal(a.fill, 'currentColor');
  assert.notEqual(a.id, b.id);
});

test('newLayer gives line/polyline a stroke and no fill', () => {
  const line = newLayer('line');
  assert.equal(line.fill, 'none');
  assert.equal(line.stroke, 'currentColor');
  assert.equal(line.strokeWidth, 2);
});

test('newLayer rejects an unknown shape', () => {
  assert.throws(() => newLayer('star'), /Unknown shape/);
});

test('every SHAPES entry produces a compose-able default layer', () => {
  for (const s of SHAPES) {
    if (s === 'path') continue; // path has no primitive default (grid tool authors it)
    const out = layersToSvg([newLayer(s)], { palette: 'mono' });
    assert.match(out, new RegExp(`<${s}[ /]`), `${s} should render`);
  }
});

// --- validateLayers --------------------------------------------------------

test('validateLayers requires a non-empty stack', () => {
  assert.deepEqual(validateLayers([], { palette: 'mono' }), ['Add at least one layer.']);
  assert.deepEqual(validateLayers(null, { palette: 'mono' }), ['Add at least one layer.']);
});

test('validateLayers passes a good mono stack', () => {
  assert.deepEqual(validateLayers([newLayer('circle')], { palette: 'mono' }), []);
});

test('validateLayers rejects literal colors in mono, allows them in color', () => {
  const layer = { shape: 'circle', geo: { cx: 12, cy: 12, r: 5 }, fill: '#ff0000' };
  assert.match(validateLayers([layer], { palette: 'mono' })[0], /monochrome/);
  assert.deepEqual(validateLayers([layer], { palette: 'color' }), []);
});

test('validateLayers flags out-of-range / degenerate geometry', () => {
  assert.match(validateLayers([{ shape: 'circle', geo: { cx: 12, cy: 12, r: 0 } }], { palette: 'mono' })[0], /r > 0/);
  assert.match(validateLayers([{ shape: 'polygon', geo: { points: [[1, 1]] } }], { palette: 'mono' })[0], /two valid points/);
  assert.match(validateLayers([{ shape: 'nope', geo: {} }], { palette: 'mono' })[0], /unknown shape/);
});

// --- validateGlyph (key + layers) ------------------------------------------

test('validateGlyph enforces the shared key gate then the layers', () => {
  assert.match(validateGlyph({ key: '', layers: [newLayer('circle')] })[0], /Key is required/);
  assert.match(validateGlyph({ key: 'Bad Key', layers: [newLayer('circle')] })[0], /lowercase/);
  assert.match(validateGlyph({ key: 'dup', layers: [newLayer('circle')] }, ['dup'])[0], /already exists/);
  assert.deepEqual(validateGlyph({ key: 'dragon-lair', layers: [newLayer('circle')] }, ['other']), []);
});

test('VIEWBOX is the shared 24×24 space', () => {
  assert.equal(VIEWBOX, '0 0 24 24');
});
