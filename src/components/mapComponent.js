/**
 * Codex — Map component.
 *
 * A registered `map` field kind: load a map image as a backdrop, pan/zoom over it, drop pins,
 * and draw roads / territories on a `<canvas>` overlay. Registered in `fieldKinds.js` as a
 * `layout:'break'` component with `selfRender:true` (see below); its value rides the entry doc
 * on `data[field.key]` and saves / versions / subscribes with every other field — no bespoke
 * Firestore doc.
 *
 *   value = { mapImageId, waypoints, roads, territories }
 *   waypoint  = { id, kind:'waypoint',  x, y,        label, ref?, color? }
 *   road      = { id, kind:'road',      points:[{x,y}], label, ref?, color? }
 *   territory = { id, kind:'territory', points:[{x,y}], label, ref?, color? }
 *
 * All coordinates are in **image space** so a marker stays glued to the map as you pan/zoom.
 *
 * Rendering is **hybrid**: roads/territories are vector strokes painted on the `<canvas>`;
 * waypoints are DOM elements in a `.map-pin-layer` stacked over it — so a pin stays a crisp,
 * clickable, constant-size on-screen marker at any zoom (the Google-Maps model). `positionPins()`
 * keeps the overlay glued to the canvas transform; `redraw()` runs both passes.
 *
 * `selfRender` (read by main.js `wireComponentMounts`): unlike hero/gallery — whose `onChange`
 * rebuilds the whole form to refresh their thumbnails — the map owns a live canvas with
 * ephemeral pan/zoom state that a form teardown would reset. So its `onChange` persists the
 * value and refreshes only the read preview; `mount` redraws its own canvas in place.
 *
 * This module imports cleanly under Node (no DOM access at import time) so `fieldKinds.js`
 * stays Node-testable; `mount` / `initMapReadCanvases` are browser-only and never run there.
 * The pure helpers (`emptyMapValue` / `normalizeMapValue` / `markerColor` / `simplifyPoints`) are
 * unit-tested.
 *
 * A marker can carry an optional `ref` (an entry id) whose title becomes its display label, and an
 * optional `glyph` (an emblem/icon key) rendered as SVG when it resolves, else the palette dot.
 * `resolveMarkerGlyph` is the pure fallback chain (explicit glyph → inherited entry emblem → null),
 * resolving through `ctx.resolveGlyph`, which consults the emblems collection then icons.
 */

import { openImagePicker } from './imagePicker.js';
import { notFoundImage } from '../schema/notFoundImage.js';

/** Fallback pin/stroke color when a marker has none and the field declares no palette. */
const DEFAULT_COLOR = '#f59e0b';

/** Neutral default labels for freshly drawn shapes (no world-specific copy). Pins start blank —
 *  the inspector (label / association) opens on drop, so there's nothing to pre-fill. */
const NEUTRAL_LABELS = { road: 'Road', territory: 'Area' };

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The canonical empty map value. */
export function emptyMapValue() {
  return { mapImageId: '', waypoints: [], roads: [], territories: [] };
}

/** Coerce any stored/partial value into the full map shape (arrays guaranteed). */
export function normalizeMapValue(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    mapImageId: typeof v.mapImageId === 'string' ? v.mapImageId : '',
    waypoints: Array.isArray(v.waypoints) ? v.waypoints : [],
    roads: Array.isArray(v.roads) ? v.roads : [],
    territories: Array.isArray(v.territories) ? v.territories : [],
  };
}

/** A marker's color: its own → the field's first palette swatch → a neutral default. */
export function markerColor(marker, field) {
  return (marker && marker.color) || field?.palette?.[0] || DEFAULT_COLOR;
}

/**
 * A marker's display label under the field's association mode. The referenced entry's title
 * wins in `reference` mode (even over a stale free-text label); in `both` an explicit label wins and
 * a bare marker falls back to the entry title; `label` mode ignores refs entirely. Resolution needs
 * `ctx.resolveRef` — without it (the ctx-free read paint), the stored `label` stands in, which is why
 * `renderMapRead` bakes the resolved title into `label` before serializing.
 */
