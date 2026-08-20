/**
 * Codex — Group component (browser DOM).
 *
 * The interactive repeat editor for the `group` field kind: renders a group value as a stack of
 * record cards, each holding the group's sub-schema controls, plus add / remove / reorder-record
 * actions. It is registered indirectly — fieldKinds.js's `group.mount` calls `mountGroup`, handing in
 * a `{ getKind }` seam so this module never imports the registry (which would cycle).
 *
 * `mountGroup` is a scoped, one-level analog of main.js's own form orchestration: it renders each
 * inner kind's `renderInput`, harvests the scalar controls with a scoped scrape, and wires the inner
 * components that declare a `mount` (banner) — reporting the whole record-array up through `onChange`,
 * the single write path to `data[field.key]`. The group root carries `data-field-group`, which is
 * what tells the top-level harvest to leave these nested controls alone (see main.js).
 *
 * The pure model (schema/groupModel.js) owns normalize / sub-schema access / the record label.
 */

import { escapeHtml } from '../schema/inlineText.js';
import { normalizeGroup, groupSubFields, recordLabel } from '../schema/groupModel.js';

/** An empty value of the right shape for a fresh record's sub-field (mirrors entryDraft.blankEntry). */
function blankInner(sub) {
  if (sub.kind === 'list' || ((sub.kind === 'select' || sub.kind === 'reference') && sub.multi)) return [];
  return '';
}

/**
 * Read a scalar inner control back into its stored shape — the group-scoped twin of main.js's
 * `readFieldValue` (list → array; a multi select/reference text fallback → array; boolean → checked;
 * everything else → the raw string). The `.toggle-select` multi controls have no `data-field-kind`
 * and report by click instead, exactly as at the top level.
 */
function readInner(input) {
  const kind = input.dataset.fieldKind;
  if (kind === 'boolean') return input.checked;
  if (kind === 'list') return input.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if ((kind === 'reference' || kind === 'select') && input.dataset.multi) {
    return input.multiple
      ? [...input.selectedOptions].map((o) => o.value).filter(Boolean)
      : input.value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return input.value;
}

export function mountGroup(el, { field, value, onChange, ctx }, { getKind }) {
  const subs = groupSubFields(field);
  let records = normalizeGroup(value);
  const persist = () => onChange(records.map((r) => ({ ...r })));

  const subControl = (sub, rec) => {
    const kind = getKind(sub.kind);
    if (!kind || sub.kind === 'heading') return '';
    const label = sub.label ? `<label class="group-sub-label">${escapeHtml(sub.label)}</label>` : '';
    return `<div class="group-sub" data-sub-key="${escapeHtml(sub.key)}">${label}${kind.renderInput(sub, rec[sub.key], ctx)}</div>`;
  };

  const recordCard = (rec, i) => {
    const body = subs.map((sub) => subControl(sub, rec)).join('');
    return `<div class="group-record" data-record-index="${i}">
        <div class="group-record-head">
          <span class="group-record-title">${escapeHtml(recordLabel(field, rec, i))}</span>
          <span class="group-record-actions">
            <button type="button" data-group="up"${i === 0 ? ' disabled' : ''} title="Move up" aria-label="Move item up">▲</button>
            <button type="button" data-group="down"${i === records.length - 1 ? ' disabled' : ''} title="Move down" aria-label="Move item down">▼</button>
            <button type="button" data-group="remove" title="Remove item" aria-label="Remove item">×</button>
          </span>
        </div>
        <div class="group-record-body">${body}</div>
      </div>`;
  };

  // Wire the freshly-painted cards. Scalar controls scrape into their record; the click-to-toggle
  // multi controls report by click; inner components with a mount (banner) get mounted with a
  // record-scoped onChange. Called after every paint, so the nodes are always fresh — no stacking.
  const wireInner = () => {
    el.querySelectorAll('.group-record').forEach((card) => {
      const i = Number(card.dataset.recordIndex);

      card.querySelectorAll('[data-field-kind]').forEach((input) => {
        const sync = () => { records[i][input.dataset.fieldKey] = readInner(input); persist(); };
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
      });

      card.querySelectorAll('.toggle-select').forEach((ctrl) => {
        ctrl.addEventListener('click', (e) => {
          const opt = e.target.closest('.toggle-option');
          if (!opt || !ctrl.contains(opt)) return;
          const now = opt.getAttribute('aria-selected') !== 'true';
          opt.setAttribute('aria-selected', String(now));
          opt.classList.toggle('is-selected', now);
          records[i][ctrl.dataset.fieldKey] = [...ctrl.querySelectorAll('.toggle-option')]
            .filter((b) => b.getAttribute('aria-selected') === 'true')
            .map((b) => b.dataset.value);
          persist();
        });
      });

      card.querySelectorAll('.group-sub').forEach((subEl) => {
        const sub = subs.find((s) => s.key === subEl.dataset.subKey);
        const component = sub && getKind(sub.kind);
        if (!component?.mount) return;
        const root = subEl.querySelector('[data-field-key]');
        if (!root) return;
        component.mount(root, {
          field: sub,
          value: records[i][sub.key],
          onChange: (v) => {
            records[i][sub.key] = v;
            persist();
            // A selfRender inner (banner) repaints its own subtree; repainting the group would tear
            // that live designer down mid-edit. Only a non-selfRender inner needs the group repaint.
            if (!component.selfRender) paint();
          },
          ctx,
        });
      });
    });
  };

  const paint = () => {
    const label = field.label ? `<label class="group-designer-label">${escapeHtml(field.label)}</label>` : '';
    const cards = records.map((rec, i) => recordCard(rec, i)).join('') || '<p class="muted group-empty">No items yet.</p>';
    el.innerHTML = `${label}<div class="group-records">${cards}</div><button type="button" class="btn btn-secondary btn-sm group-add" data-group="add">＋ Add item</button>`;
    wireInner();
  };

  // One delegated click listener on the container survives every innerHTML repaint (it lives on `el`,
  // not the children). Record actions only — inner banner buttons carry data-act and are ignored here.
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-group]');
    if (!btn || btn.disabled || !el.contains(btn)) return;
    const card = btn.closest('.group-record');
    const i = card ? Number(card.dataset.recordIndex) : -1;
    const act = btn.dataset.group;
    if (act === 'add') {
      records.push(Object.fromEntries(subs.map((s) => [s.key, blankInner(s)])));
      persist();
      paint();
    } else if (act === 'remove' && i >= 0) {
      records.splice(i, 1);
      persist();
      paint();
    } else if (act === 'up' && i > 0) {
      [records[i - 1], records[i]] = [records[i], records[i - 1]];
      persist();
      paint();
    } else if (act === 'down' && i >= 0 && i < records.length - 1) {
      [records[i + 1], records[i]] = [records[i], records[i + 1]];
      persist();
      paint();
    }
  });

  paint();
}
