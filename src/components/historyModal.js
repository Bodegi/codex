/**
 * Codex — Entry version-history modal.
 *
 * Lists an entry's earlier versions (the `history/{version}` ring, minus the live version the caller
 * filters out) and lets the user pick one to restore. Restore is non-destructive: it resolves the
 * chosen snapshot's data and the caller loads it into the editor as unsaved edits — the actual
 * overwrite only happens on the next Save. Resolves the picked snapshot's `data`, or `null` on close.
 *
 * Built on the design-kit's native `<dialog class="ui-dialog">`, like confirmModal.js / conflictModal.js;
 * it renders a scrollable list, so it carries a few `history-*` classes of its own.
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Open the version-history dialog.
 *   rows: [{ version, when, summary?, data }] — newest first; `data` is the full snapshot to restore.
 * Resolves the chosen row's `data`, or `null` if dismissed.
 */
export function openHistoryModal({ rows = [] } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ui-dialog';
    dialog.setAttribute('aria-label', 'Version history');

    const list = rows.length
      ? `<ul class="history-list">${rows.map((r, i) => `
          <li class="history-row">
            <div class="history-meta">
              <span class="history-version">Version ${escapeHtml(r.version)}</span>
              ${r.summary ? `<span class="history-summary">${escapeHtml(r.summary)}</span>` : ''}
              <span class="history-when">${escapeHtml(r.when)}</span>
            </div>
            <button type="button" class="ui-btn" data-size="sm" data-history-restore="${i}">Restore</button>
          </li>`).join('')}</ul>`
      : `<div class="history-empty">No earlier versions saved yet. History starts building the next time this entry is saved.</div>`;

    dialog.innerHTML = `
      <div class="ui-dialog-header"><h2 class="ui-dialog-title">Version history</h2></div>
      <div class="ui-dialog-body">
        <p>Restoring loads that version into the editor as unsaved edits — review it, then Save to keep it as the new current version. Nothing is overwritten until you save.</p>
        ${list}
      </div>
      <div class="ui-dialog-footer">
        <button type="button" class="ui-btn" data-size="sm" data-history-close>Close</button>
      </div>`;

    // Esc / backdrop / Close dismisses (null); native showModal handles focus + Esc.
    let result = null;
    const finish = (value) => { result = value; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-history-close]')) return finish(null); // backdrop or Close
      const restore = e.target.closest('[data-history-restore]');
      if (restore) return finish(rows[Number(restore.dataset.historyRestore)]?.data ?? null);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('[data-history-close]')?.focus();
  });
}
