/**
 * Codex Studio — Main Application Bootstrap
 */

import { demoCodexId, demoCodexMeta, demoSchemas, demoEntriesByType } from './data/demoFixture.js';
import { renderEntryHTML } from './utils/entryRenderer.js';
import { FirebaseManager } from './utils/firebase.js';
import { AuthManager } from './utils/authManager.js';
import { appConfig, resolveFirebaseConfig } from './config/appConfig.js';

import { renderForm as renderSchemaForm } from './schema/formRenderer.js';
import {
  getSchema,
  setOverlaySchema,
  listTypes,
  listArchivedTypes,
  loadCodex,
  applyCodexSchemas,
  saveSchemaLocal,
  resetSchema,
} from './schema/schemaStore.js';
import { indexEntries, activeEntries, archivedEntries, findEntry } from './schema/entryIndex.js';
import { switcherCodices, archivedCodices } from './schema/codexRegistry.js';
import { buildTemplateSchemas } from './schema/codexTemplate.js';
import { slugify, isSlugTaken, deriveEntryId } from './schema/slug.js';
import { blankEntry } from './schema/entryDraft.js';
import { validateSchema } from './schema/schemaValidate.js';
import { escapeHtml } from './schema/inlineText.js';
import { getIcon } from './schema/iconRegistry.js';
import { buildNavModel } from './schema/navModel.js';
import {
  selectType,
  toRead,
  toEdit,
  toSchemaAdmin,
  openGlobalAdmin,
  selectAdminPanel,
  closeGlobalAdmin,
  normalize,
} from './schema/viewState.js';
import {
  renderSchemaEditor,
  attachSchemaEditor,
  deriveKey,
  allFieldKeys,
  addField,
  removeField,
  updateField,
  moveField,
  addSection,
  removeSection,
  renameSection,
  moveSection,
  newTypeSchema,
} from './components/schemaEditor.js';
import { renderAuthGateway } from './components/authGateway.js';
import { renderAwaitingAccess } from './components/awaitingAccess.js';
import {
  renderAccessPanel,
  renderCodicesPanel,
} from './components/adminView.js';
import { resolveCapabilities, isAdminEmail } from './utils/capabilities.js';
import { renderMediaControls, attachMediaControls } from './components/mediaControls.js';
import { renderCarousel, initCarousel } from './components/carousel.js';
import { resolve as resolvePoolImage } from './utils/imagePool.js';

// Last-focused prose textarea, target for inline-image insertion
let lastFocusedProseField = null;

// localStorage key persisting the active codex across reloads.
const CURRENT_CODEX_KEY = 'codex_current_id';

// Firebase config resolved once; presence drives configured vs. local-only mode.
const firebaseConfig = resolveFirebaseConfig(appConfig.firebase, localStorage.getItem('codex_firebase_override'));

// The codex shown first: a configured build defaults to the baked codex; local-only mode is the
// single demo-fixture codex (no switcher, no Firestore).
const DEFAULT_CODEX_ID = firebaseConfig ? (appConfig.defaultCodexId || 'atm10') : demoCodexId;

// Whether a type's schema declares imagery fields (hero/gallery) → show the media controls.
const schemaHasMedia = (type) => {
  const schema = getSchema(type);
  return !!schema && schema.sections.some((s) => s.fields.some((f) => f.kind === 'hero' || f.kind === 'gallery'));
};

// Application State
const state = {
  // The single source of truth for what's on screen (see schema/viewState.js): a per-type content
  // surface ({kind:'type', type, mode:'read'|'edit'|'admin'}) or the global-admin door
  // ({kind:'global-admin', panel:'access'|'codices'}). `type` is null only in the empty-content case
  // (a codex with no types). normalize() clamps it to a valid, permitted view once schemas + caps load.
  view: { kind: 'type', type: null, mode: 'read' },
  currentViewMode: 'rendered',
  formData: {},
  // Which sidebar type-sections are expanded — independent of the current selection, so an opened
  // section can be collapsed and stay collapsed across re-renders.
  navExpanded: new Set(),
  // The active codex. Every Firestore access is codex-scoped; the switcher re-scopes on change.
  currentCodexId: localStorage.getItem(CURRENT_CODEX_KEY) || DEFAULT_CODEX_ID,
  firebaseConfig,
  fbManager: null,
  authManager: null,
  activeDocUnsubscribe: null,
  liveDocId: null,
  // The current codex's live entries grouped by type (replaces the bundled SEED_BY_TYPE).
  entryIndex: {},
  // Codex registry: the meta docs the viewer may switch between, and (non-admin) their own grants.
  codices: [],
  ownPermissions: [],
  // Access control (Phase 2): the current user's capabilities on the current codex, their own
  // permission doc, and whether that doc has loaded yet (to avoid flashing awaiting-access on boot).
  caps: { isAuthed: false, role: 'none', canRead: false, canEdit: false, canAdmin: false },
  permission: null,
  permissionLoaded: false,
  workspaceReady: false,
  // Schema editor (per-type Structure mode) working state
  editingType: '',
  workingSchema: null,
  editorErrors: [],
  // Global-admin roster state
  adminUsers: [],
  adminPerms: []
};

// ── View-state helpers ───────────────────────────────────────────────────────
// The single source of truth is state.view; these read it, and goto()/renderView() write it.
const curType = () => (state.view.kind === 'type' ? state.view.type : null);
const inGlobalAdmin = () => state.view.kind === 'global-admin';
const inSchemaAdmin = () => state.view.kind === 'type' && state.view.mode === 'admin';
// The context normalize() clamps against: current capabilities + the codex's live type keys.
const viewCtx = () => ({ caps: state.caps, types: listTypes() });
// Apply a view transition, clamp it, and re-render the whole workspace to match.
function goto(nextView) {
  state.view = normalize(nextView, viewCtx());
  renderView();
}

// Initialize Firebase + Google Auth. Auth needs an initialized Firebase app, so the auth manager
// only exists when Firebase is configured; local-only mode runs unauthenticated (no login wall).
if (state.firebaseConfig) {
  state.fbManager = new FirebaseManager(state.firebaseConfig);
  state.authManager = new AuthManager(state.fbManager.app);
}

// The active codex's Firestore scope (entries / schemas / atlas under codices/${id}/…), or null in
// local-only mode. Every Firestore read/write goes through this so nothing is hardwired to one codex.
function codexScope() {
  return state.fbManager ? state.fbManager.codex(state.currentCodexId) : null;
}

// ── Codex content: schemas + entries for the active codex ────────────────────
// The store + entry index are (re)loaded per codex. In configured mode a Firestore subscription
// keeps both live; in local-only mode the demo fixture is the single codex's content. The Firestore
// subscriptions are deferred to showWorkspace() so no read fires before the user has read access.
let schemaUnsubscribe = null;
let entriesUnsubscribe = null;

function subscribeCodexContent() {
  const scope = codexScope();
  if (!(scope && scope.isConfigured())) return;

  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  schemaUnsubscribe = scope.subscribeSchemas((schemas) => {
    applyCodexSchemas(schemas);
    onCodexContentChanged();
  });

  if (entriesUnsubscribe) { entriesUnsubscribe(); entriesUnsubscribe = null; }
  entriesUnsubscribe = scope.subscribeEntries((entries) => {
    state.entryIndex = indexEntries(entries);
    onCodexContentChanged();
  });
}

// Re-render nav + selection when the codex's live types/entries change.
function onCodexContentChanged() {
  if (!state.workspaceReady) return;
  renderNav();
  ensureValidView();
}

// Point the store + entry index at a codex's content: the demo fixture in local-only mode, or empty
// in configured mode (filled by the Firestore subscription). Called on boot and on every switch.
function loadCodexContent() {
  if (state.firebaseConfig) {
    loadCodex(state.currentCodexId, []); // base filled by subscribeCodexContent
    state.entryIndex = {};
  } else {
    loadCodex(demoCodexId, demoSchemas);
    state.entryIndex = { ...demoEntriesByType };
  }
}
loadCodexContent();

