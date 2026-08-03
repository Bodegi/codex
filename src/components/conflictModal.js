/**
 * Codex — Save-conflict modal.
 *
 * Shown when an explicit Save loses the version race: someone else saved this entry while it was open.
 * The user's edits are NOT discarded — they choose. Resolves to:
 *   'overwrite' — write mine anyway (rebased onto their version)
 *   'reload'    — discard mine and load their latest
 *   null        — dismiss (Esc / click outside): stay in edit with the unsaved edits intact
 *
 * Reuses the `confirm-overlay` / `confirm-modal` idiom (and CSS) of confirmModal.js; it needs three
 * outcomes, which the boolean openConfirm can't express, so it's its own small component.
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Open the conflict dialog. Resolves 'overwrite' | 'reload' | null. */
export function openConflictModal({
  title = 'Someone else saved this entry',
  message = 'Another editor saved changes while you were editing. Keep your version or reload theirs?',
  overwriteLabel = 'Overwrite with mine',
  reloadLabel = 'Discard mine & reload theirs',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="confirm-header"><strong>${escapeHtml(title)}</strong></div>
        <div class="confirm-body">${escapeHtml(message)}</div>
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-conflict-reload>${escapeHtml(reloadLabel)}</button>
          <button type="button" class="btn btn-primary btn-sm" data-conflict-overwrite>${escapeHtml(overwriteLabel)}</button>
        </div>
      </div>`;

    const done = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(null);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return done(null);
      if (e.target.closest('[data-conflict-reload]')) return done('reload');
      if (e.target.closest('[data-conflict-overwrite]')) return done('overwrite');
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-conflict-overwrite]')?.focus();
  });
}
