/**
 * Codex — Confirm modal.
 *
 * A small reusable "are you sure?" dialog that resolves to a boolean. Exists because
 * native `confirm()` freezes the Chrome test extension (it blocks the event loop the
 * automation drives), so every destructive in-app action routes through this instead.
 * Built on the design-kit's native `<dialog class="ui-dialog">`: `showModal()` gives the
 * backdrop, focus trap and Esc handling for free — Esc or a click on Cancel / the backdrop
 * resolves false, the confirm button resolves true. Focus returns to the invoker natively.
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
 *   { title, message, messageHtml?, confirmLabel?, cancelLabel?, danger? }
 * `message` is escaped; `messageHtml` (used when a plain sentence isn't enough, e.g. a change list)
 * is inserted raw, so the caller MUST sanitize any dynamic text it contains. `danger` styles the
 * confirm button as destructive (the default for delete/archive).
 */
export function openConfirm({ title, message, messageHtml, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true } = {}) {
  const body = messageHtml ?? (message ? escapeHtml(message) : '');
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ui-dialog';
    dialog.setAttribute('aria-label', title || 'Confirm');
    dialog.innerHTML = `
      <div class="ui-dialog-header"><h2 class="ui-dialog-title">${escapeHtml(title || 'Are you sure?')}</h2></div>
      ${body ? `<div class="ui-dialog-body">${body}</div>` : ''}
      <div class="ui-dialog-footer">
        <button type="button" class="ui-btn" data-size="sm" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
        <button type="button" class="ui-btn" data-size="sm" data-intent="${danger ? 'danger' : 'primary'}" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
      </div>`;

    // Native <dialog>: showModal() traps focus and handles Esc (the `cancel` event); the outcome
    // is stashed then read when the dialog `close`s, which also restores focus to the invoker.
    let result = false;
    const finish = (value) => { result = value; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    dialog.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-confirm-cancel]')) return finish(false); // backdrop or Cancel
      if (e.target.closest('[data-confirm-ok]')) return finish(true);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('[data-confirm-ok]')?.focus();
  });
}