// Cross-entry lookup for the nav + reference fields, backed by the live entry index.
const entryLabel = (e) => {
  const schema = getSchema(e.type);
  return (schema && e[schema.titleField]) || e.name || e.title || e.id;
};
const entriesOfType = (type) => activeEntries(state.entryIndex, type).map((e) => ({ id: e.id, label: entryLabel(e) }));
const findEntryByTypeId = (type, id) => findEntry(state.entryIndex, type, id);

// Title shown in the reader/editor headers for the current entry.
const entryTitle = (data, type) => {
  const schema = getSchema(type);
  const t = (schema && data[schema.titleField]) || data.name || data.title || data.id;
  return t || '(untitled)';
};

// Edge adapter handed to the schema renderers: the image/reference resolution they
// must not import directly (keeps them build-tool-free and unit-testable).
const renderCtx = {
  resolveImage: (id) => resolvePoolImage(id),
  listEntries: (type) => entriesOfType(type),
  resolveRef: (type, id) => {
    const entry = findEntryByTypeId(type, id);
    return entry ? { label: entryLabel(entry), exists: true } : { label: id, exists: false };
  },
};

// DOM References
const formContainer = document.getElementById('form-container');
const previewRendered = document.getElementById('preview-content-rendered');
const previewRawTextarea = document.getElementById('raw-json-textarea');
const previewRawContainer = document.getElementById('preview-content-raw');
const jsonErrorEl = document.getElementById('json-error');
const toastContainer = document.getElementById('toast-container');
const activeFileIndicator = document.getElementById('active-file-indicator');
const userProfileBadge = document.getElementById('user-profile-badge');
const gatewayContainer = document.getElementById('gateway-container');
const mainWorkspace = document.getElementById('main-workspace');
const appBody = document.querySelector('.app-body');
const editToggleBtn = document.getElementById('btn-edit-toggle');
const structureBtn = document.getElementById('btn-structure');
const saveEntryBtn = document.getElementById('btn-save-entry');
const archiveEntryBtn = document.getElementById('btn-archive-entry');
const doneEditBtn = document.getElementById('btn-done-edit');
const readerTitle = document.getElementById('reader-title');
const editorTitle = document.getElementById('editor-title');
const typeNav = document.getElementById('type-nav');
const codexSwitcher = document.getElementById('codex-switcher');
const codexSwitcherLabel = document.getElementById('codex-switcher-label');

// ── Auth + access control (Phase 2) ─────────────────────────────────────────
// Boot flow: on every auth change we upsert the user into the roster, (re)subscribe to their own
// permission doc for the current codex, recompute capabilities, and render one of four screens
// (gateway / loading / awaiting-access / workspace). Codex-content subscriptions are deferred until
// read access is confirmed, so a no-access user never issues a denied Firestore read.

function initAuth() {
  // Synchronous initial paint: gated + unresolved defaults to the gateway (no workspace flash);
  // local-only mode resolves straight to the open workspace.
  recomputeCaps();
  renderUserBadge();
  renderAppState();
  if (state.authManager) {
    state.authManager.onChange(onAuthChanged);
  }
}

function onAuthChanged() {
  const user = state.authManager?.currentUser || null;
  renderUserBadge();
  if (user) state.fbManager?.upsertUser(user).catch((err) => console.warn('user upsert failed', err));
  watchOwnPermission();  // resets permission state; its callback re-renders once the doc arrives
  recomputeCaps();
  renderAppState();
}

// Watch the signed-in user's permission doc for the current codex. Its snapshot drives viewer/editor/
// none; an admin (recognized by email) doesn't depend on it.
let permissionUnsub = null;
function watchOwnPermission() {
  if (permissionUnsub) { permissionUnsub(); permissionUnsub = null; }
  state.permission = null;
  state.permissionLoaded = false;
  const user = state.authManager?.currentUser;
  if (!(user && state.fbManager && state.fbManager.isConfigured())) return;
  permissionUnsub = state.fbManager.subscribePermission(user.uid, state.currentCodexId, (perm) => {
    state.permission = perm;
    state.permissionLoaded = true;
    recomputeCaps();
    renderAppState();
  });
}

function recomputeCaps() {
  if (!state.authManager) {
    // Local-only mode: a single implicit user with full access (no Firebase, no gating).
    state.caps = { isAuthed: true, role: 'admin', canRead: true, canEdit: true, canAdmin: true };
    state.permissionLoaded = true;
    return;
  }
  state.caps = resolveCapabilities({
    user: state.authManager.currentUser,
    permission: state.permission,
    adminEmail: appConfig.auth.adminEmail,
  });
}

// Render one of the four top-level screens from the current capabilities.
function renderAppState() {
  const caps = state.caps;
  if (!state.authManager) return showWorkspace();      // local-only: never gated
  if (!caps.isAuthed) return showGateway();
  // Admin is authorized by email — no need to wait for a permission doc. Everyone else waits for the
  // first snapshot so a real viewer/editor never flashes the awaiting-access screen on boot.
  if (!caps.canAdmin && !state.permissionLoaded) return showLoading();
  if (caps.canRead) return showWorkspace();
  return showAwaitingAccess();
}

function showOverlay(html) {
  teardownWorkspace();
  appBody.classList.add('hidden');   // hides the sidebar + workspace together
  gatewayContainer.classList.remove('hidden');
  gatewayContainer.innerHTML = html;
}

function showGateway() {
  showOverlay(renderAuthGateway());
  document.getElementById('gateway-login-btn')?.addEventListener('click', () => {
    state.authManager.login().catch((err) => showToast(err.message));
  });
}

function showAwaitingAccess() {
  showOverlay(renderAwaitingAccess(state.authManager.currentUser));
  document.getElementById('awaiting-logout-btn')?.addEventListener('click', () => {
    state.authManager.logout().catch((err) => showToast(err.message));
  });
}

function showLoading() {
  showOverlay(`
    <div style="display:flex; align-items:center; justify-content:center; height:80vh; color:var(--text-muted);">
      <span class="pulse-dot"></span> &nbsp; Checking access…
    </div>
  `);
}

function showWorkspace() {
  gatewayContainer.classList.add('hidden');
  appBody.classList.remove('hidden');
  mainWorkspace.classList.remove('hidden');
  if (!state.workspaceReady) {
    state.workspaceReady = true;
    subscribeCodexRegistry();      // populate the switcher (app-global, not codex-scoped)
    subscribeCodexContent();       // deferred schema + entry subscriptions (now that canRead is true)
    renderCodexSwitcher();
    state.view = normalize(state.view, viewCtx());
    renderView();                  // renders the sidebar nav + picks the first type (or empty/admin)
    renderSyncStatus();
  } else {
    // Already up: capabilities may have just changed (permission arrived) — re-clamp + reflect chrome.
    state.view = normalize(state.view, viewCtx());
    applyViewChrome();
  }
}

// Tear down codex-content subscriptions + the one-time workspace init, so re-auth re-initializes.
function teardownWorkspace() {
  state.workspaceReady = false;
  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  if (entriesUnsubscribe) { entriesUnsubscribe(); entriesUnsubscribe = null; }
  if (state.activeDocUnsubscribe) { state.activeDocUnsubscribe(); state.activeDocUnsubscribe = null; }
  if (codicesUnsub) { codicesUnsub(); codicesUnsub = null; }
  if (ownPermsUnsub) { ownPermsUnsub(); ownPermsUnsub = null; }
  if (adminUsersUnsub) { adminUsersUnsub(); adminUsersUnsub = null; }
  if (adminPermsUnsub) { adminPermsUnsub(); adminPermsUnsub = null; }
}

