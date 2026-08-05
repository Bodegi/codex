/**
 * Codex — Component registry (the one registry).
 *
 * One entry per renderable component a type can compose. Each entry is:
 *
 *   {
 *     renderInput(field, value, ctx) -> html   // builder CONTROL (caller wraps grid kinds in a group)
 *     renderRead(field, value, ctx)  -> html   // read-view BODY  (caller wraps grid kinds in an <h3>)
 *     layout?  'grid' | 'full' | 'break'       // wrapper the walkers apply; default 'grid'
 *     mount?(el, { field, value, onChange, ctx }) // imperative wiring for components that need it
 *   }
 *
 * Layout drives both walkers (formRenderer / entryRenderer) instead of the old hard-coded
 * `FULL_WIDTH` / `MEDIA_KINDS` sets:
 *   - 'grid'  — a `.form-group` cell in the section `.form-grid` (default).
 *   - 'full'  — a `.form-group` spanning the grid (tall controls: prose, list).
 *   - 'break' — the component escapes the grid as its own block (media: hero, gallery).
 *
 * `mount` is the imperative seam. Called after the component's `renderInput` HTML is in the
 * DOM, it wires events / a live canvas and reports edits back through `onChange(newValue)`,
 * which the builder writes to `data[field.key]` — the single value path for every component
 * (no more fixed `heroImage` / `gallery` write keys). The pure kinds omit it and are scraped
 * from `data-field-key` as before.
 *
 * `selfRender` (optional) tells the builder's onChange NOT to rebuild the whole form after a
 * commit. hero/gallery rely on that rebuild to refresh their thumbnails; the map does not — it
 * owns a live canvas with ephemeral pan/zoom a teardown would reset, so it redraws itself and
 * only the read preview refreshes (see main.js `wireComponentMounts`).
 *
 * The four pure kinds (text / prose / list / reference) stay free of build-tool coupling and
 * are unit-testable under plain Node. The media components need the image picker (mount only)
 * and the carousel (read only); both imports are side-effect-free at load, so this module
 * still imports cleanly under Node — `mount` is browser-only and never runs there.
 *
 * `ctx` (optional) is the edge adapter for data this module must not import directly:
 *   ctx.resolveImage(id)      -> url | null       (pool images: prose inline, hero, gallery)
 *   ctx.listEntries(type)     -> [{ id, label }]  (reference <select> options)
 *   ctx.resolveRef(type, id)  -> { label, exists }(reference read-view link)
 *   ctx.listImages()          -> [{ id, label, url }] (picker grid; mount only)
 *   ctx.pickerOptions         -> { canManage, onUpload, onRemove } (picker; mount only)
 */

import { escapeHtml, formatInline } from './inlineText.js';
import { notFoundImage } from './notFoundImage.js';
import { openImagePicker } from '../components/imagePicker.js';
import { renderCarousel } from '../components/carousel.js';
import { renderMapInput, renderMapRead, mountMap } from '../components/mapComponent.js';

const MUTED_EMPTY = '<p class="muted">Not specified.</p>';

/** Normalize a list value: array as-is, comma-string split, blank -> []. */
export function toList(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A resolved image thumb, or the not-found placeholder when the id can't resolve. */
function thumb(id, resolveImage) {
  const url = resolveImage ? resolveImage(id) : null;
  return url
    ? `<img src="${url}" alt="" class="media-thumb">`
    : `<span class="media-thumb media-thumb-missing" title="image not found">${notFoundImage('image-missing-thumb')}</span>`;
}

/** Insert `text` at the caret of a textarea/input, then leave the caret after it. */
function insertAtCursor(field, text) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = field.value.slice(0, start) + text + field.value.slice(end);
  const pos = start + text.length;
  field.setSelectionRange(pos, pos);
  field.focus();
}

/** Open the image picker for a mount, honoring the ctx-supplied list + editor affordances. */
function pickImage(ctx) {
  return openImagePicker(ctx?.listImages ? ctx.listImages() : [], ctx?.pickerOptions || {});
}

