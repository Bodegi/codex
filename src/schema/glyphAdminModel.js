/**
 * Codex — Glyph admin-panel shaping (pure).
 *
 * The decisions behind the Admin › Icons and Admin › Emblems panels and the shared glyph
 * designer, lifted out of `main.js` so they're Node-testable. This module shapes *data*: what
 * rows the panels render, what params open the designer, what pool the library shows, and where
 * a saved glyph routes. It owns none of the wiring — `main.js` reads these results and does the
 * DOM/Firestore work.
 *
 * Kept separate from `glyphModel.js` (the layer/compose model) and `iconRegistry.js` (the bundled
 * registry) on purpose: those describe *what a glyph is*; this describes *how the admin manages
 * the collections*. The one crossover is `mergeIcons`, reused for the library pool.
 */

import { mergeIcons } from './iconRegistry.js';

/**
 * Rows for the Icons panel. Overlay rows are the authored/override icons (each flagged whether it
 * shadows a bundled key); bundled rows are the baseline icons NOT actively overridden — an active
 * (non-archived) overlay of the same key represents that baseline via its own row.
 * @param {Array<{key,label,svg,status,layers}>} icons - state.icons (the overlay)
 * @param {Array<{key,svg}>} bundled - bundledIcons
 * @returns {{overlayRows: Array, bundledRows: Array}}
 */
export function buildIconPanelModel(icons = [], bundled = []) {
  const bundledKeys = new Set(bundled.map((i) => i.key));
  const overlayRows = icons
    .map((i) => ({
      key: i.key,
      label: i.label || '',
      svg: i.svg || '',
      status: i.status || 'active',
      bundled: bundledKeys.has(i.key),
      layers: i.layers || null, // designer-authored icons offer "Edit in designer"
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const activeOverrides = new Set(
    icons.filter((i) => (i.status || 'active') !== 'archived').map((i) => i.key)
  );
  const bundledRows = bundled
    .filter((i) => !activeOverrides.has(i.key))
    .map((i) => ({ key: i.key, svg: i.svg }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { overlayRows, bundledRows };
}

/**
 * Rows for the Emblems panel — the full-color glyph set, rendered straight from state (no bundled
 * baseline to reconcile).
 * @param {Array<{key,label,svg,status,layers}>} emblems - state.emblems
 * @returns {{rows: Array}}
 */
export function buildEmblemPanelModel(emblems = []) {
  const rows = emblems
    .map((e) => ({
      key: e.key,
      label: e.label || '',
      svg: e.svg || '',
      status: e.status || 'active',
      layers: e.layers || null,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { rows };
}

/**
 * The params that open the shared glyph designer (minus the impure `onSave` callback, which
 * `main.js` supplies). Editing an existing record (`rec`) locks the palette so a glyph never
 * silently jumps collections, and excludes the record's own key from the uniqueness set.
 * @param {'mono'|'color'} palette - the starting kind when creating
 * @param {?{key,label,layers,palette}} rec - the record being edited, or null to create
 * @param {{iconKeys: string[], emblemKeys: string[]}} keys - existing keys per collection
 */
export function glyphDesignerParams(palette, rec = null, { iconKeys = [], emblemKeys = [] } = {}) {
  const existingKeys = {
    mono: iconKeys.filter((k) => k !== rec?.key),
    color: emblemKeys.filter((k) => k !== rec?.key),
  };
  return {
    palette: rec ? (rec.palette || palette) : palette,
    lockPalette: !!rec,
    initial: rec ? { key: rec.key, label: rec.label || '', layers: rec.layers || [] } : {},
    existingKeys,
  };
}

/**
 * The glyph library pool: the bundled baseline merged with the active overlay, so "Browse library"
 * generalizes "Override…". Archived or markup-less overlay entries are dropped; a designed overlay
 * keeps its `layers` so it can reopen in the editor.
 * @param {Array<{key,svg}>} bundled - bundledIcons
 * @param {Array<{key,svg,status,layers}>} overlayIcons - state.icons
 * @returns {Array<{key,svg,layers}>}
 */
export function buildGlyphLibraryPool(bundled = [], overlayIcons = []) {
  const overlay = overlayIcons
    .filter((i) => i && i.key && i.svg && i.status !== 'archived')
    .map((i) => ({ key: i.key, svg: i.svg, layers: i.layers || null }));
  return mergeIcons(bundled, overlay);
}

/**
 * Where a designer record writes: its palette selects the collection (color → emblems, mono →
 * icons), `isEdit` selects create vs. update. Returns the resolved key, the doc data, and the
 * toast — `main.js` dispatches the matching Firestore call.
 * @param {{key,label,svg,layers,palette}} record
 * @param {boolean} isEdit
 * @returns {{collection: 'emblem'|'icon', op: 'update'|'create', key, data, toast}}
 */
export function glyphSaveTarget(record, isEdit) {
  const { key, label, svg, layers, palette } = record;
  const data = { label, svg, layers, palette };
  const collection = palette === 'color' ? 'emblem' : 'icon';
  const op = isEdit ? 'update' : 'create';
  const toast = `${isEdit ? 'Saved' : 'Added'} ${collection} “${key}”`;
  return { collection, op, key, data, toast };
}