// Enter the global-admin door (from the header user menu). Keeps the last panel if already there.
function enterAdmin() {
  if (!state.caps.canAdmin) return;
  goto(openGlobalAdmin(state.view, inGlobalAdmin() ? state.view.panel : 'access'));
}

// Render the header user menu: the signed-in identity as a dropdown trigger, with Admin (admins
// only) + Sign Out inside. Local-only mode has no auth but still needs Admin, so it shows a plain
// Admin button. Authorization is not decided here — that's renderAppState via caps.
function renderUserBadge() {
  if (!state.authManager) {
    userProfileBadge.innerHTML = '<button id="local-admin-btn" class="btn btn-secondary btn-sm">Admin</button>';
    document.getElementById('local-admin-btn')?.addEventListener('click', enterAdmin);
    return;
  }
  const user = state.authManager.currentUser;
  if (!user) {
    userProfileBadge.innerHTML = '<button id="btn-google-login" class="btn btn-secondary">Sign in with Google</button>';
    document.getElementById('btn-google-login')?.addEventListener('click', () => {
      state.authManager.login().catch((err) => showToast(err.message));
    });
    return;
  }

  const canAdmin = isAdminEmail(user.email, appConfig.auth.adminEmail);
  const adminItem = canAdmin ? '<button class="user-menu-item" data-user-menu="admin">Admin</button>' : '';
  userProfileBadge.innerHTML = `
    <div class="user-menu">
      <button id="user-menu-trigger" class="user-badge" aria-haspopup="true" aria-expanded="false" title="Signed in as ${escapeHtml(user.username)}">
        <img src="${escapeHtml(user.avatar)}" class="user-avatar" alt="${escapeHtml(user.username)}">
        <span>${escapeHtml(user.globalName || user.username)}</span>
        <span class="caret" aria-hidden="true"></span>
      </button>
      <div id="user-menu-dropdown" class="user-menu-dropdown hidden">
        ${adminItem}
        <button class="user-menu-item" data-user-menu="logout">Sign Out</button>
      </div>
    </div>
  `;
  const trigger = document.getElementById('user-menu-trigger');
  const dropdown = document.getElementById('user-menu-dropdown');
  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !dropdown.classList.toggle('hidden');
    trigger.setAttribute('aria-expanded', String(open));
  });
  dropdown?.querySelectorAll('[data-user-menu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      if (btn.dataset.userMenu === 'admin') enterAdmin();
      else state.authManager.logout().catch((err) => showToast(err.message));
    });
  });
}

// Close the user menu on any outside click (the trigger stops propagation, so it stays open on itself).
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('user-menu-dropdown');
  const trigger = document.getElementById('user-menu-trigger');
  if (dropdown && !dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && !trigger?.contains(e.target)) {
    dropdown.classList.add('hidden');
    trigger?.setAttribute('aria-expanded', 'false');
  }
});

// ── Codex switcher + registry ───────────────────────────────────────────────
// The switcher lists the active codices the viewer can open (admin: all; others: the codices their
// permissions grant). Selecting one re-scopes every codex subscription. Local-only mode is a single
// demo codex, so the control stays inert.

const codexSwitcherWrap = codexSwitcher.parentElement;
let codicesUnsub = null;
let ownPermsUnsub = null;

// The codices to show in the switcher, per the pure registry rules.
function visibleCodices() {
  if (!state.firebaseConfig) return [demoCodexMeta];
  const uid = state.authManager?.currentUser?.uid || '';
  return switcherCodices(state.codices, state.ownPermissions, { isAdmin: !!state.caps.canAdmin, uid });
}

// Populate the registry once per session: an admin lists every codex; a normal user derives their
// list from their own permission grants. App-global — not re-run on codex switch.
function subscribeCodexRegistry() {
  if (!(state.fbManager && state.fbManager.isConfigured())) {
    state.codices = [demoCodexMeta];
    return;
  }
  const uid = state.authManager?.currentUser?.uid;
  if (state.caps.canAdmin) {
    if (!codicesUnsub) {
      codicesUnsub = state.fbManager.subscribeCodices((codices) => {
        state.codices = codices;
        renderCodexSwitcher();
        if (inGlobalAdmin() && state.view.panel === 'codices') renderAdminPanel();
      });
    }
  } else if (uid && !ownPermsUnsub) {
    ownPermsUnsub = state.fbManager.subscribeOwnPermissions(uid, async (perms) => {
      state.ownPermissions = perms;
      const metas = await Promise.all(
        perms.map((p) => state.fbManager.getCodexMeta(p.codexId).then((m) => (m ? { ...m, codexId: p.codexId } : null)))
      );
      state.codices = metas.filter(Boolean);
      renderCodexSwitcher();
    });
  }
}

function renderCodexSwitcher() {
  const list = visibleCodices();
  const current = list.find((c) => c.codexId === state.currentCodexId);
  codexSwitcherLabel.textContent = (current && (current.name || current.codexId)) || state.currentCodexId;

  codexSwitcherWrap.querySelector('.codex-switcher-menu')?.remove();
  // Local-only (single codex) leaves the control inert.
  if (!state.firebaseConfig) { codexSwitcher.disabled = true; return; }
  codexSwitcher.disabled = false;

  const menu = document.createElement('div');
  menu.className = 'codex-switcher-menu hidden';
  const optionsHtml =
    list
      .map(
        (c) =>
          `<button class="codex-switcher-option${c.codexId === state.currentCodexId ? ' is-current' : ''}" data-codex-id="${escapeHtml(
            c.codexId
          )}">${escapeHtml(c.name || c.codexId)}</button>`
      )
      .join('') || '<div class="codex-switcher-empty">No codices available</div>';
  // Admins get a shortcut straight to the create form.
  const newShortcut = state.caps.canAdmin
    ? '<button class="codex-switcher-option codex-switcher-new" data-codex-new>＋ New codex</button>'
    : '';
  menu.innerHTML = optionsHtml + newShortcut;
  codexSwitcherWrap.appendChild(menu);
  menu.querySelectorAll('[data-codex-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      menu.classList.add('hidden');
      switchCodex(btn.dataset.codexId);
    });
  });
  menu.querySelector('[data-codex-new]')?.addEventListener('click', () => {
    menu.classList.add('hidden');
    openCodicesAdmin();
  });
}

codexSwitcher.addEventListener('click', () => {
  if (codexSwitcher.disabled) return;
  codexSwitcherWrap.querySelector('.codex-switcher-menu')?.classList.toggle('hidden');
});

// Re-scope every codex subscription onto a different codex (§7 of the Phase-4 spec). The old manual
// "preserve Admin across the switch" hack is gone: normalize() keeps a global-admin view as-is and
// retargets a now-missing type, so the whole choreography reduces to re-clamp → render.
function switchCodex(codexId) {
  if (!codexId || codexId === state.currentCodexId) return;
  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  if (entriesUnsubscribe) { entriesUnsubscribe(); entriesUnsubscribe = null; }
  if (state.activeDocUnsubscribe) { state.activeDocUnsubscribe(); state.activeDocUnsubscribe = null; }
  state.liveDocId = null; // no doc open on the new codex yet — don't show the old codex's "Live sync · id"

  state.currentCodexId = codexId;
  localStorage.setItem(CURRENT_CODEX_KEY, codexId);
  state.formData = {};
  loadCodexContent();       // reset store + entry index for the new codex
  watchOwnPermission();     // re-subscribe permission → recompute caps for this codex
  subscribeCodexContent();  // schemas + entries for the new codex
  renderCodexSwitcher();
  state.view = normalize(state.view, viewCtx());
  renderView();
  renderSyncStatus();
}

// ── Sidebar navigation (codex → type → entry, then Admin) ───────────────────
// The nav is data-driven: types come from listTypes() (the current codex's schemas) and entries
// from the live entry index. Selecting a type opens its first entry; selecting an entry opens it.
// Admin is the only fixed, non-type item and shows only to admins.