export function markerLabel(marker, field, ctx) {
  const assoc = field?.association || {};
  const mode = assoc.mode || 'both';
  const refTitle = () =>
    marker && marker.ref && mode !== 'label' && ctx?.resolveRef
      ? ctx.resolveRef(assoc.refType, marker.ref).label
      : '';
  if (mode === 'reference') return refTitle() || (marker && marker.label) || '';
  return (marker && marker.label) || refTitle();
}

/**
 * A marker's on-map glyph as an SVG string, or `null`. The fallback chain:
 *   1. `marker.glyph`  → `ctx.resolveGlyph(marker.glyph)`   — the explicit author choice wins.
 *   2. `marker.ref`    → the referenced entry's `emblem` key → `ctx.resolveGlyph(thatKey)`
 *                        — inherit the linked entry's emblem (a default, not a lock).
 *   3. → `null`        — fall through to the palette color dot.
 * A key that fails to resolve (unknown, or an emblem key before the emblems collection exists) is
 * skipped, not fatal, so the chain always lands on a rendered pin. Pure over `ctx` — unit-tested.
 */
export function resolveMarkerGlyph(marker, field, ctx) {
  if (!marker || !ctx || !ctx.resolveGlyph) return null;
  if (marker.glyph) {
    const svg = ctx.resolveGlyph(marker.glyph);
    if (svg) return svg;
  }
  const assoc = field?.association || {};
  const mode = assoc.mode || 'both';
  if (marker.ref && mode !== 'label' && ctx.resolveRef) {
    const emblemKey = ctx.resolveRef(assoc.refType, marker.ref)?.emblem;
    if (emblemKey) {
      const svg = ctx.resolveGlyph(emblemKey);
      if (svg) return svg;
    }
  }
  return null;
}

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return `rgba(245, 158, 11, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Perpendicular distance² from point p to the segment a→b (a zero-length segment → distance to a). */
function segDistSq(p, a, b) {
  let x = a.x;
  let y = a.y;
  let dx = b.x - x;
  let dy = b.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b.x;
      y = b.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}

/**
 * Douglas–Peucker simplification: thin a freehand point stream down to the corners
 * that carry the shape, so a dragged road/territory persists as a handful of points, not the raw
 * mouse trail. Pure and unit-tested. `tolerance` is the max allowed deviation (image-space px);
 * callers divide by `scale` so it stays a constant on-screen tolerance regardless of zoom.
 */
export function simplifyPoints(points, tolerance = 2) {
  if (!Array.isArray(points) || points.length <= 2) return Array.isArray(points) ? points.slice() : [];
  const sqTol = tolerance * tolerance;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDistSq(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > sqTol && index !== -1) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * HTML for one static pin marker, centered at screen (sx, sy). The pin wears its glyph when
 * one resolves, else a palette-colored dot. `glyph` may be passed pre-resolved (the ctx-free
 * read paint bakes it in `renderMapRead`); otherwise it resolves live through `ctx`. Icon glyphs are
 * `currentColor`, so the marker color tints them; emblems carry their own fills and ignore it. The
 * glyph SVG comes from our own icon/emblem registry (same trust as the nav's `getIcon`), so it is
 * injected unescaped like every other glyph in the app.
 */
function pinMarkup(wp, field, sx, sy, ctx, glyph) {
  const color = markerColor(wp, field);
  const text = markerLabel(wp, field, ctx);
  const label = text ? `<span class="map-pin-label">${escapeAttr(text)}</span>` : '';
  const g = glyph !== undefined ? glyph : resolveMarkerGlyph(wp, field, ctx);
  const marker = g
    ? `<span class="map-pin-glyph" style="color:${escapeAttr(color)};">${g}</span>`
    : `<span class="map-pin-dot" style="background:${escapeAttr(color)};"></span>`;
  return (
    `<div class="map-pin" data-pin-id="${escapeAttr(wp.id)}" style="left:${sx}px; top:${sy}px;">` +
    `${marker}${label}</div>`
  );
}

// ── Drawing (shared by the input canvas and the read paint) ──────────────────

/**
 * Paint the vector scene (roads + territories) onto a 2D context under a viewport transform. Pure
 * over its inputs (no module state); `extra.currentPoints` is the in-progress freehand/vertex path
 * (input only). Waypoints are NOT painted here — they live in the DOM pin overlay.
 */
function drawScene(c, data, transform, field, extra) {
  const canvas = c.canvas;
  c.save();
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.translate(transform.panX, transform.panY);
  c.scale(transform.scale, transform.scale);

  for (const ter of data.territories) {
    if (!ter.points || ter.points.length < 3) continue;
    c.beginPath();
    c.moveTo(ter.points[0].x, ter.points[0].y);
    for (let i = 1; i < ter.points.length; i++) c.lineTo(ter.points[i].x, ter.points[i].y);
    c.closePath();
    const color = markerColor(ter, field);
    c.fillStyle = hexToRgba(color, 0.25);
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.stroke();
  }

  for (const rd of data.roads) {
    if (!rd.points || rd.points.length < 2) continue;
    c.beginPath();
    c.moveTo(rd.points[0].x, rd.points[0].y);
    for (let i = 1; i < rd.points.length; i++) c.lineTo(rd.points[i].x, rd.points[i].y);
    c.strokeStyle = markerColor(rd, field);
    c.lineWidth = 3;
    c.setLineDash([6, 4]);
    c.stroke();
    c.setLineDash([]);
  }

  const pending = extra?.currentPoints || [];
  if (pending.length > 0) {
    c.beginPath();
    c.moveTo(pending[0].x, pending[0].y);
    for (let i = 1; i < pending.length; i++) c.lineTo(pending[i].x, pending[i].y);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.setLineDash([3, 3]);
    c.stroke();
    c.setLineDash([]);
  }

  c.restore();
}

// ── Render sides ─────────────────────────────────────────────────────────────

/** Authoring surface: toolbar + backdrop/canvas wrapper + inspector. Root carries data-field-key. */
export function renderMapInput(field, value, ctx) {
  const v = normalizeMapValue(value);
  const label = field?.label || 'Map';
  const src = v.mapImageId && ctx?.resolveImage ? ctx.resolveImage(v.mapImageId) || '' : '';
  const lbl = 'style="font-size:11px; color:var(--text-muted);"';
  return `
    <div class="form-section map-container" data-field-key="${escapeAttr(field.key)}">
      <div class="section-header">${escapeAttr(label)}</div>
      <div class="map-toolbar">
        <div class="tool-group">
          <label ${lbl}>Tool</label>
          <button type="button" class="btn btn-primary btn-sm" data-map-tool="select">Select</button>
          <button type="button" class="btn btn-secondary btn-sm" data-map-tool="waypoint">Pin</button>
          <button type="button" class="btn btn-secondary btn-sm" data-map-tool="road">Road</button>
          <button type="button" class="btn btn-secondary btn-sm" data-map-tool="territory">Area</button>
        </div>
        <div class="tool-group">
          <label ${lbl}>Draw</label>
          <button type="button" class="btn btn-secondary btn-sm" data-map-action="toggle-draw-mode">Freehand</button>
        </div>
        <div class="tool-group" style="margin-left:auto;">
          <button type="button" class="btn btn-secondary btn-sm" data-map-action="choose-image">Choose map image</button>
        </div>
        <div class="tool-group">
          <label ${lbl}>Zoom</label>
          <button type="button" class="btn btn-secondary btn-sm" data-map-action="zoom-in">＋</button>
          <button type="button" class="btn btn-secondary btn-sm" data-map-action="zoom-out">－</button>
          <button type="button" class="btn btn-secondary btn-sm" data-map-action="zoom-reset">Reset</button>
        </div>
      </div>
      <div class="map-wrapper">
        <img class="map-bg-img" src="${escapeAttr(src)}" alt="${escapeAttr(label)}">
        <canvas class="map-canvas-overlay"></canvas>
        <div class="map-pin-layer"></div>
      </div>
      <div class="map-hint" ${lbl}>Shift-drag to pan · scroll to zoom · Freehand: drag to draw · Vertex: click corners, double-click to finish</div>
      <div class="form-section map-inspector hidden" style="margin-top:12px; background:rgba(0,0,0,0.4);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <strong class="map-inspector-title" style="color:var(--accent-gold); font-size:13px;">Selected</strong>
          <button type="button" class="btn btn-secondary btn-sm" data-map-action="delete" style="color:var(--accent-crimson);">Delete</button>
        </div>
        <div class="form-grid">
          <div class="form-group map-inspector-name-group">
            <label>Name / Label</label>
            <input type="text" class="form-control map-inspector-name" placeholder="Label">
          </div>
          <div class="form-group map-inspector-assoc-group hidden">
            <label>Linked entry</label>
            <select class="form-control map-inspector-assoc"></select>
          </div>
          <div class="form-group map-inspector-glyph-group">
            <label>Glyph</label>
            <div class="map-glyph-row">
              <select class="form-control map-inspector-glyph"></select>
              <span class="map-inspector-glyph-preview" aria-hidden="true"></span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * Read-only map: backdrop + a static canvas. The value is serialized into `data-map-value` (and
 * the field palette into `data-map-palette`) so `initMapReadCanvases` can paint it self-contained,
 * with no data threading. Empty maps render nothing (like an unset hero).
 */
