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

/** The pattern <select> options, carrying an unknown (newer-version) id as a selected fallback. */
function patternOptions(currentId) {
  const opts = patternList().map(
    (p) => `<option value="${p.id}"${p.id === currentId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
  );
  if (currentId && !PATTERNS[currentId]) {
    opts.unshift(`<option value="${escapeHtml(currentId)}" selected>${escapeHtml(currentId)} (unknown)</option>`);
  }
  return opts.join('');
}

/** The full designer body (label + live preview + base swatches + layer editor) for a banner value. */
function designerHtml(banner, field) {
  const label = field?.label || 'Banner';
  const layers = banner.layers
    .map(
      (l, i) => `
      <div class="banner-layer" data-index="${i}">
        <div class="banner-layer-top">
          <select class="form-control banner-pattern" data-act="pattern" aria-label="Layer ${i + 1} pattern">${patternOptions(l.pattern)}</select>
          <div class="banner-layer-actions">
            <button type="button" data-act="up"${i === 0 ? ' disabled' : ''} title="Move up" aria-label="Move layer up">▲</button>
            <button type="button" data-act="down"${i === banner.layers.length - 1 ? ' disabled' : ''} title="Move down" aria-label="Move layer down">▼</button>
            <button type="button" data-act="remove" title="Remove layer" aria-label="Remove layer">×</button>
          </div>
        </div>
        <div class="banner-swatches">${swatchRow(l.color, 'layer-color')}</div>
      </div>`
    )
    .join('');
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
          <div class="banner-layers">${layers || '<p class="muted">No layers yet — add one below.</p>'}</div>
          <button type="button" class="btn btn-secondary btn-sm" data-act="add"${atCap ? ' disabled' : ''}>＋ Add layer</button>
        </div>
      </div>
    </div>`;
}

/** Builder control: a container the mount fills (and re-paints on every edit). */
export function renderBannerInput(field, value, _ctx) {
  return `<div class="banner-designer" data-field-key="${escapeHtml(field.key)}">${designerHtml(normalizeBanner(value), field)}</div>`;
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

/** Wire the designer: local banner state, event-delegated edits, re-paint + persist on each change. */
export function mountBanner(el, { field, value, onChange }) {
  const banner = normalizeBanner(value);
  const firstPattern = patternList()[0]?.id;
  const paint = () => { el.innerHTML = designerHtml(banner, field); };
  const commit = () => {
    onChange({ base: banner.base, layers: banner.layers.map((l) => ({ ...l })) });
    paint();
  };

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const layerEl = btn.closest('.banner-layer');
    const idx = layerEl ? Number(layerEl.dataset.index) : -1;
    if (act === 'base') banner.base = btn.dataset.color;
    else if (act === 'layer-color' && idx >= 0) banner.layers[idx].color = btn.dataset.color;
    else if (act === 'add') {
      if (banner.layers.length >= MAX_LAYERS || !firstPattern) return;
      banner.layers.push({ pattern: firstPattern, color: 'white' });
    } else if (act === 'remove' && idx >= 0) banner.layers.splice(idx, 1);
    else if (act === 'up' && idx > 0) [banner.layers[idx - 1], banner.layers[idx]] = [banner.layers[idx], banner.layers[idx - 1]];
    else if (act === 'down' && idx >= 0 && idx < banner.layers.length - 1) [banner.layers[idx + 1], banner.layers[idx]] = [banner.layers[idx], banner.layers[idx + 1]];
    else return;
    commit();
  });

  el.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-act="pattern"]');
    if (!sel) return;
    const idx = Number(sel.closest('.banner-layer').dataset.index);
    if (idx >= 0 && banner.layers[idx]) { banner.layers[idx].pattern = sel.value; commit(); }
  });

  paint();
}
