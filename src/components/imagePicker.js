/**
 * Codex — Image Picker
 *
 * Reusable modal that shows the codex's images as a thumbnail grid. Returns the picked
 * image's stable id (or null if cancelled). Used by the hero, carousel, and inline-image
 * consumers — none of them talk to the image index for selection UI directly. The image
 * list is injected (the live index lives in main.js), so this component imports no store.
 *
 *   const id = await openImagePicker(imageIndex.listImages());
 */

import { notFoundImage } from '../schema/notFoundImage.js';

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Open the picker over an injected image list ([{ id, label, url }], from the live index).
 * Resolves to the picked image id, or null if cancelled.
 */
export function openImagePicker(images = []) {
  return new Promise((resolve) => {
    const grid = images.length
      ? images
          .map(
            (img) => `
        <button type="button" class="image-picker-item" data-id="${escapeAttr(img.id)}" title="${escapeAttr(img.label)}">
          ${img.url ? `<img src="${img.url}" alt="${escapeAttr(img.label)}" loading="lazy">` : notFoundImage('image-missing-picker')}
          <span>${escapeAttr(img.label)}</span>
        </button>`
          )
          .join('')
      : `<p class="image-picker-empty">No images available yet.</p>`;

    const overlay = document.createElement('div');
    overlay.className = 'image-picker-overlay';
    overlay.innerHTML = `
      <div class="image-picker-modal" role="dialog" aria-modal="true" aria-label="Select an image">
        <div class="image-picker-header">
          <strong>Select an image</strong>
          <button type="button" class="image-picker-close" aria-label="Close">×</button>
        </div>
        <div class="image-picker-grid">${grid}</div>
      </div>`;

    const close = (id) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(id);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return close(null);
      if (e.target.closest('.image-picker-close')) return close(null);
      const item = e.target.closest('.image-picker-item');
      if (item) return close(item.dataset.id);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}