export function renderMapRead(field, value, ctx) {
  const v = normalizeMapValue(value);
  const hasContent = v.mapImageId || v.waypoints.length || v.roads.length || v.territories.length;
  if (!hasContent) return '';
  const label = field?.label || 'Map';
  const url = v.mapImageId && ctx?.resolveImage ? ctx.resolveImage(v.mapImageId) : '';
  // A set-but-unresolved background (removed/archived image) degrades to the shared not-found
  // frame — mirrors hero, so the map never leaves a broken <img> — with the canvas/pins still
  // painting on top. An unset background keeps the black wrapper (a blank img over #000).
  const bg =
    v.mapImageId && !url
      ? notFoundImage('image-missing-map')
      : `<img class="map-bg-img" src="${escapeAttr(url)}" alt="${escapeAttr(label)}">`;
  const palette = field?.palette ? ` data-map-palette="${escapeAttr(JSON.stringify(field.palette))}"` : '';
  // Resolve reference labels + glyphs here (the paint pass has no ctx): bake each waypoint's display
  // title into `label` and its resolved glyph SVG into `glyphSvg` so `initMapReadCanvases` can render
  // it self-contained (markerLabel + resolveMarkerGlyph). `glyphSvg:''` means "no glyph".
  const resolved = {
    ...v,
    waypoints: v.waypoints.map((wp) => ({
      ...wp,
      label: markerLabel(wp, field, ctx),
      glyphSvg: resolveMarkerGlyph(wp, field, ctx) || '',
    })),
  };
  return `<div class="map-wrapper map-read" data-map-value="${escapeAttr(JSON.stringify(resolved))}"${palette}>
      ${bg}
      <canvas class="map-canvas-overlay"></canvas>
      <div class="map-pin-layer"></div>
    </div>`;
}

