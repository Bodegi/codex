/**
 * Codex — Consume-fields picker.
 *
 * Shown right after an author adds a `group` component (issue #55): a checklist of the type's existing
 * top-level fields the new group can **absorb**. Because the group is brand-new (empty), wrapping each
 * entry's value into it is unambiguous, so absorbing is data-preserving — the migration runs on Save.
 * Picking none (Skip / Esc / backdrop) just leaves an empty new group.
 *
 * Resolves to the array of chosen field keys (`[]` when nothing is absorbed). Browser-only DOM, built on
 * the design-kit's native `<dialog class="ui-dialog">` — the eligibility decision (which fields qualify)
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

    const dialog = document.createElement('dialog');
    dialog.className = 'ui-dialog';
    dialog.setAttribute('aria-label', 'Absorb existing fields');
    dialog.innerHTML = `
      <div class="ui-dialog-header"><h2 class="ui-dialog-title">Absorb existing fields?</h2></div>
      <div class="ui-dialog-body">
        <p>The new group <strong>${escapeHtml(groupLabel)}</strong> can take over existing fields. Each entry’s value moves into the group when you Save — its data comes along, not left behind.</p>
        <div class="consume-list">${rows}</div>
      </div>
      <div class="ui-dialog-footer">
        <button type="button" class="ui-btn" data-size="sm" data-consume-skip>Skip</button>
        <button type="button" class="ui-btn" data-intent="primary" data-size="sm" data-consume-ok disabled>Absorb selected</button>
      </div>`;

    const okBtn = dialog.querySelector('[data-consume-ok]');
    const selectedKeys = () =>
      [...dialog.querySelectorAll('[data-consume-key]')].filter((c) => c.checked).map((c) => c.dataset.consumeKey);

    // Esc / backdrop / Skip absorbs nothing (`[]`); native showModal handles focus + Esc.
    let result = [];
    const finish = (keys) => { result = keys; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    dialog.addEventListener('change', (e) => {
      if (e.target.matches('[data-consume-key]')) okBtn.disabled = selectedKeys().length === 0;
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-consume-skip]')) return finish([]);
      if (e.target.closest('[data-consume-ok]')) return finish(selectedKeys());
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('[data-consume-skip]')?.focus();
  });
}
