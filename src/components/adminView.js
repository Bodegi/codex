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

/** Sub-navigation between the two admin panels. */
export function renderAdminSubnav(panel) {
  const tab = (key, label) =>
    `<button class="admin-subnav-btn${panel === key ? ' active' : ''}" data-admin-panel="${key}">${label}</button>`;
  return `<div class="admin-subnav">${tab('access', 'Users & Access')}${tab('types', 'Types')}</div>`;
}

/**
 * Users & Access panel: codex status + Initialize button, then a roster table with a role control
 * per user. `rows` = [{ uid, email, displayName, lastSeenAt, role: 'none'|'viewer'|'editor', isAdmin }].
 */
export function renderAccessPanel({ codexId, initialized, rows }) {
  const status = initialized
    ? '<span style="color:var(--accent-emerald,#10b981);">Initialized</span>'
    : '<span style="color:var(--text-muted);">Not initialized</span>';

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
      <p>${status} &middot;
        <button id="btn-init-codex" class="btn btn-secondary btn-sm">Initialize / re-seed codex</button>
      </p>
    </div>
    <div class="admin-section">
      <h3>Users &amp; Access</h3>
      <table class="admin-roster">
        <thead><tr><th>User</th><th>Last seen</th><th>Role on ${escapeHtml(codexId)}</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}