/**
 * Post-render paint pass for read-view maps (mirrors `initCarousel`): find every `.map-read`
 * wrapper under `root`, parse its embedded value, and statically paint the canvas. Called after
 * the read HTML is in the DOM (main.js `refreshBuilderPreview`).
 */
export function initMapReadCanvases(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.map-read').forEach((wrap) => paintReadMap(wrap, false));
}

// Paint one read-view map. The wrapper is often 0-sized at paint time (its panel is still
// laid out or made visible immediately after — e.g. the read↔edit toggle flips chrome right
// after the preview refresh), which would bake a blank 0×0 canvas. When unsized, defer one
// task so layout can settle, then paint. One retry only, so a genuinely hidden map never loops.
function paintReadMap(wrap, retried) {
  const canvas = wrap.querySelector('.map-canvas-overlay');
  if (!canvas) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (!w || !h) {
    if (!retried) setTimeout(() => paintReadMap(wrap, true), 0);
    return;
  }
  let data;
  let palette;
  try {
    data = normalizeMapValue(JSON.parse(wrap.dataset.mapValue || '{}'));
  } catch {
    data = emptyMapValue();
  }
  try {
    palette = wrap.dataset.mapPalette ? JSON.parse(wrap.dataset.mapPalette) : undefined;
  } catch {
    palette = undefined;
  }
  canvas.width = w;
  canvas.height = h;
  drawScene(canvas.getContext('2d'), data, { scale: 1, panX: 0, panY: 0 }, { palette }, null);
  // Static pin overlay: read view isn't pan/zoomed, so screen coords == image coords.
  const layer = wrap.querySelector('.map-pin-layer');
  // Labels + glyphs were baked into the value by renderMapRead (no ctx here); pass the baked glyph.
  if (layer) {
    layer.innerHTML = data.waypoints
      .map((wp) => pinMarkup(wp, { palette }, wp.x, wp.y, undefined, wp.glyphSvg || ''))
      .join('');
  }
}

