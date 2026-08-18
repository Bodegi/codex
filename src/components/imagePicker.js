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
 * `multiple: true` switches to gallery mode: thumbnails toggle a checked state instead of
 * resolving on click, and a footer "Add N" button resolves with the ordered array of picked
 * ids (or [] if cancelled). The default single-select flow (hero, inline image) is unchanged,
 * still resolving one id — so callers branch on the shape only when they asked for `multiple`.
 *
 * Editors of the current codex get two extra affordances, wired through injected callbacks
 * so the picker itself stays store-free:
 *   - **Upload** — `onUpload(file) → id | { id, label, url }` uploads one file into the current
 *     codex. The Upload button and drag-and-drop both accept *multiple* files: they upload in
 *     sequence (with progress) and append each new thumb to the grid. A *single* file is the
 *     upload-and-use flow — the picker resolves with its id immediately; dropping several leaves
 *     the picker open so the author can pick one.
 *   - a per-thumb **remove-from-this-codex** ✕ — `onRemove(id)` drops the image from the
 *     current codex (confirm + Firestore live in the caller); on success the thumb is pulled.
 * Both are shown only when `canManage` is true; without the callbacks the picker is pick-only.
 */

import { notFoundImage } from '../schema/notFoundImage.js';
import { validateImageFile } from '../schema/imageUpload.js';

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemHtml(img, canManage, multiple) {
  return `
    <div class="image-picker-item${multiple ? ' is-multi' : ''}" data-id="${escapeAttr(img.id)}" title="${escapeAttr(img.label)}">
      <button type="button" class="image-picker-pick" data-pick aria-pressed="false">
        ${img.url ? `<img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.label)}" loading="lazy">` : notFoundImage('image-missing-picker')}
        <span>${escapeAttr(img.label)}</span>
        ${multiple ? '<span class="image-picker-check" aria-hidden="true">✓</span>' : ''}
      </button>
      ${canManage ? `<button type="button" class="image-picker-remove" data-remove aria-label="Remove from this codex" title="Remove from this codex">×</button>` : ''}
    </div>`;
}

/**
 * Open the picker over an injected image list ([{ id, label, url }], from the live index).
 * Single-select (default) resolves to the picked (or just-uploaded) image id, or null if
 * cancelled. `multiple: true` resolves to the ordered array of checked ids, or [] if cancelled.
 *   opts = { canManage, multiple, onUpload(file) → Promise<id | {id,label,url}>, onRemove(id) → Promise<boolean> }
 */
export function openImagePicker(images = [], { canManage = false, multiple = false, onUpload, onRemove } = {}) {
  return new Promise((resolve) => {
    const list = images.slice();
    // Ordered set of picked ids (multi mode only); selection order is the insert order.
    const picked = [];

    const gridHtml = () =>
      list.length
        ? list.map((img) => itemHtml(img, canManage && !!onRemove, multiple)).join('')
        : `<p class="image-picker-empty">No images in this codex yet.</p>`;

    const overlay = document.createElement('div');
    overlay.className = 'image-picker-overlay';
    overlay.innerHTML = `
      <div class="image-picker-modal" role="dialog" aria-modal="true" aria-label="${multiple ? 'Select images' : 'Select an image'}">
        <div class="image-picker-header">
          <strong>${multiple ? 'Select images' : 'Select an image'}</strong>
          ${canManage && onUpload ? `<button type="button" class="btn btn-primary btn-sm image-picker-upload" data-upload title="Upload images — pick several, or drag them onto this window">＋ Upload</button>` : ''}
          <button type="button" class="image-picker-close" aria-label="Close" title="Close">×</button>
        </div>
        <div class="image-picker-status" data-status hidden></div>
        <div class="image-picker-grid">${gridHtml()}</div>
        ${multiple ? `<div class="image-picker-footer"><button type="button" class="btn btn-primary image-picker-confirm" data-confirm disabled>Add images</button></div>` : ''}
      </div>`;

    const grid = overlay.querySelector('.image-picker-grid');
    const statusEl = overlay.querySelector('[data-status]');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.hidden = true;
    overlay.appendChild(fileInput);

    const modal = overlay.querySelector('.image-picker-modal');
    const uploadBtn = overlay.querySelector('[data-upload]');
    const confirmBtn = overlay.querySelector('[data-confirm]');
    const canUpload = canManage && !!onUpload;

    const setStatus = (msg, isError = false) => {
      statusEl.textContent = msg || '';
      statusEl.hidden = !msg;
      statusEl.classList.toggle('is-error', isError);
    };

    // Cancelling yields the empty shape for the caller's mode: [] in multi, null in single.
    const cancelValue = () => (multiple ? [] : null);
    const close = (value) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(cancelValue());
    };

    // Toggle one thumb's picked state (multi mode); keep the confirm button in sync.
    const togglePick = (item) => {
      const id = item.dataset.id;
      const i = picked.indexOf(id);
      const nowPicked = i === -1;
      if (nowPicked) picked.push(id);
      else picked.splice(i, 1);
      item.classList.toggle('is-picked', nowPicked);
      item.querySelector('[data-pick]')?.setAttribute('aria-pressed', String(nowPicked));
      confirmBtn.disabled = picked.length === 0;
      confirmBtn.textContent = picked.length ? `Add ${picked.length} image${picked.length > 1 ? 's' : ''}` : 'Add images';
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return close(cancelValue());
      if (e.target.closest('.image-picker-close')) return close(cancelValue());
      if (e.target.closest('[data-upload]')) return fileInput.click();
      if (e.target.closest('[data-confirm]')) return close(picked.slice());

      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        const item = removeBtn.closest('.image-picker-item');
        return handleRemove(item);
      }
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const item = pick.closest('.image-picker-item');
        if (!item) return;
        if (multiple) return togglePick(item);
        close(item.dataset.id);
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
          if (item.classList.contains('is-picked')) togglePick(item); // drop it from the pending selection
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

    const setBusy = (busy) => {
      if (uploadBtn) uploadBtn.disabled = busy;
      overlay.classList.toggle('is-uploading', busy);
    };

    // Normalize onUpload's result: a bare id string, or a { id, label, url } descriptor.
    const toImage = (res, file) =>
      res && typeof res === 'object'
        ? { id: res.id, label: res.label || file.name, url: res.url || null }
        : { id: res, label: file.name, url: null };

    // Append a just-uploaded thumb to the live grid (dedup hits already in view are skipped).
    const addThumb = (img) => {
      if (!img.id || list.some((x) => x.id === img.id)) return false;
      if (!list.length) grid.innerHTML = ''; // clear the "no images" message
      list.push(img);
      grid.insertAdjacentHTML('beforeend', itemHtml(img, canManage && !!onRemove, multiple));
      return true;
    };

    // Upload one or many files in sequence. A single file is upload-and-use (resolve immediately);
    // several stay open with their new thumbs so the author can pick one.
    async function uploadFiles(fileList) {
      if (!onUpload) return;
      // Split into valid uploads and rejects (wrong type / too large) so a bad file gets an inline
      // reason instead of being silently ignored.
      const files = [];
      const rejects = [];
      for (const f of Array.from(fileList || [])) {
        const problem = validateImageFile({ type: f.type, size: f.size });
        if (problem) rejects.push(`${f.name}: ${problem}`);
        else files.push(f);
      }
      if (!files.length) {
        if (rejects.length) {
          setStatus(rejects.length === 1 ? rejects[0] : `Skipped ${rejects.length} files — unsupported type or too large.`, true);
        }
        return;
      }
      setBusy(true);
      const uploaded = [];
      let failed = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus(files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${file.name}…` : `Uploading ${file.name}…`);
        try {
          const img = toImage(await onUpload(file), file);
          addThumb(img);
          uploaded.push(img);
        } catch (err) {
          failed++;
          setStatus(`Upload failed for ${file.name}: ${err.message}`, true);
        }
      }
      fileInput.value = '';
      setBusy(false);
      // Upload-and-use only when the user offered exactly one file and it went through cleanly.
      // In multi mode there is no upload-and-use — the new thumb just joins the grid to be picked.
      if (!multiple && files.length === 1 && uploaded.length === 1 && !rejects.length) return close(uploaded[0].id);
      if (uploaded.length) {
        const n = uploaded.length;
        const skipped = rejects.length ? `, ${rejects.length} skipped` : '';
        setStatus(`Added ${n} image${n > 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}${skipped}. Click one to use it.`);
      }
    }

    fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

    // Drag-and-drop uploading (editors only). The dashed overlay shows while a drag hovers the modal.
    if (canUpload) {
      const stop = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      ['dragenter', 'dragover'].forEach((ev) =>
        modal.addEventListener(ev, (e) => {
          stop(e);
          e.dataTransfer.dropEffect = 'copy';
          modal.classList.add('is-dragover');
        })
      );
      modal.addEventListener('dragleave', (e) => {
        if (!modal.contains(e.relatedTarget)) modal.classList.remove('is-dragover');
      });
      modal.addEventListener('drop', (e) => {
        stop(e);
        modal.classList.remove('is-dragover');
        uploadFiles(e.dataTransfer.files);
      });
    }

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}
