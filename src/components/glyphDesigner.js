/**
 * Codex — Glyph designer (icons + emblems).
 *
 * The visual authoring surface for glyphs: a modal that composes an ordered
 * painter's stack of SVG primitive layers into the same `svg` string the paste box produces today.
 * One editor, two palettes — **mono** (icons, `currentColor`, theme-tinted) and **color** (emblems,
 * literal fills) — chosen by the header toggle, which also decides the destination collection.
 *
 * All layer geometry/compose/validation lives in the pure, Node-tested `schema/glyphModel.js`; this
 * file is only DOM + wiring. Output is generated from the constrained layer model, so it can never
 * contain script/foreignObject/external refs — strictly safer than the paste path.
 *
 * openGlyphDesigner({ palette, lockPalette, initial, existingKeys, onSave }) → Promise<saved?>
 *   palette      — starting palette 'mono' | 'color' (icon vs emblem).
 *   lockPalette  — true when editing in place (moving between collections is disallowed).
 *   initial      — { key, label, layers } to seed (blank create otherwise).
 *   existingKeys — { mono:[...iconKeys], color:[...emblemKeys] } for the duplicate-key gate; the
 *                  record's own key should already be excluded from its palette's set on an edit.
 *   onSave       — async ({ key, label, svg, layers, palette }) => void; may throw (shown inline).
 */

import { newLayer, layersToSvg, validateGlyph, SHAPES } from '../schema/glyphModel.js';

const PRIMITIVES = ['circle', 'rect', 'ellipse', 'line', 'polygon']; // add-layer palette (path is grid-tool only)