// ── Imperative wiring ────────────────────────────────────────────────────────

/** Open the shared image picker, honoring the ctx-supplied list + editor affordances. */
function pickImage(ctx) {
  return openImagePicker(ctx?.listImages ? ctx.listImages() : [], ctx?.pickerOptions || {});
}

// Freehand tuning. MIN_POINT_DIST is the on-screen gap (px) below which a dragged point is dropped
// so a stroke doesn't store thousands of near-duplicates; SIMPLIFY_TOLERANCE is the Douglas–Peucker
// deviation (px) applied on commit. Both are screen-space and divided by `scale` before use so they
// behave the same at any zoom.
const MIN_POINT_DIST = 4;
const SIMPLIFY_TOLERANCE = 2;

/**
 * Wire the authoring surface: pan/zoom, tool switching, waypoint drop (DOM pin overlay), freehand /
 * vertex road+territory drawing with point simplification, selection + label edit + delete, and the
 * map-image chooser. Reports the whole value object back through `onChange` on every commit — the
 * single value path.
 */
export function mountMap(el, { field, value, onChange, ctx }) {
  const canvas = el.querySelector('.map-canvas-overlay');
  const wrapper = el.querySelector('.map-wrapper');
  const bgImg = el.querySelector('.map-bg-img');
  const pinLayer = el.querySelector('.map-pin-layer');
  if (!canvas || !wrapper) return;
  const c = canvas.getContext('2d');

  const v = normalizeMapValue(value);
  let mapImageId = v.mapImageId;
  const waypoints = v.waypoints.map((w) => ({ ...w }));
  const roads = v.roads.map((r) => ({ ...r }));
  const territories = v.territories.map((t) => ({ ...t }));

  // Viewport transform (ephemeral — never persisted).
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  let activeTool = 'select';
  let drawMode = 'freehand'; // 'freehand' (drag) | 'vertex' (click corners)
  let currentPoints = [];
  let isDrawing = false; // a freehand drag is in progress
  let selected = null; // { list, obj } for the selected marker

  // Stable, collision-free ids even for rapid clicks (Date.now() alone can repeat within a ms).
  let idSeq = Date.now();
  const genId = () => String(idSeq++);

  const toScreenX = (ix) => ix * scale + panX;
  const toScreenY = (iy) => iy * scale + panY;

  function buildValue() {
    return { mapImageId, waypoints, roads, territories };
  }
  function commit() {
    onChange(buildValue());
  }
  // Rebuild the DOM pin overlay from the waypoint set (structural changes: drop/delete/label/select).
  function renderPins() {
    if (!pinLayer) return;
    pinLayer.innerHTML = waypoints
      .map((wp) => pinMarkup(wp, field, toScreenX(wp.x), toScreenY(wp.y), ctx))
      .join('');
    if (selected && selected.list === waypoints) {
      pinLayer.querySelectorAll('.map-pin').forEach((p) => {
        if (String(selected.obj.id) === p.dataset.pinId) p.classList.add('selected');
      });
    }
  }
  // Reposition existing pins to the current transform (cheap; runs alongside every canvas redraw).
  function positionPins() {
    if (!pinLayer) return;
    pinLayer.querySelectorAll('.map-pin').forEach((p) => {
      const wp = waypoints.find((w) => String(w.id) === p.dataset.pinId);
      if (!wp) return;
      p.style.left = `${toScreenX(wp.x)}px`;
      p.style.top = `${toScreenY(wp.y)}px`;
    });
  }
  function redraw() {
    drawScene(c, { waypoints, roads, territories }, { scale, panX, panY }, field, { currentPoints });
    positionPins();
  }

  // The form often mounts before the wrapper is laid out (0×0 at mount) and can be resized later.
  // Match the canvas backing store to the wrapper and repaint whenever the box changes. We size on
  // three signals so no single one is load-bearing: immediately (covers an already-laid-out mount),
  // on the next task (covers layout landing just after mount), and via ResizeObserver (covers later
  // resizes). Note RO delivery is tied to the render lifecycle, so the setTimeout is the reliable
  // fallback when frames aren't being produced.
  function syncSize() {
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    if (!w || !h || (w === canvas.width && h === canvas.height)) return;
    canvas.width = w;
    canvas.height = h;
    redraw();
  }
  syncSize();
  setTimeout(syncSize, 0);
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncSize).observe(wrapper);

  const inspector = el.querySelector('.map-inspector');
  const nameInput = el.querySelector('.map-inspector-name');

  // Association picker: shown only when the field's mode allows a reference. The mode is
  // fixed per field, so the label/picker visibility is set once at mount; the options come from
  // ctx.listEntries(refType). A marker's ref rides `selected.obj.ref`.
  const assoc = field?.association || {};
  const assocMode = assoc.mode || 'both';
  const refType = assoc.refType || '';
  const allowsRef = assocMode !== 'label' && !!refType;
  const assocSelect = el.querySelector('.map-inspector-assoc');
  const assocGroup = el.querySelector('.map-inspector-assoc-group');
  const nameGroup = el.querySelector('.map-inspector-name-group');
  if (assocGroup) assocGroup.classList.toggle('hidden', !allowsRef);
  // In pure `reference` mode the display label comes from the entry, so hide the free-text label.
  if (nameGroup) nameGroup.classList.toggle('hidden', assocMode === 'reference');
  if (allowsRef && assocSelect) {
    const entries = ctx?.listEntries ? ctx.listEntries(refType) : [];
    assocSelect.innerHTML = ['<option value="">— none —</option>']
      .concat(entries.map((e) => `<option value="${escapeAttr(e.id)}">${escapeAttr(e.label)}</option>`))
      .join('');
  }
  // Reflect a marker's stored ref into the picker, carrying an unlisted id (deleted/archived, or a
  // type with no entries) as an "(unavailable)" option so the stored value survives edit → save.
  function syncAssoc(obj) {
    if (!allowsRef || !assocSelect) return;
    const id = obj.ref || '';
    if (id && !Array.from(assocSelect.options).some((o) => o.value === id)) {
      const label = ctx?.resolveRef ? ctx.resolveRef(refType, id).label : id;
      assocSelect.insertAdjacentHTML(
        'beforeend',
        `<option value="${escapeAttr(id)}">${escapeAttr(label)} (unavailable)</option>`
      );
    }
    assocSelect.value = id;
  }

  // Glyph picker: the marker's on-map emblem/icon. Options come from ctx.listGlyphs()
  // (emblems + icons); "— dot —" clears the glyph so the pin falls back to its palette color.
  // A marker's glyph rides `selected.obj.glyph`.
  const glyphSelect = el.querySelector('.map-inspector-glyph');
  const glyphPreview = el.querySelector('.map-inspector-glyph-preview');
  const glyphs = ctx?.listGlyphs ? ctx.listGlyphs() : [];
  if (glyphSelect) {
    glyphSelect.innerHTML = ['<option value="">— dot —</option>']
      .concat(glyphs.map((g) => `<option value="${escapeAttr(g.key)}">${escapeAttr(g.key)}</option>`))
      .join('');
  }
  function updateGlyphPreview(obj) {
    if (glyphPreview) glyphPreview.innerHTML = resolveMarkerGlyph(obj, field, ctx) || '';
  }
  // Reflect a marker's glyph into the picker, carrying an unlisted key (a glyph since removed, or an
  // emblem key before the emblems collection exists) as an "(unavailable)" option so it survives edit.
  function syncGlyph(obj) {
    if (glyphSelect) {
      const key = obj.glyph || '';
      if (key && !Array.from(glyphSelect.options).some((o) => o.value === key)) {
        glyphSelect.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(key)}">${escapeAttr(key)} (unavailable)</option>`);
      }
      glyphSelect.value = key;
    }
    updateGlyphPreview(obj);
  }

  function openInspector(obj) {
    if (!inspector) return;
    inspector.classList.remove('hidden');
    if (nameInput) nameInput.value = obj.label || '';
    syncAssoc(obj);
    syncGlyph(obj);
  }
  function closeInspector() {
    inspector?.classList.add('hidden');
    selected = null;
  }
  nameInput?.addEventListener('input', () => {
    if (!selected) return;
    selected.obj.label = nameInput.value;
    commit();
    if (selected.list === waypoints) renderPins();
    else redraw();
  });
  // Linking a marker to an entry: store (or clear) its ref and repaint — in reference/both mode the
  // pin's label re-resolves to the entry title through markerLabel. When the marker wears no explicit
  // glyph, inherit the linked entry's emblem as a default — a pre-fill, not a lock; the author
  // can still change it. (No entry carries an emblem yet, so this is dormant until that lands.)
  assocSelect?.addEventListener('change', () => {
    if (!selected) return;
    selected.obj.ref = assocSelect.value || undefined;
    if (!selected.obj.glyph && selected.obj.ref && ctx?.resolveRef) {
      const emblem = ctx.resolveRef(refType, selected.obj.ref).emblem;
      if (emblem) {
        selected.obj.glyph = emblem;
        syncGlyph(selected.obj);
      }
    }
    commit();
    if (selected.list === waypoints) renderPins();
    else redraw();
  });
  // Choosing a glyph: store (or clear) its key and repaint the pin.
  glyphSelect?.addEventListener('change', () => {
    if (!selected) return;
    selected.obj.glyph = glyphSelect.value || undefined;
    updateGlyphPreview(selected.obj);
    commit();
    if (selected.list === waypoints) renderPins();
    else redraw();
  });

  // Pin selection is native DOM: a click on a pin element opens its inspector regardless of
  // the active tool. Delegated on the layer so it survives renderPins() rebuilds.
  pinLayer?.addEventListener('click', (e) => {
    const pinEl = e.target.closest('.map-pin');
    if (!pinEl) return;
    const wp = waypoints.find((w) => String(w.id) === pinEl.dataset.pinId);
    if (!wp) return;
    selected = { list: waypoints, obj: wp };
    openInspector(wp);
    renderPins();
  });

  // Tool buttons.
  el.querySelectorAll('[data-map-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.mapTool;
      // Leaving a drawing tool with a pending shape commits it.
      if (next !== activeTool && (activeTool === 'road' || activeTool === 'territory')) commitShape();
      activeTool = next;
      el.querySelectorAll('[data-map-tool]').forEach((b) => {
        b.classList.toggle('btn-primary', b === btn);
        b.classList.toggle('btn-secondary', b !== btn);
      });
    });
  });

  // Draw-mode toggle: freehand drag (default) ⇄ click-per-vertex precision. Switching commits
  // any pending vertex path so a half-drawn shape isn't stranded across modes.
  const drawModeBtn = el.querySelector('[data-map-action="toggle-draw-mode"]');
  drawModeBtn?.addEventListener('click', () => {
    if (currentPoints.length) commitShape();
    drawMode = drawMode === 'freehand' ? 'vertex' : 'freehand';
    drawModeBtn.textContent = drawMode === 'freehand' ? 'Freehand' : 'Vertex';
  });

  // Zoom controls + wheel.
  const zoom = (factor) => {
    scale = Math.min(Math.max(0.5, scale * factor), 4);
    redraw();
  };
  el.querySelector('[data-map-action="zoom-in"]')?.addEventListener('click', () => zoom(1.2));
  el.querySelector('[data-map-action="zoom-out"]')?.addEventListener('click', () => zoom(0.8));
  el.querySelector('[data-map-action="zoom-reset"]')?.addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    redraw();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.1 : 0.9);
  });

  // Map-image chooser (hero-style picker button).
  el.querySelector('[data-map-action="choose-image"]')?.addEventListener('click', async () => {
    const id = await pickImage(ctx);
    if (!id) return;
    mapImageId = id;
    if (bgImg) bgImg.src = (ctx?.resolveImage && ctx.resolveImage(id)) || '';
    commit();
  });

  // Delete the selected marker.
  el.querySelector('[data-map-action="delete"]')?.addEventListener('click', () => {
    if (!selected) return;
    const wasWaypoint = selected.list === waypoints;
    const i = selected.list.indexOf(selected.obj);
    if (i >= 0) selected.list.splice(i, 1);
    closeInspector();
    commit();
    if (wasWaypoint) renderPins();
    redraw();
  });

  // Commit the in-progress road/territory. Freehand strokes are simplified at a constant
  // on-screen tolerance; vertex-clicked paths are already sparse, so they're kept verbatim.
  function commitShape() {
    let pts = currentPoints;
    currentPoints = [];
    isDrawing = false;
    if (pts.length < 2) {
      redraw();
      return;
    }
    if (drawMode === 'freehand') pts = simplifyPoints(pts, SIMPLIFY_TOLERANCE / scale);
    if (activeTool === 'road') {
      roads.push({ id: genId(), kind: 'road', points: pts, label: NEUTRAL_LABELS.road, color: markerColor(null, field) });
    } else if (activeTool === 'territory') {
      territories.push({ id: genId(), kind: 'territory', points: pts, label: NEUTRAL_LABELS.territory, color: markerColor(null, field) });
    }
    commit();
    redraw();
  }

  // Image-space coordinate of a pointer event.
  const eventPoint = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panX) / scale,
      y: (e.clientY - rect.top - panY) / scale,
    };
  };

  canvas.addEventListener('mousedown', (e) => {
    // Shift- or middle-drag pans, in any tool.
    if (e.button === 1 || e.shiftKey) {
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      return;
    }

    const { x, y } = eventPoint(e);

    if (activeTool === 'waypoint') {
      // Drop the pin and open the inspector for label / association — no blocking prompt.
      const wp = { id: genId(), kind: 'waypoint', x, y, label: '', color: markerColor(null, field) };
      waypoints.push(wp);
      selected = { list: waypoints, obj: wp };
      commit();
      renderPins();
      openInspector(wp);
    } else if (activeTool === 'road' || activeTool === 'territory') {
      if (drawMode === 'freehand') {
        // Start a drag stroke; mousemove appends, mouseup commits.
        isDrawing = true;
        currentPoints = [{ x, y }];
        redraw();
      } else {
        // Vertex mode: each click drops a corner; double-click / tool switch finishes.
        currentPoints.push({ x, y });
        redraw();
      }
    } else if (activeTool === 'select') {
      // Pins select via the DOM overlay; an empty-canvas click clears the selection.
      closeInspector();
      renderPins();
    }
  });

  canvas.addEventListener('dblclick', () => {
    if (drawMode === 'vertex' && currentPoints.length > 1) commitShape();
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      redraw();
      return;
    }
    if (isDrawing && drawMode === 'freehand') {
      const { x, y } = eventPoint(e);
      const last = currentPoints[currentPoints.length - 1];
      // Distance-filter in screen space so the sampling density is zoom-independent.
      const dxs = (x - last.x) * scale;
      const dys = (y - last.y) * scale;
      if (dxs * dxs + dys * dys >= MIN_POINT_DIST * MIN_POINT_DIST) {
        currentPoints.push({ x, y });
        redraw();
      }
    }
  });
  const endStroke = () => {
    if (isPanning) {
      isPanning = false;
      return;
    }
    if (isDrawing) commitShape();
  };
  canvas.addEventListener('mouseup', endStroke);
  // A drag that leaves the canvas still commits, so a stroke never gets stuck mid-draw.
  canvas.addEventListener('mouseleave', endStroke);

  renderPins();
  redraw();
}
