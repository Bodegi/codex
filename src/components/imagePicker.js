/**
 * Codex — Image Picker
 *
 * Reusable modal that shows the codex's images as a thumbnail grid. Returns the picked
 * image's stable id (or null if cancelled). Used by the hero, carousel, and inline-image
 * consumers — none of them talk to the image index for selection UI directly. The image
 * list is injected (the live index lives in main.js), so this component imports no store.
 *
 *   const id = await openImagePicker(imageIndex.listImages());
 *
 * Editors of the current codex get two extra affordances, wired through injected callbacks
 * so the picker itself stays store-free:
 *   - an **Upload** button — `onUpload(file) → id` uploads into the current codex, then the
 *     picker resolves with the new id (upload-and-use is the natural authoring flow).
 *   - a per-thumb **remove-from-this-codex** ✕ — `onRemove(id)` drops the image from the
 *     current codex (confirm + Firestore live in the caller); on success the thumb is pulled.
 * Both are shown only when `canManage` is true; without the callbacks the picker is pick-only.
 */

import { notFoundImage } from '../schema/notFoundImage.js';

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemHtml(img, canManage) {
  return `
    <div class="image-picker-item" data-id="${escapeAttr(img.id)}" title="${escapeAttr(img.label)}">
      <button type="button" class="image-picker-pick" data-pick>
        ${img.url ? `<img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.label)}" loading="lazy">` : notFoundImage('image-missing-picker')}
        <span>${escapeAttr(img.label)}</span>
      </button>
      ${canManage ? `<button type="button" class="image-picker-remove" data-remove aria-label="Remove from this codex" title="Remove from this codex">×</button>` : ''}
    </div>`;
}

/**
 * Open the picker over an injected image list ([{ id, label, url }], from the live index).
 * Resolves to the picked (or just-uploaded) image id, or null if cancelled.
 *   opts = { canManage, onUpload(file) → Promise<id>, onRemove(id) → Promise<boolean> }
 */
export function openImagePicker(images = [], { canManage = false, onUpload, onRemove } = {}) {
  return new Promise((resolve) => {
    const list = images.slice();

    const gridHtml = () =>
      list.length
        ? list.map((img) => itemHtml(img, canManage && !!onRemove)).join('')
        : `<p class="image-picker-empty">No images in this codex yet.</p>`;

    const overlay = document.createElement('div');
    overlay.className = 'image-picker-overlay';
    overlay.innerHTML = `
      <div class="image-picker-modal" role="dialog" aria-modal="true" aria-label="Select an image">
        <div class="image-picker-header">
          <strong>Select an image</strong>
          ${canManage && onUpload ? `<button type="button" class="btn btn-primary btn-sm image-picker-upload" data-upload>＋ Upload</button>` : ''}
          <button type="button" class="image-picker-close" aria-label="Close">×</button>
        </div>
        <div class="image-picker-status" data-status hidden></div>
        <div class="image-picker-grid">${gridHtml()}</div>
      </div>`;

    const grid = overlay.querySelector('.image-picker-grid');
    const statusEl = overlay.querySelector('[data-status]');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    overlay.appendChild(fileInput);

    const setStatus = (msg, isError = false) => {
      statusEl.textContent = msg || '';
      statusEl.hidden = !msg;
      statusEl.classList.toggle('is-error', isError);
    };

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
      if (e.target.closest('[data-upload]')) return fileInput.click();

      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        const item = removeBtn.closest('.image-picker-item');
        return handleRemove(item);
      }
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const item = pick.closest('.image-picker-item');
        if (item) close(item.dataset.id);
      }
    });

    async function handleRemove(item) {
      if (!item || !onRemove) return;
      const id = item.dataset.id;
      item.classList.add('is-busy');
      try {
        const removed = await onRemove(id);
        if (removed) {
          const i = list.findIndex((img) => img.id === id);
          if (i !== -1) list.splice(i, 1);
          item.remove();
          if (!list.length) grid.innerHTML = gridHtml();
        } else {
          item.classList.remove('is-busy');
        }
      } catch (err) {
        item.classList.remove('is-busy');
        setStatus(`Remove failed: ${err.message}`, true);
      }
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file || !onUpload) return;
      setStatus(`Uploading ${file.name}…`);
      try {
        const id = await onUpload(file);
        close(id);
      } catch (err) {
        setStatus(`Upload failed: ${err.message}`, true);
        fileInput.value = '';
      }
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}