// Non-disruptive re-clamp on live content changes: keep the open entry/structure when still valid, so
// a keystroke elsewhere never resets the open form; otherwise re-normalize and re-render.
function ensureValidView() {
  if (inGlobalAdmin()) return;                    // global admin doesn't depend on codex content
  const type = curType();
  const stillValid = !!type && listTypes().some((t) => t.type === type);

  if (!stillValid) {                              // type archived/removed out from under us
    state.view = normalize(state.view, viewCtx());
    return renderView();
  }
  if (inSchemaAdmin()) return;                     // valid type + editing its schema — don't clobber

  const open = state.formData && state.formData.id ? findEntryByTypeId(type, state.formData.id) : null;
  if (open) { highlightNav(); return; }
  loadFirstEntry(type);                            // the open entry was archived → fall back to first
}

// Open a type's first active entry (or a blank draft) in the reader — form + preview + chrome.
function loadFirstEntry(type) {
  const entries = activeEntries(state.entryIndex, type);
  state.formData = entries.length ? { ...entries[0] } : { type };
  showRenderedPane();
  renderForm();
  applyViewChrome();
  highlightNav();
}

// A codex with no types (fresh/blank) — nothing to read yet.
function renderEmptyCodexState() {
  readerTitle.textContent = '';
  editorTitle.textContent = '';
  const msg = state.caps.canAdmin
    ? 'This codex has no types yet. Use “＋ New type” in the sidebar to create the first one.'
    : 'This codex has no content yet.';
  updateRenderedPreview(`<div class="empty-state">${escapeHtml(msg)}</div>`);
  updateRawJson('');
}

// The sidebar reflects the current surface: the codex's types (content), or the admin nav
// (Users & Access / Codices + a way back out) when in the global-admin door.
function renderNav() {
  if (inGlobalAdmin()) renderAdminNav();
  else renderTypeNav();
}

// The admin sidebar: leave-admin at the top, then the two admin panels. Panel selection lives here
// now (the in-panel subnav is gone), so the content panel shows only the selected panel's body.
function renderAdminNav() {
  const panel = state.view.panel;
  const item = (key, label) =>
    `<button class="nav-item nav-admin-item${panel === key ? ' is-active' : ''}" data-admin-nav="${key}">${label}</button>`;
  typeNav.innerHTML = `
    <button class="nav-item nav-admin-back" data-admin-back>‹ Back to codex</button>
    <div class="nav-admin-group">
      <span class="nav-section-label">Admin</span>
      ${item('access', 'Users & Access')}
      ${item('codices', 'Codices')}
    </div>`;
  typeNav.querySelector('[data-admin-back]')?.addEventListener('click', exitAdmin);
  typeNav.querySelectorAll('[data-admin-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = selectAdminPanel(state.view, btn.dataset.adminNav);
      renderAdminNav();
      renderAdminPanel();
    });
  });
}

// Leave the admin door, returning to the type you were reading (or the first type).
function exitAdmin() {
  const t = state.formData && state.formData.type;
  const back = t && listTypes().some((x) => x.type === t) ? t : listTypes()[0]?.type || null;
  goto(closeGlobalAdmin(state.view, back));
}

