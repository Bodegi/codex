/**
 * Codex — Banner component.
 *
 * The registered `banner` field kind: design a Minecraft-style heraldic banner — a base dye plus an
 * ordered stack of up to `MAX_LAYERS` pattern layers (each a pattern + a dye). Registered in
 * `fieldKinds.js` as a `layout:'break'` component with `selfRender:true`; its value rides the entry
 * doc on `data[field.key]` and saves / versions / subscribes with every other field.
 *
 *   value = { base: <dyeId>, layers: [ { pattern: <patternId>, color: <dyeId> } ] }
 *
 * All banner logic (the dyes, the extracted pattern masks, compose, recipe, normalize, validate)
 * lives in the pure, Node-tested `schema/bannerModel.js`; this module is only the browser DOM around
 * it. `selfRender` (read by main.js `wireComponentMounts`): the designer re-paints its own subtree on
 * every edit and persists through `onChange`, which refreshes just the read preview — a full form
 * rebuild per swatch click would be needless churn.
 *
 * The read view is pure string output (no canvas, unlike map): the composed banner SVG plus a native
 * `<details>` build recipe, collapsed by default, listing the base and each layer in loom order.
 * Imports cleanly under Node; `mountBanner` is browser-only.
 */

import { escapeHtml } from '../schema/inlineText.js';
import {
  DYE_COLORS,
  PATTERNS,
  MAX_LAYERS,
  patternList,
  normalizeBanner,
  isEmptyBanner,
  bannerToSvg,
  bannerToRecipe,
} from '../schema/bannerModel.js';

/** A row of 16 dye swatch buttons; the one matching `selectedId` is flagged selected. */
function swatchRow(selectedId, act) {
  return DYE_COLORS.map((d) => {
    const on = d.id === selectedId;
    return `<button type="button" class="banner-swatch${on ? ' is-selected' : ''}" data-act="${act}" data-color="${d.id}" title="${escapeHtml(d.name)}" aria-label="${escapeHtml(d.name)}" aria-pressed="${on}" style="background:${d.hex}"></button>`;
  }).join('');
}

const dyeHex = (id) => (DYE_COLORS.find((d) => d.id === id) || DYE_COLORS[0]).hex;

// Shape-only pattern thumbnails (white on black) are the expensive bit to compose, and the same 42
// recur on every re-paint, so cache each by id. The grid markup that references them is cheap.
const _thumbCache = new Map();
function patternThumb(patternId) {
  if (!_thumbCache.has(patternId)) {
    _thumbCache.set(patternId, bannerToSvg({ base: 'black', layers: [{ pattern: patternId, color: 'white' }] }, { className: 'banner-thumb-svg' }));
  }
  return _thumbCache.get(patternId);
}

/** The clickable pattern grid; the button matching `currentId` (this layer's pattern) is gold-flagged. */
function patternGridHtml(currentId) {
  return patternList()
    .map(
      (p) => `<button type="button" class="banner-pat${p.id === currentId ? ' is-selected' : ''}" data-act="pattern" data-pattern="${p.id}" title="${escapeHtml(p.name)}" aria-label="${escapeHtml(p.name)}">${patternThumb(p.id)}</button>`
    )
    .join('');
}

/**
 * One layer card. Collapsed it's a summary (shape thumbnail + name + color dot); expanded (this is
 * the layer being edited) it reveals the color swatches and the full pattern grid, so the long
 * pattern list only shows for the layer you're working on.
 */
function layerCard(layer, i, count, editing) {
  const isEditing = i === editing;
  const name = PATTERNS[layer.pattern]?.name || `${layer.pattern} (unknown)`;
  const edit = isEditing
    ? `<div class="banner-layer-edit">
          <div class="banner-mini-head">Color</div>
          <div class="banner-swatches">${swatchRow(layer.color, 'layer-color')}</div>
          <div class="banner-mini-head">Pattern</div>
          <div class="banner-pattern-grid">${patternGridHtml(layer.pattern)}</div>
        </div>`
    : '';
  return `
    <div class="banner-layer${isEditing ? ' is-editing' : ''}" data-index="${i}">
      <div class="banner-layer-row">
        <button type="button" class="banner-layer-head" data-act="edit" aria-expanded="${isEditing}" title="${isEditing ? 'Collapse' : 'Edit this layer'}">
          <span class="banner-layer-thumb">${patternThumb(layer.pattern)}</span>
          <span class="banner-layer-name">${escapeHtml(name)}</span>
          <span class="banner-layer-dot" style="background:${dyeHex(layer.color)}" aria-hidden="true"></span>
          <span class="banner-layer-caret" aria-hidden="true">${isEditing ? '▾' : '▸'}</span>
        </button>
        <div class="banner-layer-actions">
          <button type="button" data-act="up"${i === 0 ? ' disabled' : ''} title="Move up" aria-label="Move layer up">▲</button>
          <button type="button" data-act="down"${i === count - 1 ? ' disabled' : ''} title="Move down" aria-label="Move layer down">▼</button>
          <button type="button" data-act="remove" title="Remove layer" aria-label="Remove layer">×</button>
        </div>
      </div>
      ${edit}
    </div>`;
}

/**
 * The full designer body: live preview + base swatches + the layer accordion + a distinct Add-layer
 * button. `editing` (a layer index or -1) is the one expanded card whose pattern grid is shown.
 */
