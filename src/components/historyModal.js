/**
 * Codex — Entry version-history modal.
 *
 * Lists an entry's earlier versions (the `history/{version}` ring, minus the live version the caller
 * filters out) and lets the user pick one to restore. Restore is non-destructive: it resolves the
 * chosen snapshot's data and the caller loads it into the editor as unsaved edits — the actual
 * overwrite only happens on the next Save. Resolves the picked snapshot's `data`, or `null` on close.
 *
 * Same overlay idiom as confirmModal.js / conflictModal.js (reuses `confirm-overlay` / `confirm-modal`
 * CSS); it renders a scrollable list, so it carries a few `history-*` classes of its own.
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
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const list = rows.length
      ? `<ul class="history-list">${rows.map((r, i) => `
          <li class="history-row">
            <div class="history-meta">
              <span class="history-version">Version ${escapeHtml(r.version)}</span>
              ${r.summary ? `<span class="history-summary">${escapeHtml(r.summary)}</span>` : ''}
              <span class="history-when">${escapeHtml(r.when)}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-history-restore="${i}">Restore</button>
          </li>`).join('')}</ul>`
      : `<div class="history-empty">No earlier versions saved yet. History starts building the next time this entry is saved.</div>`;

    overlay.innerHTML = `
      <div class="confirm-modal history-modal" role="dialog" aria-modal="true" aria-label="Version history">
        <div class="confirm-header"><strong>Version history</strong></div>
        <div class="confirm-body">Restoring loads that version into the editor as unsaved edits — review it, then Save to keep it as the new current version. Nothing is overwritten until you save.</div>
        ${list}
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-history-close>Close</button>
        </div>
      </div>`;

    const previouslyFocused = document.activeElement;
    const done = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(null);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-history-close]')) return done(null);
      const restore = e.target.closest('[data-history-restore]');
      if (restore) return done(rows[Number(restore.dataset.historyRestore)]?.data ?? null);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-history-close]')?.focus();
  });
}