function renderTypeNav() {
  const types = listTypes();
  const canEdit = !!state.caps.canEdit;
  const canAdmin = !!state.caps.canAdmin;
  const entriesByType = {};
  types.forEach((t) => {
    entriesByType[t.type] = entriesOfType(t.type).map((e) => ({ id: e.id, title: e.label }));
  });
  const model = buildNavModel(types, entriesByType);

  typeNav.innerHTML = model
    .map(
      (node) => `
    <div class="nav-type" data-type="${escapeHtml(node.type)}">
      <button class="nav-item nav-type-header" data-type-header="${escapeHtml(node.type)}">
        <span class="nav-icon">${getIcon(node.icon)}</span>
        <span class="nav-label">${escapeHtml(node.label)}</span>
        <span class="nav-caret" aria-hidden="true"></span>
      </button>
      <div class="nav-entries">
        ${node.entries
          .map(
            (e) =>
              `<button class="nav-item nav-entry" data-type="${escapeHtml(node.type)}" data-id="${escapeHtml(
                e.id
              )}">${escapeHtml(e.title)}</button>`
          )
          .join('')}
        ${canEdit ? `<button class="nav-item nav-new-entry" data-new-entry="${escapeHtml(node.type)}">＋ New entry</button>` : ''}
        ${canEdit ? renderArchivedEntries(node.type) : ''}
      </div>
    </div>`
    )
    .join('') + (canAdmin ? renderNewTypeRow() + renderArchivedTypes() : '');

  wireTypeNav();
}

// The admin-only "＋ New type" affordance at the foot of the nav — an inline name + create button.
// Creating a type drops the author into its Structure (schema) mode.
function renderNewTypeRow() {
  return `
    <div class="nav-new-type">
      <input class="nav-new-type-input" id="new-type-name" placeholder="New type name" aria-label="New type name">
      <button class="nav-item nav-new-type-btn" id="new-type-btn">＋ New type</button>
    </div>`;
}

// The muted "Archived types" list in the nav (admins only) — one Restore per archived type.
function renderArchivedTypes() {
  const archived = listArchivedTypes();
  if (!archived.length) return '';
  return `
    <div class="nav-archived nav-archived-types">
      <span class="nav-archived-label">Archived types</span>
      ${archived
        .map(
          (t) => `<div class="nav-archived-row">
            <span class="nav-archived-name">${escapeHtml(t.label || t.type)}</span>
            <button class="nav-mini-btn" data-restore-type="${escapeHtml(t.type)}">Restore</button>
          </div>`
        )
        .join('')}
    </div>`;
}

// The muted "Archived" list under a type in the nav (editors only) — one Restore per entry.
function renderArchivedEntries(type) {
  const archived = archivedEntries(state.entryIndex, type).map((e) => ({ id: e.id, label: entryLabel(e) }));
  if (!archived.length) return '';
  return `
    <div class="nav-archived">
      <span class="nav-archived-label">Archived</span>
      ${archived
        .map(
          (e) => `<div class="nav-archived-row">
            <span class="nav-archived-name">${escapeHtml(e.label)}</span>
            <button class="nav-mini-btn" data-restore-entry-type="${escapeHtml(type)}" data-restore-entry-id="${escapeHtml(
              e.id
            )}">Restore</button>
          </div>`
        )
        .join('')}
    </div>`;
}

function wireTypeNav() {
  // A type header toggles its section: opening it also selects the type (loads its first entry);
  // closing it just collapses, leaving the current selection untouched.
  typeNav.querySelectorAll('[data-type-header]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.typeHeader;
      if (state.navExpanded.has(type)) {
        state.navExpanded.delete(type);
        highlightNav();
      } else {
        selectTypeTab(type); // adds to navExpanded + selects the type in read mode
      }
    });
  });
  typeNav.querySelectorAll('.nav-entry').forEach((btn) => {
    btn.addEventListener('click', () => loadEntry(btn.dataset.type, btn.dataset.id));
  });
  typeNav.querySelectorAll('[data-new-entry]').forEach((btn) => {
    btn.addEventListener('click', () => newEntry(btn.dataset.newEntry));
  });
  typeNav.querySelectorAll('[data-restore-entry-id]').forEach((btn) => {
    btn.addEventListener('click', () => setEntryStatus(btn.dataset.restoreEntryType, btn.dataset.restoreEntryId, 'active'));
  });
  typeNav.querySelector('#new-type-btn')?.addEventListener('click', createType);
  typeNav.querySelectorAll('[data-restore-type]').forEach((btn) => {
    btn.addEventListener('click', () => setTypeStatus(btn.dataset.restoreType, 'active'));
  });
}

// Select a type in the reader (opens its first entry). The nav-header entry point.
function selectTypeTab(type) {
  state.navExpanded.add(type);
  goto(selectType(state.view, type));
}

// Reflect expansion (from navExpanded) + the active type/entry (or Admin) in the nav.
function highlightNav() {
  typeNav.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('is-active'));
  typeNav.querySelectorAll('.nav-type').forEach((el) => el.classList.remove('is-expanded'));

  // Expansion is independent of selection — an opened section stays open until toggled shut.
  state.navExpanded.forEach((type) => {
    typeNav.querySelector(`.nav-type[data-type="${CSS.escape(type)}"]`)?.classList.add('is-expanded');
  });

  if (inGlobalAdmin()) return; // the global-admin door is a header-menu surface, not a sidebar item
  const type = curType();
  if (!type) return;
  const typeEl = typeNav.querySelector(`.nav-type[data-type="${CSS.escape(type)}"]`);
  if (!typeEl) return;
  typeEl.querySelector('.nav-type-header')?.classList.add('is-active');
  typeEl.querySelectorAll('.nav-entry').forEach((el) => {
    if (el.dataset.id === String(state.formData.id)) el.classList.add('is-active');
  });
}

// View Mode Switcher (Preview / Raw JSON — Raw is an admin/power tool)
document.querySelectorAll('.preview-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preview-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentViewMode = btn.dataset.view;

    if (state.currentViewMode === 'rendered') {
      previewRendered.classList.remove('hidden');
      previewRawContainer.classList.add('hidden');
    } else {
      previewRendered.classList.add('hidden');
      previewRawContainer.classList.remove('hidden');
    }
  });
});

// Force the rendered pane (used when leaving the admin Raw JSON power tool for a builder entry).
function showRenderedPane() {
  state.currentViewMode = 'rendered';
  document.querySelectorAll('.preview-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === 'rendered'));
  previewRendered.classList.remove('hidden');
  previewRawContainer.classList.add('hidden');
}

// The single renderer: render the content area + chrome to match state.view. Used on navigation,
// codex switch, content changes, and boot — NOT on in-place read/edit toggles (those keep the open
// form/preview without re-subscribing). Content dispatch by view: global-admin door, empty codex,
// per-type schema editor ("admin"), else the entry reader/form.
function renderView() {
  const v = state.view;
  renderNav(); // the sidebar reflects the surface: content types, or the admin nav
  if (v.kind === 'global-admin') enterGlobalAdmin();
  else if (!v.type) renderEmptyCodexState();
  else if (v.mode === 'admin') enterSchemaAdmin(v.type);
  else {
    // Ensure the open entry belongs to the current type (a type switch reselects its first entry).
    if (!state.formData || state.formData.type !== v.type) {
      const entries = activeEntries(state.entryIndex, v.type);
      state.formData = entries.length ? { ...entries[0] } : { type: v.type };
    }
    showRenderedPane();
    renderForm();
  }
  applyViewChrome();
  highlightNav();
}

// Apply the one flat workspace class + header-button visibility from state.view (successor to the old
// applyMode's chrome half) — the only place view-state reaches the workspace chrome.
function applyViewChrome() {
  const v = state.view;
  const canEdit = !!state.caps.canEdit;
  const canAdmin = !!state.caps.canAdmin;

  const cls =
    v.kind === 'global-admin' ? 'view-global-admin'
    : v.mode === 'edit' ? 'view-content-edit'
    : v.mode === 'admin' ? 'view-content-admin'
    : 'view-content-read';
  mainWorkspace.classList.remove('view-content-read', 'view-content-edit', 'view-content-admin', 'view-global-admin');
  mainWorkspace.classList.add(cls);

  // Edit sits in the reader header (content read); Save/Done live in the form header (edit). Structure
  // is a toggle: "Structure" to enter from reading, "Done" to leave — so it's never a dead end.
  const inTypeRead = v.kind === 'type' && !!v.type && v.mode === 'read';
  const inStructure = v.kind === 'type' && !!v.type && v.mode === 'admin';
  editToggleBtn.hidden = !(canEdit && inTypeRead);
  structureBtn.hidden = !(canAdmin && (inTypeRead || inStructure));
  structureBtn.textContent = inStructure ? 'Done' : 'Structure';
  const editingEntry = v.kind === 'type' && v.mode === 'edit';
  saveEntryBtn.hidden = !(canEdit && editingEntry);
  // Archive only makes sense for an already-saved entry (a brand-new draft has no id yet).
  archiveEntryBtn.hidden = !(canEdit && editingEntry && !!state.formData.id);
}

editToggleBtn.addEventListener('click', () => {
  if (!state.caps.canEdit || state.view.kind !== 'type' || !state.view.type) return;
  state.view = toEdit(state.view);
  renderFormWithoutResubscribe(); // reflect current formData (e.g. an id just assigned on save)
  applyViewChrome();
});

structureBtn.addEventListener('click', () => {
  if (!state.caps.canAdmin || state.view.kind !== 'type' || !state.view.type) return;
  goto(inSchemaAdmin() ? toRead(state.view) : toSchemaAdmin(state.view));
});

doneEditBtn.addEventListener('click', () => {
  state.view = toRead(state.view);
  refreshBuilderPreview();
  applyViewChrome();
});

saveEntryBtn.addEventListener('click', () => saveEntry());
archiveEntryBtn.addEventListener('click', () => archiveCurrentEntry());

// ── Global-admin door (admin-only) ──────────────────────────────────────────
// Two panels: Users & Access (roster) and Codices (create/rename/archive). Per-type schema editing is
// no longer here — it's the per-type "Structure" (admin) mode. Only admins reach this surface
// (normalize() guarantees it).

let adminUsersUnsub = null;
let adminPermsUnsub = null;

function enterGlobalAdmin() {
  readerTitle.textContent = 'Admin';
  editorTitle.textContent = 'Admin';
  showRenderedPane();
  ensureAdminSubscriptions();
  renderAdminPanel();
}

function renderAdminPanel() {
  if (state.view.panel === 'codices') {
    formContainer.innerHTML = renderCodicesPanelHtml();
    wireCodicesPanel();
    updateRenderedPreview('<div class="admin-blurb">Admin — create and manage codices.</div>');
    updateRawJson('');
  } else {
    formContainer.innerHTML = renderAccessPanel({ codexId: state.currentCodexId, rows: buildRosterRows() });
    wireAccessPanel();
    updateRenderedPreview('<div class="admin-blurb">Admin — manage codex access.</div>');
    updateRawJson('');
  }
}

// The per-type "Structure" (schema) surface: the schema editor mounted for `type` in the left panel,
// its live type preview on the right. Entered via the reader's Structure button or the editor's type
// picker. Note: this is a content-surface mode (kind:'type', mode:'admin'), not the global-admin door.
function enterSchemaAdmin(type) {
  const schema = getSchema(type);
  readerTitle.textContent = (schema && schema.label) || type;
  editorTitle.textContent = readerTitle.textContent;
  showRenderedPane();
  setEditingType(type); // renders the schema editor into #form-container + refreshes the preview
}

// ── Codices admin panel (create / rename / archive-restore) ──────────────────
// Managing codices needs the app-global registry (Firestore) — inert in local-only mode.

function renderCodicesPanelHtml() {
  if (!(state.fbManager && state.fbManager.isConfigured())) {
    return '<div class="admin-section"><div class="admin-muted">Codex management needs cloud mode (Firebase).</div></div>';
  }
  const uid = state.authManager?.currentUser?.uid || '';
  const active = switcherCodices(state.codices, [], { isAdmin: true, uid });
  return renderCodicesPanel({
    active,
    archived: archivedCodices(state.codices),
    templateSources: active,
    currentCodexId: state.currentCodexId,
  });
}

function wireCodicesPanel() {
  const nameInput = document.getElementById('codex-create-name');
  const slugEl = document.getElementById('codex-create-slug');
  if (nameInput && slugEl) {
    nameInput.addEventListener('input', () => {
      slugEl.textContent = slugify(nameInput.value) || '—';
    });
  }
  document.getElementById('codex-create-btn')?.addEventListener('click', createCodex);
  formContainer.querySelectorAll('[data-codex-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.codexRename;
      const input = formContainer.querySelector(`[data-codex-name="${CSS.escape(id)}"]`);
      renameCodex(id, input ? input.value : '');
    });
  });
  formContainer.querySelectorAll('[data-codex-archive]').forEach((btn) => {
    btn.addEventListener('click', () => setCodexStatus(btn.dataset.codexArchive, 'archived'));
  });
  formContainer.querySelectorAll('[data-codex-restore]').forEach((btn) => {
    btn.addEventListener('click', () => setCodexStatus(btn.dataset.codexRestore, 'active'));
  });
}

// Create a codex: slug from the name (rejected on collision), meta + creator grant, optional
// template copy of another codex's types, then auto-switch to it (spec §6.2).
async function createCodex() {
  if (!(state.fbManager && state.fbManager.isConfigured())) return;
  const name = (document.getElementById('codex-create-name')?.value || '').trim();
  if (!name) return showToast('Enter a codex name');
  const slug = slugify(name);
  if (!slug) return showToast('That name has no letters or numbers to make an id from');
  if (isSlugTaken(slug, state.codices.map((c) => c.codexId))) {
    return showToast(`A codex "${slug}" already exists — pick a different name`);
  }
  const templateId = document.getElementById('codex-create-template')?.value || '';
  const uid = state.authManager?.currentUser?.uid;
  const nowIso = new Date().toISOString();
  try {
    await state.fbManager.saveCodexMeta(slug, { name, status: 'active', createdBy: uid, createdAt: nowIso });
    if (uid) await state.fbManager.savePermission(uid, slug, { role: 'editor', grantedBy: uid, grantedAt: nowIso });
    if (templateId) {
      const sourceSchemas = await state.fbManager.codex(templateId).getSchemas();
      const dest = state.fbManager.codex(slug);
      await Promise.all(buildTemplateSchemas(sourceSchemas).map((s) => dest.saveSchema(s.type, s)));
    }
    showToast(`Created “${name}”`);
    // Land in the new codex's content: its empty state surfaces "＋ New type" (or a template's first
    // type once schemas load). A blank content view lets switchCodex's normalize resolve it.
    state.view = { kind: 'type', type: null, mode: 'read' };
    switchCodex(slug);
  } catch (err) {
    showToast('Create failed: ' + err.message);
  }
}

// Rename edits the display name only — the codex id (Firestore key) is immutable (spec §5.4).
function renameCodex(codexId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return showToast('Name cannot be empty');
  state.fbManager
    .saveCodexMeta(codexId, { name: trimmed })
    .then(() => {
      showToast('Renamed');
      renderCodexSwitcher();
    })
    .catch((err) => showToast('Rename failed: ' + err.message));
}

// Soft archive/restore — a status flag, never a delete. The live registry sub re-renders the panel.
function setCodexStatus(codexId, status) {
  state.fbManager
    .saveCodexMeta(codexId, { status })
    .then(() => showToast(status === 'archived' ? 'Archived' : 'Restored'))
    .catch((err) => showToast('Change failed: ' + err.message));
}

// Open Admin › Codices directly (the switcher's "＋ New codex" shortcut).
function openCodicesAdmin() {
  goto(openGlobalAdmin(state.view, 'codices'));
}

function wireAccessPanel() {
  formContainer.querySelectorAll('[data-grant-uid]').forEach((btn) => {
    btn.addEventListener('click', () => grantRole(btn.dataset.grantUid, btn.dataset.grantRole));
  });
}

// ── Types: new-type + archive/restore ────────────────────────────────────────
// A type is a schema doc; archive is a status flip on it (no new rules needed). Persistence
// mirrors the schema editor's Save: local overlay + Firestore saveSchema when configured.

// Persist a schema to the active codex (overlay + Firestore), the shared write path for
// new-type, archive, and restore.
function persistSchema(type, schema) {
  saveSchemaLocal(type, schema);
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope.saveSchema(type, schema).catch((err) => showToast('Firebase save error: ' + err.message));
  }
}

// Create a type from the nav's "＋ New type" input, then drop into its Structure (schema) mode.
function createType() {
  const input = document.getElementById('new-type-name');
  const label = (input?.value || '').trim();
  if (!label) return showToast('Enter a type name');
  const existing = [...listTypes(), ...listArchivedTypes()].map((t) => t.type);
  const schema = newTypeSchema(label, existing);
  persistSchema(schema.type, schema);
  renderTypeNav();
  showToast(`Created “${label}” type`);
  goto(toSchemaAdmin(selectType(state.view, schema.type)));
}

// Flip a type's status (archive/restore). Re-clamps the view so archiving the type you're viewing or
// structuring lands you somewhere valid; restore just refreshes the nav.
function setTypeStatus(type, status) {
  const schema = getSchema(type);
  if (!schema) return;
  persistSchema(type, { ...schema, status });
  renderTypeNav();
  state.view = normalize(state.view, viewCtx());
  renderView();
  showToast(status === 'archived' ? `Archived “${schema.label}”` : `Restored “${schema.label}”`);
}

// Join the users roster with their permission for the current codex.
function buildRosterRows() {
  const roleByUid = new Map(
    state.adminPerms.filter((p) => p.codexId === state.currentCodexId).map((p) => [p.uid, p.role])
  );
  return state.adminUsers.map((u) => ({
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    lastSeenAt: u.lastSeenAt,
    role: roleByUid.get(u.uid) || 'none',
    isAdmin: isAdminEmail(u.email, appConfig.auth.adminEmail),
  }));
}

// Grant or revoke a role. The roster re-renders from the live subscription once the write lands.
function grantRole(uid, role) {
  const grantedBy = state.authManager?.currentUser?.uid;
  const action =
    role === 'none'
      ? state.fbManager.deletePermission(uid, state.currentCodexId)
      : state.fbManager.savePermission(uid, state.currentCodexId, {
          role,
          grantedBy,
          grantedAt: new Date().toISOString(),
        });
  action?.catch((err) => showToast('Access change failed: ' + err.message));
}

function ensureAdminSubscriptions() {
  if (!(state.caps.canAdmin && state.fbManager && state.fbManager.isConfigured())) return;
  if (!adminUsersUnsub) {
    adminUsersUnsub = state.fbManager.subscribeUsers((users) => {
      state.adminUsers = users;
      if (inGlobalAdmin() && state.view.panel === 'access') renderAdminPanel();
    });
  }
  if (!adminPermsUnsub) {
    adminPermsUnsub = state.fbManager.subscribePermissions((perms) => {
      state.adminPerms = perms;
      if (inGlobalAdmin() && state.view.panel === 'access') renderAdminPanel();
    });
  }
}


// ── Schema editor (lives inside the Admin › Types panel) ─────────────────────
// The editor holds a deep-cloned working schema. Structural edits rebuild the editor
// DOM; text edits don't (to keep input focus). Every change re-renders the live preview
// through the in-memory overlay. Nothing persists until Save; Reset returns to seed.

// Where the schema editor mounts: the left form panel (Structure mode owns the whole panel).
function typesMountEl() {
  return formContainer;
}

// A representative entry to render the type's read-view preview against.
function sampleForType(type) {
  const list = activeEntries(state.entryIndex, type);
  return list.length ? list[0] : { type };
}

function setEditingType(type) {
  state.editingType = type;
  state.editorErrors = [];
  state.workingSchema = structuredClone(getSchema(type));
  renderTypesEditor();
}

// Rebuild the structured editor (after a structural change) and refresh the preview.
function renderTypesEditor() {
  const mount = typesMountEl();
  mount.innerHTML = renderSchemaEditor(state.workingSchema, {
    types: listTypes(),
    editingType: state.editingType,
    errors: state.editorErrors,
  });
  attachSchemaEditor(mount.querySelector('.schema-editor'), handleSchemaIntent);
  refreshWorkingPreview();
}

// Push the working schema into the overlay and refresh both preview panes. Does NOT
// rebuild the editor DOM — safe to call from text-input handlers without losing focus.
function refreshWorkingPreview() {
  setOverlaySchema(state.editingType, state.workingSchema);
  updateRenderedPreview(renderEntryHTML(state.editingType, sampleForType(state.editingType), renderCtx));
  updateRawJson(JSON.stringify(state.workingSchema, null, 2));
}

// Translate an editor intent into a working-schema transform. Structural actions rebuild
// the editor; text/checkbox edits only refresh the preview.
function handleSchemaIntent(intent) {
  const s = state.workingSchema;
  switch (intent.action) {
    case 'pick-type':
      // The editor's type picker navigates to that type's Structure mode (single source of truth).
      return goto(toSchemaAdmin(selectType(state.view, intent.type)));
    case 'edit-label':
      state.workingSchema = { ...s, label: intent.label };
      return refreshWorkingPreview();
    case 'save':
      return saveWorkingSchema();
    case 'reset':
      return resetWorkingSchema();
    case 'archive':
      return setTypeStatus(state.editingType, 'archived');
    case 'add-section':
      state.workingSchema = addSection(s, 'New Section');
      return renderTypesEditor();
    case 'remove-section':
      state.workingSchema = removeSection(s, intent.si);
      return renderTypesEditor();
    case 'move-section':
      state.workingSchema = moveSection(s, intent.si, intent.delta);
      return renderTypesEditor();
    case 'rename-section':
      state.workingSchema = renameSection(s, intent.si, intent.title);
      return refreshWorkingPreview();
    case 'add-field': {
      const key = deriveKey('New Field', allFieldKeys(s));
      state.workingSchema = addField(s, intent.si, { key, label: 'New Field', kind: 'text' });
      return renderTypesEditor();
    }
    case 'remove-field':
      state.workingSchema = removeField(s, intent.si, intent.fi);
      return renderTypesEditor();
    case 'move-field':
      state.workingSchema = moveField(s, intent.si, intent.fi, intent.delta);
      return renderTypesEditor();
    case 'change-kind':
      // Kind toggles which conditional controls show — rebuild the editor.
      state.workingSchema = updateField(s, intent.si, intent.fi, { kind: intent.kind });
      return renderTypesEditor();
    case 'edit-field':
      state.workingSchema = updateField(s, intent.si, intent.fi, intent.patch);
      return refreshWorkingPreview();
    default:
      return undefined;
  }
}

function saveWorkingSchema() {
  const result = validateSchema(state.workingSchema);
  if (!result.ok) {
    state.editorErrors = result.errors;
    renderTypesEditor();
    return;
  }
  state.editorErrors = [];
  saveSchemaLocal(state.editingType, state.workingSchema); // overlay + localStorage
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope
      .saveSchema(state.editingType, state.workingSchema)
      .catch((err) => showToast('Firebase save error: ' + err.message));
  }
  renderTypesEditor();
  renderTypeNav(); // reflect a rename / icon change in the sidebar
  showToast(`Saved “${state.editingType}” type`);
}

function resetWorkingSchema() {
  resetSchema(state.editingType); // drop the local edit; fall back to the loaded base
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope.deleteSchema(state.editingType).catch((err) => showToast('Firebase reset error: ' + err.message));
  }
  state.editorErrors = [];
  state.workingSchema = structuredClone(getSchema(state.editingType)); // the loaded base
  renderTypesEditor();
  showToast(`Reset “${state.editingType}”`);
}

// Apply a live edit from the Raw JSON pane to the working schema (the Advanced escape
// hatch). Rebuilds the structured editor but leaves the textarea as typed.
function applySchemaRawJsonEdit() {
  let parsed;
  try {
    parsed = JSON.parse(previewRawTextarea.value);
  } catch (err) {
    setJsonError(err.message);
    return;
  }
  if (!parsed || !Array.isArray(parsed.sections)) {
    setJsonError('A schema needs a "sections" array.');
    return;
  }
  clearJsonError();

  state.workingSchema = parsed;
  const mount = typesMountEl();
  mount.innerHTML = renderSchemaEditor(state.workingSchema, {
    types: listTypes(),
    editingType: state.editingType,
    errors: state.editorErrors,
  });
  attachSchemaEditor(mount.querySelector('.schema-editor'), handleSchemaIntent);
  setOverlaySchema(state.editingType, state.workingSchema);
  updateRenderedPreview(renderEntryHTML(state.editingType, sampleForType(state.editingType), renderCtx));
}

// Realtime Firestore Doc Subscription
function subscribeToLiveFirestoreDoc(type, id) {
  if (state.activeDocUnsubscribe) {
    state.activeDocUnsubscribe();
    state.activeDocUnsubscribe = null;
  }
  state.liveDocId = null;

  const scope = codexScope();
  if (scope && scope.isConfigured() && id) {
    state.liveDocId = id;
    state.activeDocUnsubscribe = scope.subscribeToDoc(type, id, (remoteData) => {
      if (remoteData) {
        state.formData = { ...state.formData, ...remoteData };
        renderFormWithoutResubscribe();
      }
    });
  }

  renderSyncStatus();
}

// Render Form into Editor Panel
function renderForm() {
  renderFormWithoutResubscribe();
  subscribeToLiveFirestoreDoc(curType(), state.formData.id);
}

function renderFormWithoutResubscribe() {
  lastFocusedProseField = null;

  const title = entryTitle(state.formData, curType());
  readerTitle.textContent = title;
  editorTitle.textContent = title;

  const mediaBlock = schemaHasMedia(curType()) ? renderMediaControls(state.formData) : '';
  formContainer.innerHTML = renderSchemaForm(getSchema(curType()), state.formData, renderCtx) + mediaBlock;

  attachFormInputListeners();
  wireMediaForCurrentForm();
  refreshBuilderPreview();
}

// Attach Input Listeners & Auto-Sync to Firebase. Schema fields carry data-field-key
// (+ data-field-kind); media buttons carry neither and are wired separately.
function attachFormInputListeners() {
  formContainer.querySelectorAll('[data-field-key]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const el = e.target;
      const key = el.dataset.fieldKey;
      state.formData[key] =
        el.dataset.fieldKind === 'list'
          ? el.value.split('\n').map((s) => s.trim()).filter(Boolean)
          : el.value;
      // Keep the header title live as the title field is edited.
      readerTitle.textContent = entryTitle(state.formData, curType());
      editorTitle.textContent = readerTitle.textContent;
      refreshBuilderPreview();
      autoSaveToFirebase();
    });
  });

  // Track the last-focused prose field for inline-image insertion
  formContainer.querySelectorAll('textarea[data-field-kind="prose"]').forEach((ta) => {
    ta.addEventListener('focus', () => { lastFocusedProseField = ta; });
  });
}

// Wire the imagery controls (hero / carousel / inline) for media-capable tabs
function wireMediaForCurrentForm() {
  if (!schemaHasMedia(curType())) return;
  attachMediaControls({
    container: formContainer,
    formData: state.formData,
    onMutate: () => {
      renderFormWithoutResubscribe();
      autoSaveToFirebase();
    },
    getFocusedField: () => lastFocusedProseField,
  });
}

// Serialize the current entry as pretty JSON (the stored format)
function currentEntryJson() {
  return JSON.stringify({ ...state.formData, type: curType() }, null, 2);
}

// Whether the current entry has any content worth saving
function entryHasContent() {
  return Object.values(state.formData || {}).some((v) =>
    typeof v === 'string' ? v.trim() !== '' : v != null
  );
}

// Entry HTML + carousel composed after it (carousel is never part of the entry body)
function currentPreviewHTML() {
  return renderEntryHTML(curType(), state.formData, renderCtx) + renderCarousel(state.formData.gallery);
}

// Re-render the current builder entry & refresh both preview panels
function refreshBuilderPreview() {
  updateRenderedPreview(currentPreviewHTML());
  initCarousel(previewRendered);
  updateRawJson(currentEntryJson());
}

function updateRenderedPreview(html) {
  previewRendered.innerHTML = html;
}

// Reference links in the reading view navigate to the target entry.
previewRendered.addEventListener('click', (e) => {
  const link = e.target.closest('[data-ref-type]');
  if (!link) return;
  e.preventDefault();
  loadEntry(link.dataset.refType, link.dataset.refId);
});

function loadEntry(type, id) {
  const entry = findEntryByTypeId(type, id);
  if (!entry) {
    showToast('Entry not found');
    return;
  }
  state.formData = { ...entry };
  state.navExpanded.add(type); // keep the selected entry's section open
  // Open an entry in read mode (preserve edit if the author was already editing this type).
  const keepEditing = state.view.kind === 'type' && state.view.type === type && state.view.mode === 'edit';
  state.view = normalize(keepEditing ? toEdit(selectType(state.view, type)) : selectType(state.view, type), viewCtx());
  showRenderedPane();
  renderForm();
  applyViewChrome();
  highlightNav();
}

// ── Entry lifecycle: create + soft archive/restore ───────────────────────────
// A new entry is a blank-from-schema form in edit mode; its id is assigned from the title on
// the first Save (deriveEntryId). Archive/restore is a `status` flip persisted like any edit.

function newEntry(type) {
  if (!state.caps.canEdit) return;
  const schema = getSchema(type);
  if (!schema) return;
  state.navExpanded.add(type);
  state.formData = blankEntry(schema);
  state.view = normalize(toEdit(selectType(state.view, type)), viewCtx());
  showRenderedPane();
  renderForm();
  applyViewChrome();
  highlightNav();
}

// Add/replace an entry in the in-memory index so local-only mode reflects a save immediately
// (configured mode gets the same state from the entries subscription firing after the write).
function upsertLocalEntry(entry) {
  const list = (state.entryIndex[entry.type] ||= []);
  const i = list.findIndex((e) => e.id === entry.id);
  if (i >= 0) list[i] = { ...entry };
  else list.push({ ...entry });
}

// Flip an entry's status (archive/restore). Persists via the codex scope, or the local index
// in local-only mode. After archiving the open entry, selects another active one.
function setEntryStatus(type, id, status) {
  if (!state.caps.canEdit) return;
  const entry = findEntryByTypeId(type, id);
  if (!entry) return;
  const updated = { ...entry, status };
  persistEntry(type, updated);
  if (status === 'archived' && state.formData.id === id && curType() === type) {
    const remaining = activeEntries(state.entryIndex, type).filter((e) => e.id !== id);
    state.formData = remaining[0] ? { ...remaining[0] } : { type };
    state.view = normalize(toRead(state.view), viewCtx());
    renderForm();
  }
  renderTypeNav();
  applyViewChrome();
  highlightNav();
  showToast(status === 'archived' ? 'Archived entry' : 'Restored entry');
}

// Archive the entry currently open in the editor (header Archive button).
function archiveCurrentEntry() {
  if (state.formData.id) setEntryStatus(curType(), state.formData.id, 'archived');
}

// Persist an entry to the active codex (Firestore) or the local index (local-only mode).
function persistEntry(type, entry) {
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope.saveDoc(type, entry.id, entry).catch((err) => showToast('Save error: ' + err.message));
  } else {
    upsertLocalEntry(entry);
  }
}

function updateRawJson(jsonText) {
  // Editable only in the admin Types editor (the Raw JSON power tool). Builder entries no longer
  // surface Raw JSON in the content-edit path.
  previewRawTextarea.readOnly = !(state.caps.canEdit && inSchemaAdmin());
  // Never overwrite the textarea while the user is actively typing in it
  if (document.activeElement === previewRawTextarea) return;
  previewRawTextarea.value = jsonText;
  clearJsonError();
}

// Persist the current entry to Firebase — used by autosave-on-input and the form Save button.
function autoSaveToFirebase() {
  if (!state.caps.canEdit) return; // read-only users never write (rules also enforce)
  if (!state.formData.id) return; // a new entry persists on explicit Save (which assigns its id)
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope.saveDoc(curType(), state.formData.id, state.formData);
  }
}

// Explicit per-entry Save (form header): assign a new entry's id from its title, persist, then
// return to the reader.
function saveEntry() {
  if (!state.caps.canEdit) {
    showToast('Read-only — you don’t have edit access.');
    return;
  }
  if (!entryHasContent()) {
    showToast('Nothing to save!');
    return;
  }
  if (!state.formData.id) {
    const schema = getSchema(curType());
    const title =
      (schema && state.formData[schema.titleField]) || state.formData.title || state.formData.name || '';
    const existing = (state.entryIndex[curType()] || []).map((e) => e.id);
    state.formData.id = deriveEntryId(title, existing);
  }
  if (!state.formData.status) state.formData.status = 'active';

  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope
      .saveDoc(curType(), state.formData.id, state.formData)
      .then(() => showToast('Saved entry'))
      .catch((err) => showToast('Save error: ' + err.message));
  } else {
    upsertLocalEntry(state.formData);
    showToast('Saved locally');
  }
  state.view = normalize(toRead(state.view), viewCtx());
  refreshBuilderPreview();
  renderTypeNav(); // a newly-created entry shows up in the nav
  applyViewChrome();
  highlightNav();
}

// Apply a live edit from the Raw JSON editor (admin Types power tool) back into the schema.
function applyRawJsonEdit() {
  if (inSchemaAdmin()) return applySchemaRawJsonEdit();
}

function setJsonError(message) {
  previewRawTextarea.classList.add('is-invalid');
  jsonErrorEl.textContent = `Invalid JSON — ${message}`;
  jsonErrorEl.classList.remove('hidden');
}

function clearJsonError() {
  previewRawTextarea.classList.remove('is-invalid');
  jsonErrorEl.classList.add('hidden');
}

// Raw JSON editor — live-apply on valid input, rebuild the editor on blur (admin Types only)
previewRawTextarea.addEventListener('input', applyRawJsonEdit);
previewRawTextarea.addEventListener('change', () => {
  if (!inSchemaAdmin()) return;
  try {
    JSON.parse(previewRawTextarea.value);
  } catch {
    return; // leave the invalid text and error visible for the user to fix
  }
  renderTypesEditor(); // rebuild editor + normalize the schema JSON
});

// Reflect the real cloud-connection state in the status badge
function renderSyncStatus() {
  const configured = !!(state.fbManager && state.fbManager.isConfigured());

  let label;
  if (configured) {
    label = state.liveDocId ? `Live sync · ${state.liveDocId}` : 'Cloud sync on';
  } else {
    label = 'Local only — saved in this browser';
  }

  activeFileIndicator.className = `compliance-badge${configured ? '' : ' is-local'}`;
  activeFileIndicator.innerHTML = `<span class="${configured ? 'pulse-dot' : 'idle-dot'}"></span> ${label}`;
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Bootstrap Auth & Application. initAuth() resolves capabilities and renders the right screen;
// the workspace (initial nav render + content subscriptions) is set up by showWorkspace() once read
// access is confirmed — not here — so no codex reads fire before authorization.
initAuth();
renderSyncStatus();
