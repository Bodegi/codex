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
 *     title, description, icon                 // palette metadata: human name, one-line hint, SVG glyph
 *   }
 *
 * `title` / `description` / `icon` drive the Structure editor's component palette (the author
 * picks a named, described component, not a jargon key — see components/componentPalette.js).
 * `paletteComponents()` projects them out in registry order.
 *
 * Layout drives both walkers (formRenderer / entryRenderer):
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
 * The pure kinds (text / prose / number / date / select / boolean / list / reference) stay free of
 * build-tool coupling and are unit-testable under plain Node. The media components need the image
 * picker (mount only) and the carousel (read only); both imports are side-effect-free at load, so
 * this module still imports cleanly under Node — `mount` is browser-only and never runs there.
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
import { renderBannerInput, renderBannerRead, renderBannerEmblem, mountBanner } from '../components/bannerComponent.js';

const MUTED_EMPTY = '<p class="muted">Not specified.</p>';

// Preview-sample constants (see `sampleValue` / `previewSample`). The image id is a sentinel that
// never resolves, so media/map slots render the shared not-found frame — "an image goes here" — in
// the Structure-editor layout preview rather than blank space.
const SAMPLE_IMAGE_ID = '__preview_sample_image__';
const SAMPLE_PROSE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

// Palette glyphs — inline `fill="currentColor"` SVG (like iconRegistry.js), sized by CSS. One per
// kind so the component palette reads as icon + name + hint rather than a jargon dropdown.
const glyph = (body) => `<svg viewBox="0 0 24 24" class="palette-icon" aria-hidden="true" fill="currentColor">${body}</svg>`;
const ICONS = {
  text: glyph('<rect x="3" y="10.5" width="18" height="3" rx="1.5"/>'),
  prose: glyph('<path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>'),
  number: glyph('<rect x="3" y="8.6" width="18" height="2.4" rx="0.8"/><rect x="3" y="13" width="18" height="2.4" rx="0.8"/><rect x="7.8" y="4" width="2.4" height="16" rx="0.8"/><rect x="13.8" y="4" width="2.4" height="16" rx="0.8"/>'),
  date: glyph('<path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>'),
  select: glyph('<rect x="3" y="5" width="18" height="3" rx="1.5"/><path d="M7 11l5 6 5-6z"/>'),
  heading: glyph('<path d="M5 4v3h5.5v12h3V7H19V4z"/>'),
  boolean: glyph('<path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>'),
  list: glyph('<path d="M4 14h4v-4H4v4zm0 5h4v-4H4v4zM4 9h4V5H4v4zm5 5h12v-4H9v4zm0 5h12v-4H9v4zM9 5v4h12V5H9z"/>'),
  reference: glyph('<path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zM8 11h8v2H8z"/>'),
  hero: glyph('<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>'),
  gallery: glyph('<path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/>'),
  map: glyph('<path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>'),
  banner: glyph('<path d="M6 2h12v16l-6-3-6 3z"/>'),
};

