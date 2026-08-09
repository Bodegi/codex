/**
 * Global-admin panels (admin-only): the Users & Access roster, the Codices manager, the
 * Images gallery, the Icons overlay editor, and the Emblems set. Panel switching + a way back out
 * live in the sidebar (main.js renderAdminNav), not here. Pure HTML builders; main.js owns the
 * wiring (roster subscriptions, grant/revoke, codex create/rename/archive, image label/cross-assign/
 * archive/restore, icon + emblem create/edit/archive/restore, and the shared glyph designer).
 */

import { notFoundImage } from '../schema/notFoundImage.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Client-side filter box shared by the Images/Users/Invites panels. main.js holds the query per
// panel, filters the rows through utils/filterRows before they reach the builder, and re-renders
// only the results container below on input — so the box (and its focus) never rebuilds mid-type.
function filterInput(id, placeholder, query) {
  return `<input type="search" class="admin-input admin-filter" id="${escapeHtml(id)}" value="${escapeHtml(
    query
  )}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" autocomplete="off">`;
}

/**
 * Invites panel (admin): generate a shareable link + manage issued invites. The private-site gate —
 * a link dropped in Discord is how a new person gets a `users` row at all. Rows
 * come from `inviteModel.buildInviteRows` (invites × users join, newest-first, with redeemers +
 * derived expiry). main.js owns the wiring (generate/copy/revoke). `status` is 'active'|'revoked';
 * `isExpired` is derived — an active-but-expired invite reads as "expired" and no longer redeems.
 */
export function renderInviteRows(rows = [], query = '') {
  const stateOf = (r) => (r.status === 'revoked' ? 'revoked' : r.isExpired ? 'expired' : 'active');
  if (!rows.length) {
    const msg = query.trim()
      ? `No invites match “${escapeHtml(query.trim())}”.`
      : 'No invites yet. Generate one to share.';
    return `<tr><td colspan="4" class="admin-muted">${msg}</td></tr>`;
  }
  return rows
    .map((r) => {
      const st = stateOf(r);
      const redeemers = r.redeemers.length
        ? escapeHtml(r.redeemers.map((u) => u.displayName || u.email || u.uid).join(', '))
        : '<span class="admin-muted">none yet</span>';
      const expiry = r.expiresAt ? escapeHtml(new Date(r.expiresAt).toLocaleDateString()) : 'never';
      const toggle =
        r.status === 'revoked'
          ? `<button class="btn btn-secondary btn-sm" data-invite-reactivate="${escapeHtml(r.token)}">Reactivate</button>`
          : `<button class="btn btn-danger btn-sm" data-invite-revoke="${escapeHtml(r.token)}">Revoke</button>`;
      return `
      <tr class="invite-row is-${st}">
        <td>
          <strong>${escapeHtml(r.label || '(no label)')}</strong>
          <br><span class="admin-muted">expires ${expiry}</span>
        </td>
        <td><span class="admin-badge status-badge status-${st}">${st}</span></td>
        <td>${r.redeemedCount} &nbsp; ${redeemers}</td>
        <td class="invite-row-actions">
          <button class="btn btn-secondary btn-sm" data-invite-copy="${escapeHtml(r.token)}">Copy link</button>
          ${toggle}
        </td>
      </tr>`;
    })
    .join('');
}

export function renderInvitesPanel({ rows = [], query = '' }) {
  return `
    <div class="admin-section">
      <h3>Invites</h3>
      <p class="admin-muted">Generate a link and share it (Discord, etc.). Anyone who signs in through a
        live link becomes a user awaiting a role below. Revoke to stop further sign-ups; links expire
        after 7 days by default.</p>
      <div class="invite-create">
        <input class="admin-input" id="invite-label" placeholder="Label (optional) — e.g. Discord #recruiting" aria-label="Invite label">
        <button class="btn btn-primary btn-sm" id="invite-generate-btn">Generate invite link</button>
      </div>
      ${filterInput('invites-filter', 'Filter invites by label or redeemer…', query)}
      <table class="admin-roster">
        <thead><tr><th>Invite</th><th>Status</th><th>Redeemed by</th><th></th></tr></thead>
        <tbody id="invites-rows">${renderInviteRows(rows, query)}</tbody>
      </table>
    </div>`;
}

/**
 * Users & Access panel: a roster table with a role control per user.
 * `rows` = [{ uid, email, displayName, lastSeenAt, role: 'none'|'viewer'|'editor', isAdmin }].
 * A non-admin still at role 'none' is flagged `is-pending` (awaiting a grant) — the roster half of
 * the redemption alert (the count badge lives on the admin nav).
 */
