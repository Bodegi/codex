/**
 * Codex — Confirm modal.
 *
 * A small reusable "are you sure?" overlay that resolves to a boolean. Exists because
 * native `confirm()` freezes the Chrome test extension (it blocks the event loop the
 * automation drives), so every destructive in-app action routes through this instead.
 * Same overlay idiom as `imagePicker.js` / `lightbox.js`: dimmed backdrop, Esc or a
 * click on Cancel / outside resolves false, the confirm button resolves true.
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Open a confirm dialog. Resolves true if the user confirms, false otherwise.
 *   { title, message, confirmLabel?, cancelLabel?, danger? }
 * `danger` styles the confirm button as destructive (the default for delete/archive).
 */
export function openConfirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Confirm')}">
        <div class="confirm-header"><strong>${escapeHtml(title || 'Are you sure?')}</strong></div>
        ${message ? `<div class="confirm-body">${escapeHtml(message)}</div>` : ''}
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

    const done = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') done(true);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-confirm-cancel]')) return done(false);
      if (e.target.closest('[data-confirm-ok]')) return done(true);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-confirm-ok]')?.focus();
  });
}
