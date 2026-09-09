/**
 * Codex — Save-conflict modal.
 *
 * Shown when an explicit Save loses the version race: someone else saved this entry while it was open.
 * The user's edits are NOT discarded — they choose. Resolves to:
 *   'overwrite' — write mine anyway (rebased onto their version)
 *   'reload'    — discard mine and load their latest
 *   null        — dismiss (Esc / click outside): stay in edit with the unsaved edits intact
 *
 * Built on the design-kit's native `<dialog class="ui-dialog">`, like confirmModal.js; it needs
 * three outcomes, which the boolean openConfirm can't express, so it's its own small component.
 * showModal() gives the focus trap, Esc handling and focus restore natively.
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
    const dialog = document.createElement('dialog');
    dialog.className = 'ui-dialog';
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = `
      <div class="ui-dialog-header"><h2 class="ui-dialog-title">${escapeHtml(title)}</h2></div>
      <div class="ui-dialog-body">${escapeHtml(message)}</div>
      <div class="ui-dialog-footer">
        <button type="button" class="ui-btn" data-size="sm" data-conflict-reload>${escapeHtml(reloadLabel)}</button>
        <button type="button" class="ui-btn" data-intent="primary" data-size="sm" data-conflict-overwrite>${escapeHtml(overwriteLabel)}</button>
      </div>`;

    // Esc / backdrop leaves the decision unmade (null) — the caller keeps the unsaved edits.
    let result = null;
    const finish = (value) => { result = value; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) return finish(null); // backdrop
      if (e.target.closest('[data-conflict-reload]')) return finish('reload');
      if (e.target.closest('[data-conflict-overwrite]')) return finish('overwrite');
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('[data-conflict-overwrite]')?.focus();
  });
}