export const fieldKinds = {
  text: {
    renderInput(field, value, _ctx) {
      const type = field.inputType || 'text';
      return `<input type="${type}" class="form-control" data-field-key="${field.key}" data-field-kind="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}">`;
    },
    renderRead(_field, value, _ctx) {
      if (value == null || String(value).trim() === '') return MUTED_EMPTY;
      return `<p>${escapeHtml(value)}</p>`;
    },
  },

  prose: {
    layout: 'full',
    renderInput(field, value, _ctx) {
      return `<textarea class="form-control" data-field-key="${field.key}" data-field-kind="prose" rows="3">${escapeHtml(value)}</textarea>`;
    },
    renderRead(_field, value, ctx) {
      return formatInline(value, ctx?.resolveImage) || MUTED_EMPTY;
    },
    // Per-field inline-image affordance: inserts `![](img:id)` at the caret and lets the
    // scrape listener pick up the change. Replaces the old single global "focused field" button.
    mount(el, { ctx }) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm prose-insert-image';
      btn.textContent = '＋ Insert image';
      el.insertAdjacentElement('afterend', btn);
      btn.addEventListener('click', async () => {
        const id = await pickImage(ctx);
        if (!id) return;
        insertAtCursor(el, `![](img:${id})`);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
  },

  list: {
    layout: 'full',
    // One item per line. Kept deliberately simple: the value reader splits on
    // newlines, so there is no per-row DOM to wire.
    renderInput(field, value, _ctx) {
      return `<textarea class="form-control" data-field-key="${field.key}" data-field-kind="list" rows="3" placeholder="One per line">${escapeHtml(toList(value).join('\n'))}</textarea>`;
    },
    renderRead(_field, value, _ctx) {
      const items = toList(value);
      if (items.length === 0) return MUTED_EMPTY;
      return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    },
  },

  reference: {
    renderInput(field, value, ctx) {
      if (field.multi) return referenceMultiInput(field, value, ctx);
      const entries = ctx?.listEntries ? ctx.listEntries(field.targetType) : null;
      if (!entries) {
        // No entry index available — keep the id editable rather than lose it.
        return `<input type="text" class="form-control" data-field-key="${field.key}" data-field-kind="reference" value="${escapeHtml(value)}">`;
      }
      const current = value == null ? '' : String(value);
      const options = [`<option value="">— none —</option>`];
      // A set-but-unlisted id (the target type has no entries yet, or the
      // referenced entry was deleted/archived) has no matching <option>, so the
      // select would render as "— none —" and the next save would silently wipe
      // it. Carry it as a selected option so the stored value survives edit → save.
      if (current !== '' && !entries.some((e) => e.id === current)) {
        const label = ctx?.resolveRef ? ctx.resolveRef(field.targetType, current).label : current;
        options.push(
          `<option value="${escapeHtml(current)}" selected>${escapeHtml(label)} (unavailable)</option>`
        );
      }
      options.push(
        ...entries.map(
          (e) => `<option value="${escapeHtml(e.id)}"${e.id === current ? ' selected' : ''}>${escapeHtml(e.label)}</option>`
        )
      );
      return `<select class="form-control" data-field-key="${field.key}" data-field-kind="reference" data-ref-target="${escapeHtml(field.targetType || '')}">${options.join('')}</select>`;
    },
    renderRead(field, value, ctx) {
      if (field.multi) return referenceMultiRead(field, value, ctx);
      if (value == null || String(value).trim() === '') return '<span class="muted">None</span>';
      return refLink(field.targetType, value, ctx);
    },
  },

  hero: {
    layout: 'break',
    renderInput(field, value, ctx) {
      const hero = value || '';
      const block = hero
        ? `${thumb(hero, ctx?.resolveImage)}<button type="button" class="btn btn-secondary btn-sm" data-media="hero-clear">Remove</button>`
        : `<span class="media-empty">No hero image</span>`;
      return `<div class="form-group form-media" data-field-key="${escapeHtml(field.key)}">
        <label>${escapeHtml(field.label)}</label>
        <div class="media-hero-row">
          <button type="button" class="btn btn-primary btn-sm" data-media="hero-pick">Pick Hero</button>
          ${block}
        </div>
      </div>`;
    },
    renderRead(_field, value, ctx) {
      if (!value) return '';                                  // no hero set → render nothing
      const url = ctx?.resolveImage ? ctx.resolveImage(value) : null;
      if (!url) return notFoundImage('image-missing-hero');   // set but unresolved → placeholder, never a broken page
      return `<img class="entry-hero" src="${url}" alt="">`;
    },
    mount(el, { onChange, ctx }) {
      el.querySelector('[data-media="hero-pick"]')?.addEventListener('click', async () => {
        const id = await pickImage(ctx);
        if (id) onChange(id);
      });
      // '' is the canonical "no hero" value (read-side treats it as unset), which reads
      // cleaner than deleting the key and full-replace Save persists it explicitly.
      el.querySelector('[data-media="hero-clear"]')?.addEventListener('click', () => onChange(''));
    },
  },

  gallery: {
    layout: 'break',
    renderInput(field, value, ctx) {
      const gallery = toList(value);
      const items = gallery
        .map(
          (id, i) => `
          <div class="media-gallery-item">
            ${thumb(id, ctx?.resolveImage)}
            <div class="media-gallery-actions">
              <button type="button" data-media="gallery-left" data-index="${i}" title="Move left">◀</button>
              <button type="button" data-media="gallery-remove" data-index="${i}" title="Remove">×</button>
              <button type="button" data-media="gallery-right" data-index="${i}" title="Move right">▶</button>
            </div>
          </div>`
        )
        .join('');
      return `<div class="form-group form-media" data-field-key="${escapeHtml(field.key)}">
        <label>${escapeHtml(field.label)}</label>
        <div class="media-gallery-row">
          ${items || '<span class="media-empty">No carousel images</span>'}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-media="gallery-add">＋ Add Image</button>
      </div>`;
    },
    renderRead(_field, value, ctx) {
      return renderCarousel(toList(value), ctx?.resolveImage);
    },
    mount(el, { value, onChange, ctx }) {
      el.querySelectorAll('[data-media]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.media;
          const idx = Number(btn.dataset.index);
          const g = toList(value).slice();
          if (action === 'gallery-add') {
            const id = await pickImage(ctx);
            if (id) { g.push(id); onChange(g); }
          } else if (action === 'gallery-remove') {
            g.splice(idx, 1);
            onChange(g);
          } else if (action === 'gallery-left' && idx > 0) {
            [g[idx - 1], g[idx]] = [g[idx], g[idx - 1]];
            onChange(g);
          } else if (action === 'gallery-right' && idx < g.length - 1) {
            [g[idx + 1], g[idx]] = [g[idx], g[idx + 1]];
            onChange(g);
          }
        });
      });
    },
  },

  // The map component lives in its own module (canvas engine); the registry just delegates.
  // `selfRender` keeps its live canvas from being torn down on every commit (see header).
  map: {
    layout: 'break',
    selfRender: true,
    renderInput: renderMapInput,
    renderRead: renderMapRead,
    mount: mountMap,
  },
};

