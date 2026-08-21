/**
 * Codex — Confirm modal.
 *
 * A small reusable "are you sure?" overlay that resolves to a boolean. Exists because
 * native `confirm()` freezes the Chrome test extension (it blocks the event loop the
 * automation drives), so every destructive in-app action routes through this instead.
 * Same overlay idiom as `imagePicker.js` / `lightbox.js`: dimmed backdrop, Esc or a
 * click on Cancel / outside resolves false, the confirm button resolves true.
 *
 * It guards destructive actions, so it keeps focus inside the dialog while open (Tab
 * cycles the two buttons) and returns focus to the triggering control on close.
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
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Confirm')}">
        <div class="confirm-header"><strong>${escapeHtml(title || 'Are you sure?')}</strong></div>
        ${body ? `<div class="confirm-body">${body}</div>` : ''}
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

    const previouslyFocused = document.activeElement;
    const done = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.(); // return focus to whatever opened the dialog
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') return done(false);
      if (e.key === 'Enter') return done(true);
      if (e.key === 'Tab') {
        // Trap Tab within the dialog's two buttons so focus can't wander to the page behind.
        const focusables = [...overlay.querySelectorAll('button')];
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !overlay.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
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