export function designerHtml(banner, field, editing) {
  const label = field?.label || 'Banner';
  const cards = banner.layers.map((l, i) => layerCard(l, i, banner.layers.length, editing)).join('');
  const atCap = banner.layers.length >= MAX_LAYERS;
  return `
    <label class="banner-designer-label">${escapeHtml(label)}</label>
    <div class="banner-designer-grid">
      <div class="banner-preview">${bannerToSvg(banner)}</div>
      <div class="banner-controls">
        <div class="banner-section">
          <div class="banner-section-head">Base color</div>
          <div class="banner-swatches">${swatchRow(banner.base, 'base')}</div>
        </div>
        <div class="banner-section">
          <div class="banner-section-head">Layers <span class="muted">(${banner.layers.length}/${MAX_LAYERS}, bottom → top)</span></div>
          <div class="banner-layers">${cards || '<p class="muted">No layers yet.</p>'}</div>
          <button type="button" class="btn btn-secondary btn-sm banner-add" data-act="add"${atCap ? ' disabled' : ''}>＋ Add layer</button>
        </div>
      </div>
    </div>`;
}

/** Builder control: a container the mount fills (and re-paints on every edit). */
export function renderBannerInput(field, value, _ctx) {
  return `<div class="banner-designer" data-field-key="${escapeHtml(field.key)}">${designerHtml(normalizeBanner(value), field, -1)}</div>`;
}

/** Read view: the composed banner + a collapsed build recipe (loom order). Empty value → nothing. */
export function renderBannerRead(field, value, _ctx) {
  if (value == null || typeof value !== 'object') return '';
  const banner = normalizeBanner(value);
  const recipe = bannerToRecipe(banner);
  const dot = (hex) => `<span class="banner-dot" style="background:${hex}"></span>`;
  const layerItems = recipe.layers
    .map((l) => `<li>${dot(l.colorHex)} ${escapeHtml(l.patternName)} — ${escapeHtml(l.colorName)}</li>`)
    .join('');
  const recipeBlock = `
    <details class="banner-recipe">
      <summary>Build recipe</summary>
      <div class="banner-recipe-base">${dot(recipe.base.hex)} Base: ${escapeHtml(recipe.base.name)}</div>
      ${layerItems ? `<ol class="banner-recipe-layers">${layerItems}</ol>` : ''}
    </details>`;
  return `<div class="banner-read"><div class="banner-figure">${bannerToSvg(banner)}</div>${recipeBlock}</div>`;
}

/**
 * Emblem view: just the composed SVG, no recipe — the compact heraldic mark for a summary card
 * (see summaryCard.js). A layerless banner is "empty" here, same as the read view, so an untouched
 * field contributes no lone base rect and the card's emblem slot collapses.
 */
export function renderBannerEmblem(_field, value, _ctx) {
  if (isEmptyBanner(value)) return '';
  return bannerToSvg(value, { className: 'banner-svg summary-emblem-svg' });
}

/** Wire the designer: local banner state, event-delegated edits, re-paint + persist on each change. */
export function mountBanner(el, { field, value, onChange }) {
  const banner = normalizeBanner(value);
  const firstPattern = patternList()[0]?.id;
  let editing = -1; // the one expanded layer, or -1. Ephemeral — never persisted.
  const paint = () => { el.innerHTML = designerHtml(banner, field, editing); };
  const persist = () => onChange({ base: banner.base, layers: banner.layers.map((l) => ({ ...l })) });
  const commit = () => { persist(); paint(); };

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const layerEl = btn.closest('.banner-layer');
    const idx = layerEl ? Number(layerEl.dataset.index) : -1;

    if (act === 'base') { banner.base = btn.dataset.color; commit(); }
    else if (act === 'edit' && idx >= 0) { editing = editing === idx ? -1 : idx; paint(); } // expand/collapse only
    else if (act === 'layer-color' && idx >= 0) { banner.layers[idx].color = btn.dataset.color; commit(); }
    else if (act === 'pattern' && idx >= 0) { banner.layers[idx].pattern = btn.dataset.pattern; commit(); } // stays expanded to keep trying
    else if (act === 'add') {
      if (banner.layers.length >= MAX_LAYERS || !firstPattern) return;
      banner.layers.push({ pattern: firstPattern, color: 'white' });
      editing = banner.layers.length - 1; // open the new layer to pick colour + pattern
      commit();
    } else if (act === 'remove' && idx >= 0) {
      banner.layers.splice(idx, 1);
      editing = editing === idx ? -1 : editing > idx ? editing - 1 : editing;
      commit();
    } else if (act === 'up' && idx > 0) {
      [banner.layers[idx - 1], banner.layers[idx]] = [banner.layers[idx], banner.layers[idx - 1]];
      if (editing === idx) editing = idx - 1; else if (editing === idx - 1) editing = idx;
      commit();
    } else if (act === 'down' && idx >= 0 && idx < banner.layers.length - 1) {
      [banner.layers[idx + 1], banner.layers[idx]] = [banner.layers[idx], banner.layers[idx + 1]];
      if (editing === idx) editing = idx + 1; else if (editing === idx + 1) editing = idx;
      commit();
    }
  });

  paint();
}
