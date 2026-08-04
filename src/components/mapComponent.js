/**
 * Codex — Map component (Wave 3, Axis 1).
 *
 * A registered `map` field kind: load a map image as a backdrop, pan/zoom over it, drop pins,
 * and draw roads / territories on a `<canvas>` overlay. Registered in `fieldKinds.js` as a
 * `layout:'break'` component with `selfRender:true` (see below); its value rides the entry doc
 * on `data[field.key]` and saves / versions / subscribes with every other field — no bespoke
 * Firestore doc (the retired `saveMapData` / `subscribeToMapData` / `atlasDocPath` path).
 *
 *   value = { mapImageId, waypoints, roads, territories }
 *   waypoint  = { id, kind:'waypoint',  x, y,        label, color? }
 *   road      = { id, kind:'road',      points:[{x,y}], label, color? }
 *   territory = { id, kind:'territory', points:[{x,y}], label, color? }
 *
 * All coordinates are in **image space** so a marker stays glued to the map as you pan/zoom.
 *
 * `selfRender` (read by main.js `wireComponentMounts`): unlike hero/gallery — whose `onChange`
 * rebuilds the whole form to refresh their thumbnails — the map owns a live canvas with
 * ephemeral pan/zoom state that a form teardown would reset. So its `onChange` persists the
 * value and refreshes only the read preview; `mount` redraws its own canvas in place.
 *
 * This module imports cleanly under Node (no DOM access at import time) so `fieldKinds.js`
 * stays Node-testable; `mount` / `initMapReadCanvases` are browser-only and never run there.
 * The pure helpers (`emptyMapValue` / `normalizeMapValue` / `markerColor`) are unit-tested.
 *
 * Phase 1 scope: pins are colored dots (palette → default). Phase 2 adds the DOM pin overlay +
 * freehand drawing; Phase 3 the per-field association config + scrub; Phase 4 emblem glyphs.
 */

import { openImagePicker } from './imagePicker.js';

/** Fallback pin/stroke color when a marker has none and the field declares no palette. */
const DEFAULT_COLOR = '#f59e0b';

/** Neutral default labels for freshly drawn shapes (no world-specific copy). */
const NEUTRAL_LABELS = { waypoint: 'Pin', road: 'Road', territory: 'Area' };

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

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return `rgba(245, 158, 11, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ── Drawing (shared by the input canvas and the read paint) ──────────────────

/**
 * Paint the vector scene onto a 2D context under a viewport transform. Pure over its inputs
 * (no module state); `extra.currentPoints` is the in-progress freehand/vertex path (input only).
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

  for (const wp of data.waypoints) {
    const color = markerColor(wp, field);
    c.fillStyle = color;
    c.beginPath();
    c.arc(wp.x, wp.y, 7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.stroke();
    if (wp.label) {
      c.fillStyle = '#ffffff';
      c.font = 'bold 12px Inter';
      c.fillText(wp.label, wp.x + 10, wp.y + 4);
    }
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
      </div>
      <div class="form-section map-inspector hidden" style="margin-top:12px; background:rgba(0,0,0,0.4);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <strong class="map-inspector-title" style="color:var(--accent-gold); font-size:13px;">Selected</strong>
          <button type="button" class="btn btn-secondary btn-sm" data-map-action="delete" style="color:var(--accent-crimson);">Delete</button>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Name / Label</label>
            <input type="text" class="form-control map-inspector-name" placeholder="Label">
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
  const src = v.mapImageId && ctx?.resolveImage ? ctx.resolveImage(v.mapImageId) || '' : '';
  const palette = field?.palette ? ` data-map-palette="${escapeAttr(JSON.stringify(field.palette))}"` : '';
  return `<div class="map-wrapper map-read" data-map-value="${escapeAttr(JSON.stringify(v))}"${palette}>
      <img class="map-bg-img" src="${escapeAttr(src)}" alt="${escapeAttr(label)}">
      <canvas class="map-canvas-overlay"></canvas>
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
}

// ── Imperative wiring ────────────────────────────────────────────────────────

/** Open the shared image picker, honoring the ctx-supplied list + editor affordances. */
function pickImage(ctx) {
  return openImagePicker(ctx?.listImages ? ctx.listImages() : [], ctx?.pickerOptions || {});
}

/**
 * Wire the authoring canvas: pan/zoom, tool switching, waypoint drop, road/territory drawing,
 * selection + label edit + delete, and the map-image chooser. Reports the whole value object
 * back through `onChange` on every commit — the single value path (§2.2 of the composition spec).
 */
export function mountMap(el, { field, value, onChange, ctx }) {
  const canvas = el.querySelector('.map-canvas-overlay');
  const wrapper = el.querySelector('.map-wrapper');
  const bgImg = el.querySelector('.map-bg-img');
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
  let currentPoints = [];
  let selected = null; // { list, obj } for the selected marker

  // Stable, collision-free ids even for rapid clicks (Date.now() alone can repeat within a ms).
  let idSeq = Date.now();
  const genId = () => String(idSeq++);

  function buildValue() {
    return { mapImageId, waypoints, roads, territories };
  }
  function commit() {
    onChange(buildValue());
  }
  function redraw() {
    drawScene(c, { waypoints, roads, territories }, { scale, panX, panY }, field, { currentPoints });
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
  function openInspector(obj) {
    if (!inspector) return;
    inspector.classList.remove('hidden');
    if (nameInput) nameInput.value = obj.label || '';
  }
  function closeInspector() {
    inspector?.classList.add('hidden');
    selected = null;
  }
  nameInput?.addEventListener('input', () => {
    if (!selected) return;
    selected.obj.label = nameInput.value;
    commit();
    redraw();
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
    const i = selected.list.indexOf(selected.obj);
    if (i >= 0) selected.list.splice(i, 1);
    closeInspector();
    commit();
    redraw();
  });

  function commitShape() {
    if (currentPoints.length < 2) {
      currentPoints = [];
      return;
    }
    if (activeTool === 'road') {
      roads.push({ id: genId(), kind: 'road', points: currentPoints.slice(), label: NEUTRAL_LABELS.road, color: markerColor(null, field) });
    } else if (activeTool === 'territory') {
      territories.push({ id: genId(), kind: 'territory', points: currentPoints.slice(), label: NEUTRAL_LABELS.territory, color: markerColor(null, field) });
    }
    currentPoints = [];
    commit();
    redraw();
  }

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panX) / scale;
    const y = (e.clientY - rect.top - panY) / scale;

    if (e.button === 1 || e.shiftKey) {
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      return;
    }

    if (activeTool === 'waypoint') {
      const label = prompt('Pin label:', NEUTRAL_LABELS.waypoint);
      if (label != null) {
        waypoints.push({ id: genId(), kind: 'waypoint', x, y, label, color: markerColor(null, field) });
        commit();
        redraw();
      }
    } else if (activeTool === 'road' || activeTool === 'territory') {
      currentPoints.push({ x, y });
      redraw();
    } else if (activeTool === 'select') {
      const hit = waypoints.find((w) => Math.hypot(w.x - x, w.y - y) < 12);
      if (hit) {
        selected = { list: waypoints, obj: hit };
        openInspector(hit);
      } else {
        closeInspector();
      }
    }
  });

  canvas.addEventListener('dblclick', () => {
    if (currentPoints.length > 1) commitShape();
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    redraw();
  });
  canvas.addEventListener('mouseup', () => {
    isPanning = false;
  });

  redraw();
}