/** Normalize a list value: array as-is, comma-string split, blank -> []. */
export function toList(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A field's array-value display mode: 'list' (default) | 'tags' | 'inline'. */
function displayMode(field) {
  return field.display === 'tags' || field.display === 'inline' ? field.display : 'list';
}

/**
 * The one read-view body for every array-valued component (list, multi-select, multi-reference),
 * so the `display` toggle renders identically across all of them. `cells` are already-safe HTML
 * fragments (escaped text, or a resolved reference link); each caller handles its own empty case
 * before calling. 'list' reproduces the historical bulleted `<ul>` exactly (default, no regression).
 */
function renderMultiValues(cells, mode) {
  if (mode === 'tags') {
    return `<ul class="field-tags">${cells.map((c) => `<li class="field-tag">${c}</li>`).join('')}</ul>`;
  }
  if (mode === 'inline') {
    return `<p class="field-inline">${cells.join(', ')}</p>`;
  }
  return `<ul>${cells.map((c) => `<li>${c}</li>`).join('')}</ul>`;
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
    title: 'Text',
    description: 'A short single-line value — a name, a title, a label.',
    icon: ICONS.text,
    renderInput(field, value, _ctx) {
      // Always a plain text input — number/date/link/color are (becoming) first-class kinds, not a
      // polymorphic `type=` on text (issues #31 / #32). A stray `inputType` from legacy raw JSON is
      // ignored rather than echoed into `type="…"`.
      return `<input type="text" class="form-control" data-field-key="${field.key}" data-field-kind="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}">`;
    },
    renderRead(_field, value, _ctx) {
      if (value == null || String(value).trim() === '') return MUTED_EMPTY;
      return `<p>${escapeHtml(value)}</p>`;
    },
    sampleValue: (field) => field.label,
  },

  prose: {
    title: 'Paragraph',
    description: 'Multi-line rich text with inline formatting and images.',
    icon: ICONS.prose,
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
    sampleValue: () => SAMPLE_PROSE,
  },

  number: {
    title: 'Number',
    description: 'A numeric value — a count, a rating, a year.',
    icon: ICONS.number,
    renderInput(field, value, _ctx) {
      return `<input type="number" class="form-control" data-field-key="${field.key}" data-field-kind="number" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}">`;
    },
    renderRead(_field, value, _ctx) {
      if (value == null || String(value).trim() === '') return MUTED_EMPTY;
      return `<p>${escapeHtml(value)}</p>`;
    },
    sampleValue: () => '42',
  },

  date: {
    title: 'Date',
    description: 'A calendar date, picked from a date control.',
    icon: ICONS.date,
    renderInput(field, value, _ctx) {
      return `<input type="date" class="form-control" data-field-key="${field.key}" data-field-kind="date" value="${escapeHtml(value)}">`;
    },
    renderRead(_field, value, _ctx) {
      if (value == null || String(value).trim() === '') return MUTED_EMPTY;
      return `<p>${escapeHtml(value)}</p>`;
    },
    sampleValue: () => '2025-01-01',
  },

  select: {
    title: 'Select',
    description: 'One choice from a fixed list of options you define.',
    icon: ICONS.select,
    // Options live on `field.options` (an array of strings; the editor authors them one-per-line).
    // A stored value not in the current option list is carried as a selected "(unavailable)" option
    // so a since-removed choice survives edit → save rather than being silently wiped — mirroring
    // the reference control's handling of a dangling id. `field.multi` switches single-choice to
    // multi-choice, exactly as it does for reference; the read view then honors the display toggle.
    renderInput(field, value, _ctx) {
      if (field.multi) return selectMultiInput(field, value);
      const opts = toList(field.options);
      const current = value == null ? '' : String(value);
      const options = ['<option value="">— none —</option>'];
      if (current !== '' && !opts.includes(current)) {
        options.push(`<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (unavailable)</option>`);
      }
      options.push(
        ...opts.map((o) => `<option value="${escapeHtml(o)}"${o === current ? ' selected' : ''}>${escapeHtml(o)}</option>`)
      );
      return `<select class="form-control" data-field-key="${field.key}" data-field-kind="select">${options.join('')}</select>`;
    },
    renderRead(field, value, _ctx) {
      if (field.multi) {
        const items = toList(value);
        if (items.length === 0) return MUTED_EMPTY;
        return renderMultiValues(items.map((i) => escapeHtml(i)), displayMode(field));
      }
      if (value == null || String(value).trim() === '') return MUTED_EMPTY;
      return `<p>${escapeHtml(value)}</p>`;
    },
    // The option(s) read as a plausible chosen value in the schematic layout preview.
    sampleValue: (field) => {
      const opts = toList(field.options);
      if (field.multi) return opts.slice(0, 2).length ? opts.slice(0, 2) : [field.label];
      return opts[0] || field.label;
    },
  },

  boolean: {
    title: 'Checkbox',
    description: 'A yes / no toggle.',
    icon: ICONS.boolean,
    renderInput(field, value, _ctx) {
      const checked = value === true || value === 'true' ? ' checked' : '';
      return `<input type="checkbox" class="form-check" data-field-key="${field.key}" data-field-kind="boolean"${checked}>`;
    },
    renderRead(_field, value, _ctx) {
      return `<p>${value === true || value === 'true' ? 'Yes' : 'No'}</p>`;
    },
    sampleValue: () => true,
  },

  list: {
    title: 'List',
    description: 'Several short values, one per line.',
    icon: ICONS.list,
    layout: 'full',
    // One item per line. Kept deliberately simple: the value reader splits on
    // newlines, so there is no per-row DOM to wire.
    renderInput(field, value, _ctx) {
      return `<textarea class="form-control" data-field-key="${field.key}" data-field-kind="list" rows="3" placeholder="One per line">${escapeHtml(toList(value).join('\n'))}</textarea>`;
    },
    renderRead(field, value, _ctx) {
      const items = toList(value);
      if (items.length === 0) return MUTED_EMPTY;
      return renderMultiValues(items.map((i) => escapeHtml(i)), displayMode(field));
    },
    sampleValue: (field) => field.label,
  },

  reference: {
    title: 'Reference',
    description: 'A link to an entry of another type.',
    icon: ICONS.reference,
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
    // A plain label, not a real id: it won't resolve, so the preview shows the field's label as a
    // muted reference — a filled schematic of the slot, never a live lookup.
    sampleValue: (field) => field.label,
  },

  heading: {
    title: 'Heading',
    description: 'A labelled divider that groups the components below it.',
    icon: ICONS.heading,
    layout: 'break',
    // A heading is schema chrome, not entry content: its text lives on `field.label`, and both the
    // builder form and the read view render it as an <h2>. It stores nothing in `data[field.key]`,
    // so the content consumers (searchIndex / summaryCard / entryDraft / displayValue, and the
    // title/summary field pickers) skip `kind === 'heading'`.
    renderInput(field, _value, _ctx) {
      return `<h2 class="form-heading">${escapeHtml(field.label)}</h2>`;
    },
    renderRead(field, _value, _ctx) {
      return `<h2>${escapeHtml(field.label)}</h2>`;
    },
    sampleValue: () => '',
  },

  hero: {
    title: 'Hero',
    description: 'A single large hero image spanning the top of the entry.',
    icon: ICONS.hero,
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
    // Emblem view: the same image scaled to a card thumbnail (see summaryCard.js). Empty collapses;
    // a set-but-unresolved id shows the shared not-found frame rather than a broken thumb.
    renderEmblem(_field, value, ctx) {
      if (!value) return '';
      const url = ctx?.resolveImage ? ctx.resolveImage(value) : null;
      if (!url) return notFoundImage('image-missing-emblem');
      return `<img class="summary-emblem-img" src="${url}" alt="">`;
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
    sampleValue: () => SAMPLE_IMAGE_ID,
  },

  gallery: {
    title: 'Gallery',
    description: 'A carousel of several images.',
    icon: ICONS.gallery,
    layout: 'break',
    renderInput(field, value, ctx) {
      const gallery = toList(value);
      const items = gallery
        .map(
          (id, i) => `
          <div class="media-gallery-item">
            ${thumb(id, ctx?.resolveImage)}
            <div class="media-gallery-actions">
              <button type="button" data-media="gallery-left" data-index="${i}" title="Move left" aria-label="Move left">◀</button>
              <button type="button" data-media="gallery-remove" data-index="${i}" title="Remove image" aria-label="Remove image">×</button>
              <button type="button" data-media="gallery-right" data-index="${i}" title="Move right" aria-label="Move right">▶</button>
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
    sampleValue: () => [SAMPLE_IMAGE_ID],
  },

  // The map component lives in its own module (canvas engine); the registry just delegates.
  // `selfRender` keeps its live canvas from being torn down on every commit (see header).
  map: {
    title: 'Map',
    description: 'An interactive image map with markers and regions.',
    icon: ICONS.map,
    layout: 'break',
    selfRender: true,
    renderInput: renderMapInput,
    renderRead: renderMapRead,
    mount: mountMap,
    // A map whose background is the unresolvable sentinel → the not-found frame (see #13), with
    // an empty scene. Enough to show the map block in the layout preview.
    sampleValue: () => ({ mapImageId: SAMPLE_IMAGE_ID, waypoints: [], roads: [], territories: [] }),
  },

  // Banner delegates to its component (schema/bannerModel.js holds the pure model). `selfRender`
  // keeps the interactive designer from being torn down and rebuilt on every swatch click.
  banner: {
    title: 'Banner',
    description: 'A Minecraft-style heraldic banner: a base color plus stacked pattern layers.',
    icon: ICONS.banner,
    layout: 'break',
    selfRender: true,
    renderInput: renderBannerInput,
    renderRead: renderBannerRead,
    renderEmblem: renderBannerEmblem,
    mount: mountBanner,
    // A filled sample banner so the Structure-editor layout preview shows real heraldry, not a blank.
    sampleValue: () => ({ base: 'red', layers: [{ pattern: 'border', color: 'white' }, { pattern: 'creeper', color: 'lime' }] }),
  },
};

/**
 * A filled, representative value for a field's kind — the Structure-editor previews render this so
 * they show a *schematic of the layout you are building*, independent of whether any entries exist.
 * text/list/reference → the field's label; prose → lorem ipsum; media/map → a sentinel unresolvable
 * image id so the slot renders the shared not-found frame. Falls back to the label for a kind that
 * declares none (and '' when it has no label).
 */
export function sampleValue(field) {
  const kind = fieldKinds[field.kind];
  return kind?.sampleValue ? kind.sampleValue(field) : field.label ?? '';
}

/** A whole-schema preview sample: `{ type, [field.key]: sampleValue(field) }` over every field. */
export function previewSample(schema) {
  const sample = { type: schema.type };
  for (const field of schema.fields || []) sample[field.key] = sampleValue(field);
  return sample;
}

/** A single reference as a link (resolvable) or muted span (missing). */
function refLink(targetType, id, ctx) {
  const resolved = ctx?.resolveRef ? ctx.resolveRef(targetType, id) : { label: id, exists: true };
  if (resolved.exists) {
    return `<a href="#" data-ref-type="${escapeHtml(targetType || '')}" data-ref-id="${escapeHtml(id)}">${escapeHtml(resolved.label)}</a>`;
  }
  return `<span class="muted-ref" title="entry not found">${escapeHtml(resolved.label)}</span>`;
}

/**
 * A click-to-toggle multi-value control (shared by multi-select and multi-reference). Each option is
 * a row that highlights like the active sidebar-nav item when selected; a plain click toggles it —
 * no ctrl/cmd-click, which the native <select multiple> made confusing (issue #43). The form harvest
 * reads it by click delegation (main.js), not the input scrape, so the root carries `data-field-key`
 * but no `data-field-kind`. `entries`: [{ value, label, selected, unavailable? }].
 */
function toggleSelectInput(field, entries) {
  const rows = entries
    .map((e) => {
      const tail = e.unavailable ? ' <span class="toggle-unavailable">(unavailable)</span>' : '';
      return `<button type="button" class="toggle-option${e.selected ? ' is-selected' : ''}" role="option" aria-selected="${e.selected ? 'true' : 'false'}" data-value="${escapeHtml(e.value)}">${escapeHtml(e.label)}${tail}</button>`;
    })
    .join('');
  const body = rows || '<span class="toggle-empty">No options defined.</span>';
  return `<div class="toggle-select" data-field-key="${field.key}" data-multi="true" role="listbox" aria-multiselectable="true"${field.label ? ` aria-label="${escapeHtml(field.label)}"` : ''}>${body}</div>`;
}

/**
 * Multi-value select input — the toggle control over the field's own options. A stored value no
 * longer in the option list is carried as a selected "(unavailable)" row so it survives edit → save,
 * mirroring the single-value control's dangling-value handling.
 */
function selectMultiInput(field, value) {
  const opts = toList(field.options);
  const current = toList(value);
  const known = new Set(opts);
  const selected = new Set(current);
  const entries = [];
  for (const v of current) {
    if (!known.has(v)) entries.push({ value: v, label: v, selected: true, unavailable: true });
  }
  for (const o of opts) entries.push({ value: o, label: o, selected: selected.has(o) });
  return toggleSelectInput(field, entries);
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
  const list = ctx?.listEntries ? ctx.listEntries(target) : null;
  if (!list) {
    // No entry index available — keep the ids editable in a plain text input (never lost). This
    // scrape-read fallback keeps its data-field-kind so main.js reads it via readFieldValue.
    return `<input type="text" class="form-control" data-field-key="${field.key}" data-field-kind="reference" data-multi="true" value="${escapeHtml(current.join(', '))}" placeholder="comma-separated ids">`;
  }
  const known = new Set(list.map((e) => e.id));
  const selected = new Set(current);
  const entries = [];
  for (const id of current) {
    if (!known.has(id)) {
      const label = ctx?.resolveRef ? ctx.resolveRef(target, id).label : id;
      entries.push({ value: id, label, selected: true, unavailable: true });
    }
  }
  for (const e of list) entries.push({ value: e.id, label: e.label, selected: selected.has(e.id) });
  return toggleSelectInput(field, entries);
}

/** Multi-value reference read view — resolved target links through the shared display toggle. */
function referenceMultiRead(field, value, ctx) {
  const ids = toList(value);
  if (ids.length === 0) return '<span class="muted">None</span>';
  return renderMultiValues(ids.map((id) => refLink(field.targetType, id, ctx)), displayMode(field));
}

/** The registry entry for a kind, or null for unknown kinds. */
export function getKind(kind) {
  return fieldKinds[kind] || null;
}

/**
 * The palette model: every renderable component as `{ kind, title, description, icon }`, in registry
 * order. This is what the Structure editor's palette picker renders — a named, described choice
 * instead of the internal kind key. Pure + Node-testable; the palette DOM lives in
 * components/componentPalette.js.
 */
export function paletteComponents() {
  return Object.entries(fieldKinds).map(([kind, def]) => ({
    kind,
    title: def.title || kind,
    description: def.description || '',
    icon: def.icon || '',
  }));
}

/** A component's layout ('grid' | 'full' | 'break'), defaulting to 'grid' (incl. unknown kinds). */
export function getLayout(kind) {
  return fieldKinds[kind]?.layout || 'grid';
}

/** A plain string for a field's value — used by the summary card and the search index. */
export function displayValue(field, value, ctx) {
  if (field.kind === 'heading') return ''; // schema chrome, no per-entry value
  if (field.kind === 'banner') return ''; // structured heraldry, not text (like map — never String(value))
  if (field.kind === 'boolean') return value === true || value === 'true' ? 'Yes' : 'No';
  if (field.kind === 'list') return toList(value).join(', ');
  if (field.kind === 'select' && field.multi) return toList(value).join(', ');
  if (field.kind === 'reference') {
    const resolve = (id) => (ctx?.resolveRef ? ctx.resolveRef(field.targetType, id).label : id);
    if (field.multi) return toList(value).map(resolve).join(', ');
    if (value == null || String(value).trim() === '') return '';
    return resolve(value);
  }
  return String(value ?? '');
}

/**
 * A field's compact visual emblem for a summary card, or '' when the kind has no emblem view or the
 * value is empty. Only the media/heraldry kinds (hero, banner) define `renderEmblem` — every other
 * kind is text and contributes through `displayValue` instead. This is the summary card's one image
 * seam: a new emblem-capable component just adds `renderEmblem` to its registry entry.
 */
export function renderEmblem(field, value, ctx) {
  const kind = fieldKinds[field?.kind];
  return kind?.renderEmblem ? kind.renderEmblem(field, value, ctx) : '';
}

/** Kinds that can serve as a summary-card emblem — those whose registry entry defines `renderEmblem`. */
export function emblemKinds() {
  return Object.keys(fieldKinds).filter((k) => typeof fieldKinds[k].renderEmblem === 'function');
}

/** Visible placeholder for a schema field whose kind we don't recognize. */
export function unknownKindPlaceholder(kind) {
  return `<div class="unknown-kind">unknown field kind: ${escapeHtml(kind)}</div>`;
}
