/**
 * ATM10 Codex — Media Controls (write-side)
 *
 * The builder-side editing controls for an entry's imagery: hero image, carousel
 * gallery (add / remove / reorder), and an "insert into focused text" button for
 * inline images. Shared by the civilization / mod / region builders and wired
 * generically from main.js, so the three builders stay identical here.
 */

import { openImagePicker } from './imagePicker.js';
import { resolve as resolvePoolImage } from '../utils/imagePool.js';

function thumb(id) {
  const url = resolvePoolImage(id);
  return url
    ? `<img src="${url}" alt="" class="media-thumb">`
    : `<span class="media-thumb media-thumb-missing" title="missing image">⚠</span>`;
}

/** Builder-side imagery controls for an entry. */
export function renderMediaControls(data) {
  const hero = data.heroImage || '';
  const gallery = Array.isArray(data.gallery) ? data.gallery : [];

  const heroBlock = hero
    ? `${thumb(hero)}<button type="button" class="btn btn-secondary btn-sm" data-media="hero-clear">Remove</button>`
    : `<span class="media-empty">No hero image</span>`;

  const galleryItems = gallery
    .map(
      (id, i) => `
      <div class="media-gallery-item">
        ${thumb(id)}
        <div class="media-gallery-actions">
          <button type="button" data-media="gallery-left" data-index="${i}" title="Move left">◀</button>
          <button type="button" data-media="gallery-remove" data-index="${i}" title="Remove">✕</button>
          <button type="button" data-media="gallery-right" data-index="${i}" title="Move right">▶</button>
        </div>
      </div>`
    )
    .join('');

  return `
    <div class="form-section">
      <div class="section-header">🖼️ Imagery</div>
      <div class="form-group">
        <label>Hero Image</label>
        <div class="media-hero-row">
          <button type="button" class="btn btn-primary btn-sm" data-media="hero-pick">Pick Hero</button>
          ${heroBlock}
        </div>
      </div>
      <div class="form-group">
        <label>Carousel / Inspiration</label>
        <div class="media-gallery-row">
          ${galleryItems || '<span class="media-empty">No carousel images</span>'}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-media="gallery-add">＋ Add Image</button>
      </div>
      <div class="form-group">
        <label>Inline Image</label>
        <button type="button" class="btn btn-secondary btn-sm" data-media="inline-insert">🖼️ Insert into focused text field</button>
      </div>
    </div>`;
}

function insertAtCursor(field, text) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = field.value.slice(0, start) + text + field.value.slice(end);
  const pos = start + text.length;
  field.setSelectionRange(pos, pos);
  field.focus();
}

/**
 * Wire the media controls inside `container`.
 *   formData        — the entry object to mutate
 *   onMutate()      — called after hero/gallery changes (re-render + autosave)
 *   getFocusedField() — returns the prose <textarea> to insert inline images into
 */
export function attachMediaControls({ container, formData, onMutate, getFocusedField }) {
  container.querySelectorAll('[data-media]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.media;
      const idx = Number(btn.dataset.index);
      const gallery = Array.isArray(formData.gallery) ? formData.gallery.slice() : [];

      if (action === 'hero-pick') {
        const id = await openImagePicker();
        if (id) {
          formData.heroImage = id;
          onMutate();
        }
      } else if (action === 'hero-clear') {
        delete formData.heroImage;
        onMutate();
      } else if (action === 'gallery-add') {
        const id = await openImagePicker();
        if (id) {
          gallery.push(id);
          formData.gallery = gallery;
          onMutate();
        }
      } else if (action === 'gallery-remove') {
        gallery.splice(idx, 1);
        formData.gallery = gallery;
        onMutate();
      } else if (action === 'gallery-left' && idx > 0) {
        [gallery[idx - 1], gallery[idx]] = [gallery[idx], gallery[idx - 1]];
        formData.gallery = gallery;
        onMutate();
      } else if (action === 'gallery-right' && idx < gallery.length - 1) {
        [gallery[idx + 1], gallery[idx]] = [gallery[idx], gallery[idx + 1]];
        formData.gallery = gallery;
        onMutate();
      } else if (action === 'inline-insert') {
        const field = getFocusedField();
        if (!field) return;
        const id = await openImagePicker();
        if (id) {
          insertAtCursor(field, `![](pool:${id})`);
          // Let the existing form input handler pick up the change (formData + preview).
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
  });
}