export function renderRosterRows(rows = [], query = '') {
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

  if (!rows.length) {
    const msg = query.trim()
      ? `No users match “${escapeHtml(query.trim())}”.`
      : 'No one has signed in yet. Generate an invite link above and share it — new users appear here to grant access.';
    return `<tr><td colspan="3" class="admin-muted">${msg}</td></tr>`;
  }
  return rows
    .map(
      (r) => `
      <tr class="${!r.isAdmin && r.role === 'none' ? 'is-pending' : ''}">
        <td>
          <strong>${escapeHtml(r.displayName || r.email || r.uid)}</strong>${r.isAdmin ? ' <span class="admin-badge">admin</span>' : ''}${!r.isAdmin && r.role === 'none' ? ' <span class="admin-badge status-badge status-pending">awaiting access</span>' : ''}
          <br><span class="admin-muted">${escapeHtml(r.email || '')}</span>
        </td>
        <td class="admin-muted">${r.lastSeenAt ? escapeHtml(new Date(r.lastSeenAt).toLocaleDateString()) : '—'}</td>
        <td>${roleControl(r)}</td>
      </tr>`
    )
    .join('');
}

export function renderAccessPanel({ codexId, rows = [], query = '' }) {
  return `
    <div class="admin-section">
      <h3>Codex: ${escapeHtml(codexId)}</h3>
    </div>
    <div class="admin-section">
      <h3>Users &amp; Access</h3>
      ${filterInput('access-filter', 'Filter users by name or email…', query)}
      <table class="admin-roster">
        <thead><tr><th>User</th><th>Last seen</th><th>Role on ${escapeHtml(codexId)}</th></tr></thead>
        <tbody id="access-rows">${renderRosterRows(rows, query)}</tbody>
      </table>
    </div>`;
}

/**
 * Codices panel: create a codex (name → slug, starting-types picker), and manage the existing
 * ones (rename inline, soft archive/restore). Removal is a status flag — never a delete. The
 * starting-types picker is the single front door to a codex's initial types — blank, the bundled
 * starter examples, or a copy of an existing codex's structure — and, like the whole create form,
 * writes nothing until "Create codex" is pressed. `active`/`archived` are codex meta docs
 * ({ codexId, name }); `templateSources` are the active codices whose type structure a new codex
 * can copy; `currentCodexId` marks the open codex (which can't be archived out from under the
 * author until they switch away). The starter sentinel is main.js's `STARTER_TEMPLATE_ID`.
 */
