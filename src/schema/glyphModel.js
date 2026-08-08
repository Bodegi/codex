/**
 * Codex — Glyph (icon/emblem) layer model + compose.
 *
 * The structured source of truth behind the in-app glyph designer. A glyph is an ordered
 * **painter's stack** of SVG
 * primitive layers; `layersToSvg` is the ONE place that turns that stack into markup, mirroring
 * `iconRegistry.js`'s `svg()` wrapper exactly so editor output is render-compatible with bundled
 * icons. Consumers (`getIcon`, `getEmblem`, previews) only ever read the derived `svg` string —
 * they never parse `layers` — so bundled/pasted records (no `layers`) keep working unchanged.
 *
 * Two palettes share the model: **mono** (icons — every layer forced to `currentColor`/`none`, so
 * CSS `color` tints them) and **color** (emblems — literal per-layer fills that don't theme). The
 * palette is passed in; the model itself is palette-agnostic.
 *
 * Pure and Node-testable: no DOM, no SDK. The designer component (browser-only) drives it.
 */

import { ICON_KEY_PATTERN, ICON_KEY_MAX_LENGTH } from './iconRegistry.js';

/** The 24×24 user space, shared with icons (one canvas for both classes). */
export const VIEWBOX = '0 0 24 24';

/** The SVG primitives a layer can be. `path` is emitted by the phase-3 grid tool, not hand-typed. */
export const SHAPES = ['circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline', 'path'];

/** Shapes that are strokes by nature: default to no fill + a visible stroke. */
const STROKE_SHAPES = new Set(['line', 'polyline']);

// Wrapper mirrors iconRegistry.svg() byte-for-byte so a composed icon is interchangeable with a
// bundled one. Color emblems reuse the same wrapper; each color layer emits an explicit fill, so
// the wrapper's currentColor default is moot for them.
const wrap = (body) =>
  `<svg viewBox="${VIEWBOX}" class="icon" aria-hidden="true" fill="currentColor">${body}</svg>`;

let seq = 0;
/** A short, unique-enough local layer id. Not persisted-critical — regenerating on load is fine. */
function layerId() {
  seq += 1;
  return `l${Date.now().toString(36)}${seq}`;
}

/**
 * A fresh layer of `shape`, centered in the 24×24 space and ready to nudge. Defaults pick a
 * sensible fill/stroke per shape (solid for area shapes, stroke-only for line/polyline).
 */
export function newLayer(shape) {
  if (!SHAPES.includes(shape)) throw new Error(`Unknown shape: ${shape}`);
  const base = { id: layerId(), shape };
  const strokey = STROKE_SHAPES.has(shape);
  const paint = strokey
    ? { fill: 'none', stroke: 'currentColor', strokeWidth: 2 }
    : { fill: 'currentColor', stroke: 'none' };
  const geo = {
    circle: { cx: 12, cy: 12, r: 8 },
    ellipse: { cx: 12, cy: 12, rx: 9, ry: 6 },
    rect: { x: 5, y: 5, w: 14, h: 14, rx: 0 },
    line: { x1: 4, y1: 4, x2: 20, y2: 20 },
    polygon: { points: [[12, 3], [21, 21], [3, 21]] },
    polyline: { points: [[4, 12], [12, 4], [20, 12]] },
    path: { d: '' },
  }[shape];
  return { ...base, geo, ...paint };
}

// ── Compose ──────────────────────────────────────────────────────────────────

const num = (n) => (Number.isFinite(n) ? String(+n.toFixed(3)).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m)) : '0');
const attr = (k, v) => (v === undefined || v === null || v === '' ? '' : ` ${k}="${v}"`);
const ptStr = (points) => (points || []).map(([x, y]) => `${num(x)},${num(y)}`).join(' ');

/** Geometry → the shape element's own attributes (no paint). */
function geoAttrs(layer) {
  const g = layer.geo || {};
  switch (layer.shape) {
    case 'circle':
      return `${attr('cx', num(g.cx))}${attr('cy', num(g.cy))}${attr('r', num(g.r))}`;
    case 'ellipse':
      return `${attr('cx', num(g.cx))}${attr('cy', num(g.cy))}${attr('rx', num(g.rx))}${attr('ry', num(g.ry))}`;
    case 'rect':
      return `${attr('x', num(g.x))}${attr('y', num(g.y))}${attr('width', num(g.w))}${attr('height', num(g.h))}${g.rx ? attr('rx', num(g.rx)) : ''}`;
    case 'line':
      return `${attr('x1', num(g.x1))}${attr('y1', num(g.y1))}${attr('x2', num(g.x2))}${attr('y2', num(g.y2))}`;
    case 'polygon':
    case 'polyline':
      return attr('points', ptStr(g.points));
    case 'path':
      return attr('d', g.d);
    default:
      return '';
  }
}

/**
 * Resolve a layer's paint attributes for the palette. Mono collapses every color to
 * `currentColor`/`none` (belt-and-suspenders — the color picker is hidden in mono anyway); color
 * emits the literal fill/stroke. A stroke is only emitted when it should actually be drawn, so
 * area shapes stay stroke-free by default and match hand-authored bundled markup.
 */
