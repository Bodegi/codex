/**
 * Global-admin panels (admin-only): the Users & Access roster, the Codices manager, and the
 * Images gallery. Panel switching + a way back out live in the sidebar (main.js renderAdminNav),
 * not here. Pure HTML builders; main.js owns the wiring (roster subscriptions, grant/revoke, codex
 * create/rename/archive, image label/cross-assign/archive/restore).
 */

import { notFoundImage } from '../schema/notFoundImage.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Users & Access panel: a roster table with a role control per user.
 * `rows` = [{ uid, email, displayName, lastSeenAt, role: 'none'|'viewer'|'editor', isAdmin }].
 */
export function renderAccessPanel({ codexId, rows }) {
  const roleBtn = (uid, role, current, label) =>
    `<button class="role-btn${current === role ? ' active' : ''}" data-grant-uid="${escapeHtml(uid)}" data-grant-role="${role}">${label}</button>`;

  const roleControl = (r) =>
    r.isAdmin
      ? '<span class="admin-muted">super-admin</span>'
      : `<div class="role-group">
           ${roleBtn(r.uid, 'none', r.role, 'No access')}
           ${roleBtn(r.uid, 'viewer', r.role, 'Viewer')}
           ${roleBtn(r.uid, 'editor', r.role, 'Editor')}
         </div>`;

  const rowsHtml = rows.length
    ? rows
        .map(
          (r) => `
      <tr>
        <td>
          <strong>${escapeHtml(r.displayName || r.email || r.uid)}</strong>${r.isAdmin ? ' <span class="admin-badge">admin</span>' : ''}
          <br><span class="admin-muted">${escapeHtml(r.email || '')}</span>
        </td>
        <td class="admin-muted">${r.lastSeenAt ? escapeHtml(new Date(r.lastSeenAt).toLocaleDateString()) : '—'}</td>
        <td>${roleControl(r)}</td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="3" class="admin-muted">No one has signed in yet. Ask a friend to sign in — they'll appear here to grant access.</td></tr>`;

  return `
    <div class="admin-section">
      <h3>Codex: ${escapeHtml(codexId)}</h3>
    </div>
    <div class="admin-section">
      <h3>Users &amp; Access</h3>
      <table class="admin-roster">
        <thead><tr><th>User</th><th>Last seen</th><th>Role on ${escapeHtml(codexId)}</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

/**
 * Codices panel: create a codex (name → slug, blank or copy-types template), and manage the
 * existing ones (rename inline, soft archive/restore). Removal is a status flag — never a delete.
 * `active`/`archived` are codex meta docs ({ codexId, name }); `templateSources` are the active
 * codices whose type structure a new codex can copy; `currentCodexId` marks the open codex
 * (which can't be archived out from under the author until they switch away).
 */
export function renderCodicesPanel({ active = [], archived = [], templateSources = [], currentCodexId }) {
  const templateOptions = ['<option value="">Blank — no types</option>']
    .concat(
      templateSources.map(
        (c) => `<option value="${escapeHtml(c.codexId)}">Copy types from ${escapeHtml(c.name || c.codexId)}</option>`
      )
    )
    .join('');

  const activeRows = active.length
    ? active
        .map((c) => {
          const isCurrent = c.codexId === currentCodexId;
          return `
      <div class="codex-row" data-codex-id="${escapeHtml(c.codexId)}">
        <input class="admin-input codex-name-input" data-codex-name="${escapeHtml(c.codexId)}" value="${escapeHtml(c.name || c.codexId)}" aria-label="Codex name">
        <code class="admin-muted">${escapeHtml(c.codexId)}</code>
        ${isCurrent ? '<span class="admin-badge">current</span>' : ''}
        <span class="codex-row-actions">
          <button class="btn btn-secondary btn-sm" data-codex-rename="${escapeHtml(c.codexId)}">Rename</button>
          <button class="btn btn-secondary btn-sm" data-codex-archive="${escapeHtml(c.codexId)}"${isCurrent ? ' disabled title="Switch to another codex before archiving this one"' : ''}>Archive</button>
        </span>
      </div>`;
        })
        .join('')
    : '<div class="admin-muted">No codices yet.</div>';

  const archivedBlock = archived.length
    ? `
    <div class="admin-section">
      <h3>Archived</h3>
      ${archived
        .map(
          (c) => `
      <div class="codex-row" data-codex-id="${escapeHtml(c.codexId)}">
        <span>${escapeHtml(c.name || c.codexId)}</span>
        <code class="admin-muted">${escapeHtml(c.codexId)}</code>
        <span class="codex-row-actions">
          <button class="btn btn-secondary btn-sm" data-codex-restore="${escapeHtml(c.codexId)}">Restore</button>
        </span>
      </div>`
        )
        .join('')}
    </div>`
    : '';

  return `
    <div class="admin-section">
      <h3>Create a codex</h3>
      <div class="codex-create">
        <div class="codex-create-name-wrap">
          <input class="admin-input" id="codex-create-name" placeholder="Codex name — e.g. My D&amp;D Campaign" aria-label="New codex name">
          <div class="admin-muted codex-create-slug-line">id: <code id="codex-create-slug">—</code></div>
        </div>
        <select class="admin-input" id="codex-create-template" aria-label="Template">${templateOptions}</select>
        <button class="btn btn-primary btn-sm" id="codex-create-btn">Create codex</button>
      </div>
    </div>
    <div class="admin-section">
      <h3>Codices</h3>
      ${activeRows}
    </div>
    ${archivedBlock}`;
}

/**
 * Images gallery panel (admin, all statuses): one card per image record. Each card carries a
 * tile (→ lightbox), an editable label, its codex-membership chips (each removable), an
 * "add to codex" control (cross-assign), a status badge, and an archive/restore action. main.js
 * owns the wiring; archive is destructive (confirm modal), restore/label/cross-assign are immediate.
 *
 *   rows    — [{ id, label, url, status, codices: [] }] (url precomputed from the image index)
 *   codices — [{ codexId, name }] the admin may cross-assign to
 */
export function renderImagesPanel({ rows = [], codices = [] }) {
  const nameOf = (id) => {
    const c = codices.find((x) => x.codexId === id);
    return (c && c.name) || id;
  };

  const chip = (imgId, codexId) => `
    <span class="gallery-chip">
      ${escapeHtml(nameOf(codexId))}
      <button type="button" class="gallery-chip-remove" data-image-drop-codex="${escapeHtml(imgId)}" data-codex="${escapeHtml(codexId)}" aria-label="Remove from ${escapeHtml(nameOf(codexId))}" title="Remove from ${escapeHtml(nameOf(codexId))}">×</button>
    </span>`;

  const addControl = (img) => {
    const options = codices
      .filter((c) => !(img.codices || []).includes(c.codexId))
      .map((c) => `<option value="${escapeHtml(c.codexId)}">${escapeHtml(c.name || c.codexId)}</option>`)
      .join('');
    if (!options) return '';
    return `
      <select class="admin-input gallery-card-add" data-image-add-codex="${escapeHtml(img.id)}" aria-label="Add to a codex">
        <option value="">Add to codex…</option>
        ${options}
      </select>`;
  };

  const card = (img) => {
    const isArchived = img.status === 'archived';
    const tile = img.url
      ? `<img class="gallery-card-img" src="${escapeHtml(img.url)}" alt="${escapeHtml(img.label)}" loading="lazy">`
      : notFoundImage('image-missing-card');
    const memberChips = (img.codices || []).length
      ? (img.codices || []).map((cx) => chip(img.id, cx)).join('')
      : '<span class="admin-muted gallery-card-orphan">In no codex</span>';
    const statusAction = isArchived
      ? `<button type="button" class="btn btn-secondary btn-sm" data-image-restore="${escapeHtml(img.id)}">Restore</button>`
      : `<button type="button" class="btn btn-danger btn-sm" data-image-archive="${escapeHtml(img.id)}">Archive</button>`;

    return `
      <div class="gallery-card${isArchived ? ' is-archived' : ''}" data-image-id="${escapeHtml(img.id)}">
        <div class="gallery-card-media">${tile}</div>
        <input class="admin-input gallery-card-label" data-image-label="${escapeHtml(img.id)}" value="${escapeHtml(img.label)}" aria-label="Image label">
        <div class="gallery-card-chips">${memberChips}${addControl(img)}</div>
        <div class="gallery-card-footer">
          <span class="admin-badge status-badge status-${isArchived ? 'archived' : 'active'}">${isArchived ? 'archived' : 'active'}</span>
          ${statusAction}
        </div>
      </div>`;
  };

  const body = rows.length
    ? `<div class="gallery-grid">${rows.map(card).join('')}</div>`
    : '<div class="admin-muted">No images yet. Editors add images from the picker while authoring an entry.</div>';

  return `
    <div class="admin-section">
      <h3>Images</h3>
      <p class="admin-muted">Every image across all codices. Archiving hides an image everywhere; its bytes are retained.</p>
      ${body}
    </div>`;
}
