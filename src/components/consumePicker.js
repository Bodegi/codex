/**
 * Codex — Consume-fields picker.
 *
 * Shown right after an author adds a `group` component (issue #55): a checklist of the type's existing
 * top-level fields the new group can **absorb**. Because the group is brand-new (empty), wrapping each
 * entry's value into it is unambiguous, so absorbing is data-preserving — the migration runs on Save.
 * Picking none (Skip / Esc / backdrop) just leaves an empty new group.
 *
 * Resolves to the array of chosen field keys (`[]` when nothing is absorbed). Browser-only DOM, reusing
 * the confirm-modal overlay shell (confirmModal.js) — the eligibility decision (which fields qualify)
 * lives with the caller, not here.
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Open the picker for a new group. `fields` is the eligible list: `[{ key, label, kindTitle }]`.
 * Resolves to the selected keys (`[]` on Skip / Esc / backdrop). Callers should only open it when
 * `fields` is non-empty.
 */
export function openConsumePicker(groupLabel, fields = []) {
  return new Promise((resolve) => {
    const rows = fields
      .map(
        (f) => `
        <label class="consume-item">
          <input type="checkbox" data-consume-key="${escapeHtml(f.key)}">
          <span class="consume-item-label">${escapeHtml(f.label || f.key)}</span>
          <span class="consume-item-kind">${escapeHtml(f.kindTitle || '')}</span>
        </label>`
      )
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="Absorb existing fields">
        <div class="confirm-header"><strong>Absorb existing fields?</strong></div>
        <div class="confirm-body">
          <p>The new group <strong>${escapeHtml(groupLabel)}</strong> can take over existing fields. Each entry’s value moves into the group when you Save — its data comes along, not left behind.</p>
          <div class="consume-list">${rows}</div>
        </div>
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-consume-skip>Skip</button>
          <button type="button" class="btn btn-primary btn-sm" data-consume-ok disabled>Absorb selected</button>
        </div>
      </div>`;

    const okBtn = overlay.querySelector('[data-consume-ok]');
    const selectedKeys = () =>
      [...overlay.querySelectorAll('[data-consume-key]')].filter((c) => c.checked).map((c) => c.dataset.consumeKey);

    const previouslyFocused = document.activeElement;
    const done = (keys) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
      resolve(keys);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done([]);
    };

    overlay.addEventListener('change', (e) => {
      if (e.target.matches('[data-consume-key]')) okBtn.disabled = selectedKeys().length === 0;
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-consume-skip]')) return done([]);
      if (e.target.closest('[data-consume-ok]')) return done(selectedKeys());
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-consume-skip]')?.focus();
  });
}
