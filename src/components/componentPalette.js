/**
 * Codex — Component palette.
 *
 * The Structure editor's field picker: a modal grid of named, described component cards (icon +
 * title + one-line hint) sourced from the one registry (`paletteComponents()`). Replaces the raw
 * kind `<select>` — an author picks "Paragraph" or "Banner image", never the internal `prose`/`hero`
 * key. Used from two entry points: "＋ add field" (add a new component) and a field row's kind chip
 * (change an existing field's component).
 *
 *   const kind = await openComponentPalette();               // add
 *   const kind = await openComponentPalette({ current });    // change (current card is marked)
 *
 * Resolves to the picked kind string, or null if cancelled (Escape / backdrop / ✕ / picking the
 * card that's already current). Browser-only DOM, mirroring imagePicker.js — the palette *model* it
 * renders is pure and Node-tested in fieldKinds.js.
 */

import { paletteComponents } from '../schema/fieldKinds.js';
import { icon } from '../utils/uiIcon.js';

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cardHtml({ kind, title, description, icon }, current) {
  const isCurrent = kind === current;
  return `
    <button type="button" class="palette-card${isCurrent ? ' is-current' : ''}" data-kind="${escapeAttr(kind)}"${isCurrent ? ' aria-current="true"' : ''}>
      <span class="palette-card-icon">${icon}</span>
      <span class="palette-card-text">
        <span class="palette-card-title">${escapeAttr(title)}</span>
        <span class="palette-card-desc">${escapeAttr(description)}</span>
      </span>
    </button>`;
}

/**
 * Open the palette; resolve to the chosen kind, or null if cancelled. `allow` (an array/set of kind
 * keys) restricts the offered components — a group's sub-schema picker passes the inner allow-list so
 * `group` (no nesting) and the media/canvas kinds never appear one level down.
 */
export function openComponentPalette({ current = '', allow = null } = {}) {
  return new Promise((resolve) => {
    const heading = current ? 'Change component' : 'Add a component';
    const allowSet = allow ? new Set(allow) : null;
    const components = paletteComponents().filter((c) => !allowSet || allowSet.has(c.kind));
    const cards = components.map((c) => cardHtml(c, current)).join('');

    const dialog = document.createElement('dialog');
    dialog.className = 'ui-dialog codex-picker';
    dialog.setAttribute('aria-label', heading);
    dialog.innerHTML = `
      <div class="ui-dialog-header">
        <h2 class="ui-dialog-title">${heading}</h2>
        <button type="button" class="ui-btn" data-variant="ghost" data-size="icon-sm" data-palette-close aria-label="Close" title="Close">${icon('close', { size: 'sm' })}</button>
      </div>
      <div class="ui-dialog-body"><div class="palette-grid">${cards}</div></div>`;

    // Native <dialog>: showModal() gives the backdrop, focus trap and Esc; the pick is read on `close`.
    let result = null;
    const finish = (kind) => { result = kind; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-palette-close]')) return finish(null); // backdrop or ✕
      const card = e.target.closest('[data-kind]');
      if (card) {
        const kind = card.dataset.kind;
        // Re-picking the current component is a no-op cancel, so the caller never rebuilds needlessly.
        finish(kind === current ? null : kind);
      }
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('.palette-card')?.focus();
  });
}