/** A single reference as a link (resolvable) or muted span (missing). */
function refLink(targetType, id, ctx) {
  const resolved = ctx?.resolveRef ? ctx.resolveRef(targetType, id) : { label: id, exists: true };
  if (resolved.exists) {
    return `<a href="#" data-ref-type="${escapeHtml(targetType || '')}" data-ref-id="${escapeHtml(id)}">${escapeHtml(resolved.label)}</a>`;
  }
  return `<span class="muted-ref" title="entry not found">${escapeHtml(resolved.label)}</span>`;
}

/**
 * Multi-value reference input — a native <select multiple> over the target type's
 * entries. Any stored id no longer in the entry list (deleted/archived, or the type
 * has no entries yet) is carried as a selected "(unavailable)" option so it survives
 * edit → save, mirroring the single-value control. Falls back to a comma-separated
 * text input when no entry index is available (keeps the ids editable, never lost).
 */
function referenceMultiInput(field, value, ctx) {
  const target = field.targetType || '';
  const current = toList(value);
  const entries = ctx?.listEntries ? ctx.listEntries(target) : null;
  if (!entries) {
    return `<input type="text" class="form-control" data-field-key="${field.key}" data-field-kind="reference" data-multi="true" value="${escapeHtml(current.join(', '))}" placeholder="comma-separated ids">`;
  }
  const known = new Set(entries.map((e) => e.id));
  const selected = new Set(current);
  const options = [];
  for (const id of current) {
    if (known.has(id)) continue;
    const label = ctx?.resolveRef ? ctx.resolveRef(target, id).label : id;
    options.push(`<option value="${escapeHtml(id)}" selected>${escapeHtml(label)} (unavailable)</option>`);
  }
  options.push(
    ...entries.map(
      (e) => `<option value="${escapeHtml(e.id)}"${selected.has(e.id) ? ' selected' : ''}>${escapeHtml(e.label)}</option>`
    )
  );
  const size = Math.min(Math.max(options.length, 3), 8);
  return `<select multiple size="${size}" class="form-control" data-field-key="${field.key}" data-field-kind="reference" data-multi="true" data-ref-target="${escapeHtml(target)}">${options.join('')}</select>`;
}

/** Multi-value reference read view — the resolved targets as a comma-separated link list. */
function referenceMultiRead(field, value, ctx) {
  const ids = toList(value);
  if (ids.length === 0) return '<span class="muted">None</span>';
  return `<p class="ref-list">${ids.map((id) => refLink(field.targetType, id, ctx)).join(', ')}</p>`;
}

/** The registry entry for a kind, or null for unknown kinds. */
export function getKind(kind) {
  return fieldKinds[kind] || null;
}

/** A component's layout ('grid' | 'full' | 'break'), defaulting to 'grid' (incl. unknown kinds). */
export function getLayout(kind) {
  return fieldKinds[kind]?.layout || 'grid';
}

/** A plain string for a field's value, for the metadata callout. */
export function displayValue(field, value, ctx) {
  if (field.kind === 'list') return toList(value).join(', ');
  if (field.kind === 'reference') {
    const resolve = (id) => (ctx?.resolveRef ? ctx.resolveRef(field.targetType, id).label : id);
    if (field.multi) return toList(value).map(resolve).join(', ');
    if (value == null || String(value).trim() === '') return '';
    return resolve(value);
  }
  return String(value ?? '');
}

/** Visible placeholder for a schema field whose kind we don't recognize. */
export function unknownKindPlaceholder(kind) {
  return `<div class="unknown-kind">unknown field kind: ${escapeHtml(kind)}</div>`;
}
