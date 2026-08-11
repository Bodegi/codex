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
 *
 * It guards an unsaved-edits decision, so — like confirmModal — it keeps focus inside the dialog
 * while open (Tab cycles the two buttons) and returns focus to the triggering control on close.
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

    const previouslyFocused = document.activeElement;
    const done = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.(); // return focus to whatever opened the dialog
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') return done(null);
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
      if (e.target === overlay) return done(null);
      if (e.target.closest('[data-conflict-reload]')) return done('reload');
      if (e.target.closest('[data-conflict-overwrite]')) return done('overwrite');
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-conflict-overwrite]')?.focus();
  });
}