// Geometry field descriptors per shape: [key, label]. Points/path get their own controls.
const GEO_FIELDS = {
  circle: [['cx', 'cx'], ['cy', 'cy'], ['r', 'r']],
  ellipse: [['cx', 'cx'], ['cy', 'cy'], ['rx', 'rx'], ['ry', 'ry']],
  rect: [['x', 'x'], ['y', 'y'], ['w', 'w'], ['h', 'h'], ['rx', 'radius']],
  line: [['x1', 'x1'], ['y1', 'y1'], ['x2', 'x2'], ['y2', 'y2']],
};

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function openGlyphDesigner({ palette = 'mono', lockPalette = false, initial = {}, existingKeys = {}, onSave } = {}) {
  return new Promise((resolve) => {
    // Working state (a deep-enough clone so Cancel discards edits cleanly).
    const state = {
      palette,
      key: initial.key || '',
      label: initial.label || '',
      layers: (initial.layers || []).map((l) => ({ ...l, geo: { ...l.geo }, id: l.id || newLayer(l.shape).id })),
      selected: 0,
      stageBg: 'light', // 'light' | 'dark' — proves mono tinting both ways
    };
    const keysFor = () => (state.palette === 'color' ? existingKeys.color : existingKeys.mono) || [];
    const isColor = () => state.palette === 'color';

    const overlay = document.createElement('div');
    overlay.className = 'glyph-designer-overlay';
    overlay.innerHTML = `
      <div class="glyph-designer" role="dialog" aria-modal="true" aria-label="Glyph designer">
        <div class="gd-header">
          <div class="gd-mode" role="group" aria-label="Glyph kind">
            <button type="button" class="gd-mode-btn" data-mode="mono"${lockPalette ? ' disabled' : ''}>Icon</button>
            <button type="button" class="gd-mode-btn" data-mode="color"${lockPalette ? ' disabled' : ''}>Emblem</button>
          </div>
          <input class="admin-input gd-key" data-key placeholder="key (e.g. dragon-lair)" maxlength="32" aria-label="Glyph key">
          <input class="admin-input gd-label" data-label placeholder="label (optional)" aria-label="Glyph label">
          <div class="gd-header-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-cancel>Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" data-save>Save</button>
          </div>
        </div>
        <div class="gd-status" data-status hidden></div>
        <div class="gd-body">
          <div class="gd-stage-col">
            <div class="gd-stage" data-stage></div>
            <div class="gd-stage-controls">
              <button type="button" class="btn btn-secondary btn-sm" data-bg-toggle>Dark bg</button>
              <span class="gd-hint" data-mode-hint></span>
            </div>
          </div>
          <div class="gd-side">
            <div class="gd-add" data-add>
              <span class="gd-side-label">Add layer</span>
              ${PRIMITIVES.map((s) => `<button type="button" class="btn btn-secondary btn-sm" data-add-shape="${s}">${s}</button>`).join('')}
            </div>
            <div class="gd-layers" data-layers></div>
            <div class="gd-inspector" data-inspector></div>
          </div>
        </div>
      </div>`;

    const q = (sel) => overlay.querySelector(sel);
    const stageEl = q('[data-stage]');
    const layersEl = q('[data-layers]');
    const inspectorEl = q('[data-inspector]');
    const statusEl = q('[data-status]');
    const keyInput = q('[data-key]');
    const labelInput = q('[data-label]');
    keyInput.value = state.key;
    labelInput.value = state.label;

    const setStatus = (msg, isError = true) => {
      statusEl.textContent = msg || '';
      statusEl.hidden = !msg;
      statusEl.classList.toggle('is-error', isError);
    };

    // ── Renders ────────────────────────────────────────────────────────────
    function paintStage() {
      stageEl.className = `gd-stage${state.stageBg === 'dark' ? ' is-dark' : ''}`;
      stageEl.innerHTML = layersToSvg(state.layers, { palette: state.palette });
    }

    function paintModeChrome() {
      overlay.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === state.palette));
      q('[data-mode-hint]').textContent = isColor()
        ? 'Emblem — full color, does not theme.'
        : 'Icon — monochrome, tints with the app color.';
    }

    function paintLayers() {
      if (!state.layers.length) {
        layersEl.innerHTML = '<div class="gd-empty">No layers yet — add one above.</div>';
        return;
      }
      // Top of the list = top of the stack (painted last). Reverse for display; store bottom-first.
      const rows = state.layers
        .map((layer, i) => {
          const sel = i === state.selected ? ' is-selected' : '';
          const swatch = isColor() && layer.fill && layer.fill !== 'none'
            ? `<span class="gd-swatch" style="background:${esc(layer.fill)}"></span>`
            : '';
          return `
            <div class="gd-layer-row${sel}" data-layer="${i}" draggable="true">
              <span class="gd-drag" data-drag aria-hidden="true">⠿</span>
              ${swatch}
              <span class="gd-layer-name">${esc(layer.shape)}</span>
              <button type="button" class="gd-icon-btn" data-dup="${i}" title="Duplicate" aria-label="Duplicate">⎘</button>
              <button type="button" class="gd-icon-btn" data-del="${i}" title="Delete" aria-label="Delete">✕</button>
            </div>`;
        })
        .reverse()
        .join('');
      layersEl.innerHTML = rows;
    }

    function geoRow(layer, key, label) {
      const v = layer.geo?.[key] ?? 0;
      return `<label class="gd-geo"><span>${label}</span><input type="number" step="0.5" data-geo="${key}" value="${esc(v)}"></label>`;
    }

    function paintInspector() {
      const layer = state.layers[state.selected];
      if (!layer) {
        inspectorEl.innerHTML = '<div class="gd-empty">Select a layer to edit it.</div>';
        return;
      }
      let geo = '';
      if (GEO_FIELDS[layer.shape]) {
        geo = `<div class="gd-geo-grid">${GEO_FIELDS[layer.shape].map(([k, l]) => geoRow(layer, k, l)).join('')}</div>`;
      } else if (layer.shape === 'polygon' || layer.shape === 'polyline') {
        const pts = (layer.geo?.points || []).map((p) => `${p[0]},${p[1]}`).join(' ');
        geo = `<label class="gd-geo gd-geo-wide"><span>points</span><textarea rows="2" data-points spellcheck="false" placeholder="x,y x,y x,y">${esc(pts)}</textarea></label>`;
      } else if (layer.shape === 'path') {
        geo = `<label class="gd-geo gd-geo-wide"><span>path d</span><textarea rows="2" data-path-d spellcheck="false">${esc(layer.geo?.d || '')}</textarea></label>`;
      }

      let paint = '';
      if (isColor()) {
        const fillOn = layer.fill && layer.fill !== 'none';
        const strokeOn = layer.stroke && layer.stroke !== 'none';
        const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000');
        paint = `
          <div class="gd-paint">
            <label class="gd-paint-row"><input type="checkbox" data-fill-on ${fillOn ? 'checked' : ''}> fill
              <input type="color" data-fill value="${hex(layer.fill)}"${fillOn ? '' : ' disabled'}></label>
            <label class="gd-paint-row"><input type="checkbox" data-stroke-on ${strokeOn ? 'checked' : ''}> stroke
              <input type="color" data-stroke value="${hex(layer.stroke)}"${strokeOn ? '' : ' disabled'}>
              <input type="number" class="gd-stroke-w" data-stroke-w min="0" step="0.5" value="${esc(layer.strokeWidth ?? 2)}"${strokeOn ? '' : ' disabled'} title="stroke width"></label>
          </div>`;
      }
      inspectorEl.innerHTML = `<div class="gd-side-label">${esc(layer.shape)} layer</div>${geo}${paint}`;
    }

    function repaint() {
      paintStage();
      paintLayers();
      paintInspector();
    }
    function repaintAll() {
      paintModeChrome();
      repaint();
    }

    // ── Mutations ──────────────────────────────────────────────────────────
    const select = (i) => {
      state.selected = i;
      paintLayers();
      paintInspector();
    };
    const addShape = (shape) => {
      state.layers.push(newLayer(shape));
      state.selected = state.layers.length - 1;
      repaint();
    };
    const duplicate = (i) => {
      const src = state.layers[i];
      if (!src) return;
      state.layers.splice(i + 1, 0, { ...src, geo: { ...src.geo }, id: newLayer(src.shape).id });
      state.selected = i + 1;
      repaint();
    };
    const remove = (i) => {
      state.layers.splice(i, 1);
      state.selected = Math.max(0, Math.min(state.selected, state.layers.length - 1));
      repaint();
    };

    // ── Events (delegated on the overlay) ──────────────────────────────────
    keyInput.addEventListener('input', () => { state.key = keyInput.value; });
    labelInput.addEventListener('input', () => { state.label = labelInput.value; });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-cancel]')) return close(false);
      const mode = e.target.closest('[data-mode]');
      if (mode && !lockPalette) {
        if (mode.dataset.mode === 'mono' && state.layers.some((l) => l.fill && l.fill !== 'none' && l.fill !== 'currentColor')) {
          setStatus('Switching to Icon: fixed colors will render as the theme color.', false);
        } else setStatus('');
        state.palette = mode.dataset.mode;
        repaintAll();
        return;
      }
      const add = e.target.closest('[data-add-shape]');
      if (add) return addShape(add.dataset.addShape);
      const dup = e.target.closest('[data-dup]');
      if (dup) return duplicate(+dup.dataset.dup);
      const del = e.target.closest('[data-del]');
      if (del) return remove(+del.dataset.del);
      const bg = e.target.closest('[data-bg-toggle]');
      if (bg) { state.stageBg = state.stageBg === 'dark' ? 'light' : 'dark'; paintStage(); return; }
      const row = e.target.closest('[data-layer]');
      if (row && !e.target.closest('[data-dup],[data-del],[data-drag]')) return select(+row.dataset.layer);
      if (e.target.closest('[data-save]')) return save();
    });

    // Inspector edits (delegated input/change on the side panel).
    inspectorEl.addEventListener('input', (e) => {
      const layer = state.layers[state.selected];
      if (!layer) return;
      const geo = e.target.closest('[data-geo]');
      if (geo) {
        layer.geo[geo.dataset.geo] = parseFloat(geo.value);
        return paintStage();
      }
      if (e.target.closest('[data-points]')) {
        layer.geo.points = parsePoints(e.target.value);
        return paintStage();
      }
      if (e.target.closest('[data-path-d]')) {
        layer.geo.d = e.target.value;
        return paintStage();
      }
      if (e.target.closest('[data-fill]')) { layer.fill = e.target.value; paintStage(); return paintLayers(); }
      if (e.target.closest('[data-stroke]')) { layer.stroke = e.target.value; return paintStage(); }
      if (e.target.closest('[data-stroke-w]')) { layer.strokeWidth = parseFloat(e.target.value); return paintStage(); }
    });
    inspectorEl.addEventListener('change', (e) => {
      const layer = state.layers[state.selected];
      if (!layer) return;
      if (e.target.closest('[data-fill-on]')) {
        layer.fill = e.target.checked ? (/^#[0-9a-f]{6}$/i.test(layer.fill) ? layer.fill : '#3366ff') : 'none';
        return paintInspector(), paintStage(), paintLayers();
      }
      if (e.target.closest('[data-stroke-on]')) {
        layer.stroke = e.target.checked ? (/^#[0-9a-f]{6}$/i.test(layer.stroke) ? layer.stroke : '#000000') : 'none';
        return paintInspector(), paintStage();
      }
    });

    // Layer drag-reorder (same HTML5-drag idiom as the schema editor, on a flat list).
    let dragFrom = null;
    layersEl.addEventListener('dragstart', (e) => {
      const row = e.target.closest('[data-layer]');
      if (!row) return;
      dragFrom = +row.dataset.layer;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });
    layersEl.addEventListener('dragover', (e) => {
      if (dragFrom == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    layersEl.addEventListener('drop', (e) => {
      if (dragFrom == null) return;
      e.preventDefault();
      const row = e.target.closest('[data-layer]');
      const to = row ? +row.dataset.layer : dragFrom;
      const [moved] = state.layers.splice(dragFrom, 1);
      state.layers.splice(to, 0, moved);
      state.selected = to;
      dragFrom = null;
      repaint();
    });
    layersEl.addEventListener('dragend', () => { dragFrom = null; });

    async function save() {
      const problems = validateGlyph({ key: state.key.trim(), layers: state.layers, palette: state.palette }, keysFor());
      if (problems.length) return setStatus(problems[0]);
      const svg = layersToSvg(state.layers, { palette: state.palette });
      const record = { key: state.key.trim(), label: state.label.trim(), svg, layers: state.layers, palette: state.palette };
      q('[data-save]').disabled = true;
      try {
        await onSave?.(record);
        close(true, record);
      } catch (err) {
        q('[data-save]').disabled = false;
        setStatus('Save failed: ' + err.message);
      }
    }

    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    function close(saved, record = null) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(saved ? record : null);
    }

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    repaintAll();
    keyInput.focus();
  });
}

/** Parse a "x,y x,y" points string into [[x,y], …], dropping malformed pairs. */
function parsePoints(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/**
 * Library picker: a grid over the supplied glyphs (our own bundled + overlay set — not an external
 * import). Resolves with the chosen glyph `{ key, svg, layers? }` to seed a create flow, or null.
 */
export function openLibraryPicker(glyphs = []) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'glyph-designer-overlay';
    overlay.innerHTML = `
      <div class="glyph-library" role="dialog" aria-modal="true" aria-label="Glyph library">
        <div class="gd-header">
          <strong>Start from a glyph</strong>
          <button type="button" class="image-picker-close" data-cancel aria-label="Close" title="Close">×</button>
        </div>
        <div class="glyph-library-grid">
          ${glyphs.length
            ? glyphs.map((g) => `<button type="button" class="glyph-library-item" data-pick="${esc(g.key)}" title="${esc(g.key)}"><span class="icon-card-preview">${g.svg || ''}</span><code>${esc(g.key)}</code></button>`).join('')
            : '<div class="admin-muted">No glyphs to start from.</div>'}
        </div>
      </div>`;
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    function done(key) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(key ? glyphs.find((g) => g.key === key) || null : null);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-cancel]')) return done(null);
      const pick = e.target.closest('[data-pick]');
      if (pick) done(pick.dataset.pick);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}
