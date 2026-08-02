/**
 * Admin section (admin-only): sub-nav + the Users & Access panel. The Types panel reuses the
 * existing schema editor, mounted by main.js. Pure HTML builders here; main.js owns the wiring
 * (roster subscriptions, grant/revoke, codex init) and the schema-editor state.
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Sub-navigation between the admin panels. */
export function renderAdminSubnav(panel) {
  const tab = (key, label) =>
    `<button class="admin-subnav-btn${panel === key ? ' active' : ''}" data-admin-panel="${key}">${label}</button>`;
  return `<div class="admin-subnav">${tab('access', 'Users & Access')}${tab('types', 'Types')}${tab('codices', 'Codices')}</div>`;
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
 * Types-panel chrome around the schema editor: a "new type" bar, the editor mount point, and
 * (when present) an Archived-types list with Restore. `archived` = [{ type, label }]. Removal is
 * a status flag — an archived type leaves the nav but is one click from coming back.
 */
export function renderTypesToolbar({ archived = [] } = {}) {
  const archivedBlock = archived.length
    ? `
    <div class="admin-section">
      <h3>Archived types</h3>
      ${archived
        .map(
          (t) => `
      <div class="codex-row" data-type="${escapeHtml(t.type)}">
        <span>${escapeHtml(t.label || t.type)}</span>
        <code class="admin-muted">${escapeHtml(t.type)}</code>
        <span class="codex-row-actions">
          <button class="btn btn-secondary btn-sm" data-type-restore="${escapeHtml(t.type)}">Restore</button>
        </span>
      </div>`
        )
        .join('')}
    </div>`
    : '';

  return `
    <div class="admin-section codex-create">
      <input class="admin-input" id="new-type-name" placeholder="New type name — e.g. Trade Route" aria-label="New type name">
      <button class="btn btn-primary btn-sm" id="new-type-btn">Add type</button>
    </div>
    <div id="admin-types-mount"></div>
    ${archivedBlock}`;
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