export function renderCodicesPanel({ active = [], archived = [], templateSources = [], currentCodexId }) {
  const templateOptions = [
    '<option value="">Blank — no types</option>',
    '<option value="__starter__">Example types (note + person)</option>',
  ]
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
          <button class="btn btn-secondary btn-sm" data-codex-rename="${escapeHtml(c.codexId)}" disabled>Rename</button>
          <button class="btn btn-secondary btn-sm" data-codex-archive="${escapeHtml(c.codexId)}"${isCurrent ? ' disabled' : ''}>Archive</button>
        </span>
        ${isCurrent ? '<span class="codex-row-hint admin-muted">Switch to another codex to archive this one</span>' : ''}
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
export function renderImageCards(rows = [], codices = [], query = '') {
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

  if (!rows.length) {
    const msg = query.trim()
      ? `No images match “${escapeHtml(query.trim())}”.`
      : 'No images yet. Editors add images from the picker while authoring an entry.';
    return `<div class="admin-muted">${msg}</div>`;
  }
  return `<div class="gallery-grid">${rows.map(card).join('')}</div>`;
}

export function renderImagesPanel({ rows = [], codices = [], query = '' }) {
  return `
    <div class="admin-section">
      <h3>Images</h3>
      <p class="admin-muted">Every image across all codices. Archiving hides an image everywhere; its bytes are retained.</p>
      ${filterInput('images-filter', 'Filter images by label…', query)}
      <div id="images-results">${renderImageCards(rows, codices, query)}</div>
    </div>`;
}

/**
 * Icons overlay panel: create/edit the app-global icon set that concatenates onto the bundled
 * baseline. An icon is a `key` (its identity + a type's `icon` reference) and inline SVG markup.
 * The SVG is rendered directly as a preview — it is admin-authored, trusted content (same markup
 * the nav injects via getIcon). main.js owns the wiring.
 *
 *   overlayRows — [{ key, label, svg, status, bundled }] the editable Firestore overlay, sorted by
 *                 key; `bundled` marks a baseline key this overlay is overriding (informational).
 *   bundledRows — [{ key, svg }] the code-resident baseline NOT currently overridden by an active
 *                 overlay, sorted by key. Read-only reference; "Override…" seeds the create form.
 */
export function renderIconsPanel({ overlayRows = [], bundledRows = [] }) {
  const preview = (svg) => `<div class="icon-card-preview">${svg || ''}</div>`;

  const overlayCard = (icon) => {
    const isArchived = icon.status === 'archived';
    const statusAction = isArchived
      ? `<button type="button" class="btn btn-secondary btn-sm" data-icon-restore="${escapeHtml(icon.key)}">Restore</button>`
      : `<button type="button" class="btn btn-danger btn-sm" data-icon-archive="${escapeHtml(icon.key)}">Archive</button>`;
    const overriding = icon.bundled
      ? '<span class="admin-badge" title="Overrides a bundled icon of the same key">overrides bundled</span>'
      : '';
    return `
      <div class="icon-card${isArchived ? ' is-archived' : ''}" data-icon-id="${escapeHtml(icon.key)}">
        <div class="icon-card-media">${preview(icon.svg)}</div>
        <div class="icon-card-key"><code title="${escapeHtml(icon.key)}">${escapeHtml(icon.key)}</code> ${overriding}</div>
        <input class="admin-input icon-card-label" data-icon-label="${escapeHtml(icon.key)}" value="${escapeHtml(icon.label || '')}" placeholder="Label (optional)" aria-label="Icon label">
        <textarea class="admin-input icon-card-svg" data-icon-svg="${escapeHtml(icon.key)}" rows="3" spellcheck="false" aria-label="SVG markup">${escapeHtml(icon.svg || '')}</textarea>
        <div class="icon-card-footer">
          <span class="admin-badge status-badge status-${isArchived ? 'archived' : 'active'}">${isArchived ? 'archived' : 'active'}</span>
          ${icon.layers ? `<button type="button" class="btn btn-secondary btn-sm" data-icon-design="${escapeHtml(icon.key)}">Edit in designer</button>` : ''}
          <button type="button" class="btn btn-primary btn-sm" data-icon-save="${escapeHtml(icon.key)}">Save</button>
          ${statusAction}
        </div>
      </div>`;
  };

  const bundledCard = (icon) => `
    <div class="icon-card is-bundled" data-icon-id="${escapeHtml(icon.key)}">
      <div class="icon-card-media">${preview(icon.svg)}</div>
      <div class="icon-card-key">
        <code title="${escapeHtml(icon.key)}">${escapeHtml(icon.key)}</code>
        <span class="admin-badge">bundled</span>
        <button type="button" class="btn btn-secondary btn-sm" data-icon-override="${escapeHtml(icon.key)}">Override</button>
      </div>
    </div>`;

  const overlayBody = overlayRows.length
    ? `<div class="icon-grid">${overlayRows.map(overlayCard).join('')}</div>`
    : '<div class="admin-muted">No custom icons yet. Add one above, or override a bundled icon below.</div>';

  const bundledBody = bundledRows.length
    ? `<div class="icon-grid">${bundledRows.map(bundledCard).join('')}</div>`
    : '<div class="admin-muted">Every bundled icon is currently overridden above.</div>';

  return `
    <div class="admin-section">
      <h3>Icons</h3>
      <p class="admin-muted">App-global icons layered onto the bundled set. A type's icon key resolves here first; archiving an icon drops it from the overlay (types fall back to the bundled or default glyph).</p>

      <div class="icon-create">
        <div class="icon-create-fields">
          <input class="admin-input" id="icon-create-key" placeholder="key (e.g. dragon-lair)" maxlength="32" aria-label="New icon key">
          <input class="admin-input" id="icon-create-label" placeholder="label (optional)" aria-label="New icon label">
        </div>
        <textarea class="admin-input" id="icon-create-svg" rows="3" spellcheck="false" placeholder="&lt;svg viewBox=&quot;0 0 24 24&quot; fill=&quot;currentColor&quot;&gt;…&lt;/svg&gt;" aria-label="New icon SVG markup"></textarea>
        <div class="icon-create-actions">
          <div class="icon-card-preview" id="icon-create-preview" aria-hidden="true"></div>
          <button type="button" class="btn btn-secondary" id="icon-draw-btn">Draw…</button>
          <button type="button" class="btn btn-secondary" id="icon-library-btn">Browse library</button>
          <button type="button" class="btn btn-secondary" id="icon-create-clear">Clear</button>
          <button type="button" class="btn btn-primary" id="icon-create-btn" disabled>Add icon</button>
        </div>
      </div>

      <h4 class="icon-subhead">Custom</h4>
      ${overlayBody}

      <h4 class="icon-subhead">Bundled baseline</h4>
      <p class="admin-muted">Always available and defined in code — can't be deleted. Override one to replace its glyph everywhere it's used.</p>
      ${bundledBody}
    </div>`;
}

/**
 * Emblems panel: the app-global full-color glyph set. Sibling of Icons with
 * NO bundled baseline — every emblem is admin-authored, rendered straight from the record's derived
 * `svg`. The primary authoring surface is the shared glyph designer ("Draw…"); a color-SVG paste box
 * stays as an escape hatch. A record with a structured `layers` source opens back in the designer;
 * a pasted one (no `layers`) edits through the raw textarea. main.js owns the wiring.
 *
 *   rows — [{ key, label, svg, status, layers }] the emblem records, sorted by key. `layers` present
 *          marks a designer-authored emblem (offer "Edit in designer"); absent = paste-authored.
 */
export function renderEmblemsPanel({ rows = [] }) {
  const preview = (svg) => `<div class="icon-card-preview is-emblem">${svg || ''}</div>`;

  const card = (emblem) => {
    const isArchived = emblem.status === 'archived';
    const designed = !!emblem.layers;
    const statusAction = isArchived
      ? `<button type="button" class="btn btn-secondary btn-sm" data-emblem-restore="${escapeHtml(emblem.key)}">Restore</button>`
      : `<button type="button" class="btn btn-danger btn-sm" data-emblem-archive="${escapeHtml(emblem.key)}">Archive</button>`;
    const designedBadge = designed
      ? '<span class="admin-badge" title="Authored in the glyph designer">designed</span>'
      : '';
    // A designed emblem edits in the designer (raw markup is derived, so hand-editing it would
    // desync `layers`); a pasted emblem keeps the raw textarea + Save.
    const editControls = designed
      ? `<button type="button" class="btn btn-secondary btn-sm" data-emblem-design="${escapeHtml(emblem.key)}">Edit in designer</button>
         <button type="button" class="btn btn-primary btn-sm" data-emblem-save-label="${escapeHtml(emblem.key)}">Save label</button>`
      : `<textarea class="admin-input icon-card-svg" data-emblem-svg="${escapeHtml(emblem.key)}" rows="3" spellcheck="false" aria-label="Emblem SVG markup">${escapeHtml(emblem.svg || '')}</textarea>
         <button type="button" class="btn btn-primary btn-sm" data-emblem-save="${escapeHtml(emblem.key)}">Save</button>`;
    return `
      <div class="icon-card${isArchived ? ' is-archived' : ''}" data-emblem-id="${escapeHtml(emblem.key)}">
        <div class="icon-card-media">${preview(emblem.svg)}</div>
        <div class="icon-card-key"><code title="${escapeHtml(emblem.key)}">${escapeHtml(emblem.key)}</code> ${designedBadge}</div>
        <input class="admin-input icon-card-label" data-emblem-label="${escapeHtml(emblem.key)}" value="${escapeHtml(emblem.label || '')}" placeholder="Label (optional)" aria-label="Emblem label">
        ${editControls}
        <div class="icon-card-footer">
          <span class="admin-badge status-badge status-${isArchived ? 'archived' : 'active'}">${isArchived ? 'archived' : 'active'}</span>
          ${statusAction}
        </div>
      </div>`;
  };

  const body = rows.length
    ? `<div class="icon-grid">${rows.map(card).join('')}</div>`
    : '<div class="admin-muted">No emblems yet. Draw one above.</div>';

  return `
    <div class="admin-section">
      <h3>Emblems</h3>
      <p class="admin-muted">Full-color glyphs for content and map markers. Unlike icons they keep their own colors (they don't theme). Draw one in the designer, or paste color SVG. Archiving drops an emblem from the set.</p>

      <div class="icon-create">
        <div class="icon-create-fields">
          <input class="admin-input" id="emblem-create-key" placeholder="key (e.g. house-stark)" maxlength="32" aria-label="New emblem key">
          <input class="admin-input" id="emblem-create-label" placeholder="label (optional)" aria-label="New emblem label">
        </div>
        <textarea class="admin-input" id="emblem-create-svg" rows="3" spellcheck="false" placeholder="Paste color &lt;svg&gt;…&lt;/svg&gt;, or use Draw…" aria-label="New emblem SVG markup"></textarea>
        <div class="icon-create-actions">
          <div class="icon-card-preview is-emblem" id="emblem-create-preview" aria-hidden="true"></div>
          <button type="button" class="btn btn-secondary" id="emblem-draw-btn">Draw…</button>
          <button type="button" class="btn btn-secondary" id="emblem-create-clear">Clear</button>
          <button type="button" class="btn btn-primary" id="emblem-create-btn" disabled>Add emblem</button>
        </div>
      </div>

      <h4 class="icon-subhead">Emblems</h4>
      ${body}
    </div>`;
}