function paintAttrs(layer, palette) {
  const mono = palette !== 'color';
  const rawFill = layer.fill ?? 'currentColor';
  const rawStroke = layer.stroke ?? 'none';
  // Mono omits an explicit currentColor fill so the layer inherits the wrapper — byte-for-byte with
  // bundled markup (`<circle .../>`). A literal color fill (color mode) or `none` is always emitted.
  const fill = mono ? (rawFill === 'none' ? 'none' : null) : rawFill;
  const strokeOn = rawStroke && rawStroke !== 'none';
  const stroke = strokeOn ? (mono ? 'currentColor' : rawStroke) : null;
  return (
    (fill ? attr('fill', fill) : '') +
    (stroke ? attr('stroke', stroke) : '') +
    (stroke && Number.isFinite(layer.strokeWidth) ? attr('stroke-width', num(layer.strokeWidth)) : '')
  );
}

/**
 * Compose an ordered layer stack into the glyph's `<svg>` markup — one child element per layer,
 * index 0 painted first (bottom), last on top. This is the derived `svg` stored on save and the
 * only markup consumers read. `palette` is `'color'` for emblems, anything else (default) mono.
 */
export function layersToSvg(layers, { palette = 'mono' } = {}) {
  const body = (layers || [])
    .filter((l) => l && SHAPES.includes(l.shape))
    .map((l) => `<${l.shape}${geoAttrs(l)}${paintAttrs(l, palette)}/>`)
    .join('');
  return wrap(body);
}

// ── Validation ─────────────────────────────────────────────────────────────

const inRange = (v) => Number.isFinite(v) && v >= -8 && v <= 32; // a little slack past the 24×24 box
const nonneg = (v) => Number.isFinite(v) && v >= 0 && v <= 40;

/** True when a paint value is `currentColor` or `none` — the only two mono admits. */
const isMonoColor = (c) => c === undefined || c === null || c === 'currentColor' || c === 'none';

function geoProblems(layer) {
  const g = layer.geo || {};
  switch (layer.shape) {
    case 'circle':
      return inRange(g.cx) && inRange(g.cy) && nonneg(g.r) && g.r > 0 ? [] : ['circle needs cx, cy and r > 0.'];
    case 'ellipse':
      return inRange(g.cx) && inRange(g.cy) && nonneg(g.rx) && nonneg(g.ry) && g.rx > 0 && g.ry > 0
        ? []
        : ['ellipse needs cx, cy and rx, ry > 0.'];
    case 'rect':
      return inRange(g.x) && inRange(g.y) && nonneg(g.w) && nonneg(g.h) && g.w > 0 && g.h > 0
        ? []
        : ['rect needs x, y and width, height > 0.'];
    case 'line':
      return inRange(g.x1) && inRange(g.y1) && inRange(g.x2) && inRange(g.y2) ? [] : ['line needs two valid endpoints.'];
    case 'polygon':
    case 'polyline': {
      const pts = g.points;
      const ok = Array.isArray(pts) && pts.length >= 2 && pts.every((p) => Array.isArray(p) && inRange(p[0]) && inRange(p[1]));
      return ok ? [] : [`${layer.shape} needs at least two valid points.`];
    }
    case 'path':
      return typeof g.d === 'string' && g.d.trim() ? [] : ['path needs a non-empty d.'];
    default:
      return [`Unknown shape "${layer.shape}".`];
  }
}

/**
 * Validate a layer stack for a palette. Returns human-readable problems ([] when valid): non-empty,
 * every layer a known shape with in-range geometry, and — in mono — no literal colors (structurally
 * enforcing the icons-are-monochrome rule; the paste path's `<svg>` check lives in `validateIcon`).
 */
export function validateLayers(layers, { palette = 'mono' } = {}) {
  const problems = [];
  if (!Array.isArray(layers) || layers.length === 0) {
    problems.push('Add at least one layer.');
    return problems;
  }
  const mono = palette !== 'color';
  layers.forEach((layer, i) => {
    const where = `Layer ${i + 1}`;
    if (!layer || !SHAPES.includes(layer.shape)) {
      problems.push(`${where}: unknown shape.`);
      return;
    }
    for (const p of geoProblems(layer)) problems.push(`${where}: ${p}`);
    if (mono && !(isMonoColor(layer.fill) && isMonoColor(layer.stroke))) {
      problems.push(`${where}: icons are monochrome — colors must be currentColor.`);
    }
  });
  return problems;
}

/**
 * Full designer-save gate: the shared key rules (reusing `iconRegistry`'s pattern/length + a
 * duplicate check) plus `validateLayers`. `existingKeys` should exclude the record's own key on an
 * edit-in-place so it isn't rejected as a duplicate of itself.
 */
export function validateGlyph({ key, layers, palette = 'mono' } = {}, existingKeys = []) {
  const problems = [];
  const k = String(key ?? '').trim();
  if (!k) problems.push('Key is required.');
  else if (!ICON_KEY_PATTERN.test(k)) problems.push('Key must be lowercase letters, digits, and hyphens.');
  else if (k.length > ICON_KEY_MAX_LENGTH) problems.push(`Key must be ${ICON_KEY_MAX_LENGTH} characters or fewer.`);
  else if (existingKeys.includes(k)) problems.push(`A glyph "${k}" already exists.`);
  return problems.concat(validateLayers(layers, { palette }));
}
