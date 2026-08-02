/**
 * Codex Studio — Main Application Bootstrap
 */

import { seedCivilizations, seedMods, seedRegions, seedDecisionLogs } from './data/seedData.js';
import { seedAtm10Codex, ATM10_CODEX_ID } from './data/seedCodex.js';
import { renderEntryHTML } from './utils/entryRenderer.js';
import { FirebaseManager } from './utils/firebase.js';
import { AuthManager } from './utils/authManager.js';
import { appConfig, resolveFirebaseConfig } from './config/appConfig.js';

import { renderForm as renderSchemaForm } from './schema/formRenderer.js';
import {
  getSchema,
  setOverlaySchema,
  listTypes,
  hydrateOverlayFromStorage,
  saveSchemaLocal,
  resetSchema,
} from './schema/schemaStore.js';
import { validateSchema } from './schema/schemaValidate.js';
import { escapeHtml } from './schema/inlineText.js';
import { getIcon } from './schema/iconRegistry.js';
import { buildNavModel } from './schema/navModel.js';
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
} from './components/schemaEditor.js';
import { renderAuthGateway } from './components/authGateway.js';
import { renderAwaitingAccess } from './components/awaitingAccess.js';
import { renderAdminSubnav, renderAccessPanel } from './components/adminView.js';
import { resolveCapabilities } from './utils/capabilities.js';
import { renderMediaControls, attachMediaControls } from './components/mediaControls.js';
import { renderCarousel, initCarousel } from './components/carousel.js';
import { resolve as resolvePoolImage } from './utils/imagePool.js';

// Tabs whose entries support imagery (hero / carousel / inline)
const MEDIA_TABS = ['civilization', 'mod', 'region'];

// Last-focused prose textarea, target for inline-image insertion
let lastFocusedProseField = null;

// Tabs that represent a single editable JSON entry
const BUILDER_TABS = ['civilization', 'mod', 'region', 'decision'];

// localStorage key persisting the active codex across reloads.
const CURRENT_CODEX_KEY = 'codex_current_id';

// Application State
const state = {
  currentTab: 'civilization',
  // Read-first workspace: everyone lands in 'read' (reading view); editors/admins toggle to 'edit'.
  mode: 'read',
  currentViewMode: 'rendered',
  formData: { ...seedCivilizations[0] },
  // The active codex. Phase 3 renders the current codex only; the switcher (create/select/rename)
  // arrives in Phase 4. Every Firestore access is codex-scoped from Phase 1.
  currentCodexId: localStorage.getItem(CURRENT_CODEX_KEY) || ATM10_CODEX_ID,
  firebaseConfig: resolveFirebaseConfig(appConfig.firebase, localStorage.getItem('codex_firebase_override')),
  fbManager: null,
  authManager: null,
  activeDocUnsubscribe: null,
  liveDocId: null,
  // Access control (Phase 2): the current user's capabilities on the current codex, their own
  // permission doc, and whether that doc has loaded yet (to avoid flashing awaiting-access on boot).
  caps: { isAuthed: false, role: 'none', canRead: false, canEdit: false, canAdmin: false },
  permission: null,
  permissionLoaded: false,
  workspaceReady: false,
  // Types editor (admin) working state
  editingType: 'civilization',
  workingSchema: null,
  editorErrors: [],
  // Admin section state
  adminPanel: 'access',          // 'access' | 'types'
  adminUsers: [],
  adminPerms: [],
  codexInitialized: false
};

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

// Content seed: an idempotent, console-invokable seed. Run it once while signed in as the
// super-admin — `window.seedCodex()` — to write the bundled content into codices/atm10/….
// Also backs the admin "Initialize codex" button.
window.seedCodex = async () => {
  const uid = state.authManager?.currentUser?.uid;
  if (!uid) {
    showToast('Sign in as the super-admin before seeding.');
    return;
  }
  try {
    const result = await seedAtm10Codex(state.fbManager, uid);
    const msg = result.seeded
      ? `Seeded ${state.currentCodexId} — ${result.counts.entries} entries, ${result.counts.schemas} schemas`
      : `Seed skipped — ${result.counts.reason}`;
    showToast(msg);
    console.log('[seedCodex]', result);
    return result;
  } catch (err) {
    showToast('Seed error: ' + err.message);
    console.error('[seedCodex]', err);
  }
};

// Overlay any Firestore-authored schemas on top of the bundled seed schemas. Seed is
// the offline source of truth; this only adds/overrides when a project is configured.
let schemaUnsubscribe = null;
function subscribeSchemaOverlay() {
  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  const scope = codexScope();
  if (!(scope && scope.isConfigured())) return;
  schemaUnsubscribe = scope.subscribeSchemas((schemas) => {
    schemas.forEach((s) => { if (s && s.type) setOverlaySchema(s.type, s); });
    if (BUILDER_TABS.includes(state.currentTab)) renderFormWithoutResubscribe();
  });
}
// Local schema edits (from the Types editor) survive a reload via localStorage; a Firestore
// subscription then wins per-type when configured. Hydrate before the first render. The Firestore
// schema subscription is deferred to showWorkspace() — it must not fire until the user has read access.
hydrateOverlayFromStorage();

// Cross-entry lookup for reference fields. Resolves against seed entries — the fixed
// set of pages that exist in phase 1; a live Firestore index can extend this later.
const SEED_BY_TYPE = {
  civilization: seedCivilizations,
  mod: seedMods,
  region: seedRegions,
  decision: seedDecisionLogs,
};
const entryLabel = (e) => e.name || e.title || e.id;
const entriesOfType = (type) => (SEED_BY_TYPE[type] || []).map((e) => ({ id: e.id, label: entryLabel(e) }));
const findSeedEntry = (type, id) => (SEED_BY_TYPE[type] || []).find((e) => e.id === id) || null;

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
    const entry = findSeedEntry(type, id);
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
const saveEntryBtn = document.getElementById('btn-save-entry');
const doneEditBtn = document.getElementById('btn-done-edit');
const readerTitle = document.getElementById('reader-title');
const editorTitle = document.getElementById('editor-title');
const typeNav = document.getElementById('type-nav');
const navAdmin = document.getElementById('nav-admin');
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
    renderCodexSwitcher();
    navAdmin.querySelector('.nav-icon').innerHTML = getIcon('admin');
    renderTypeNav();
    subscribeSchemaOverlay();      // deferred codex-content subscription (now that canRead is true)
    switchTab(state.currentTab);   // initial workspace render (subscribes the live doc)
    renderSyncStatus();
  }
  applyMode(); // reflect current capabilities (e.g., permission just arrived → canEdit changed)
}

// Tear down codex-content subscriptions + the one-time workspace init, so re-auth re-initializes.
function teardownWorkspace() {
  state.workspaceReady = false;
  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  if (state.activeDocUnsubscribe) { state.activeDocUnsubscribe(); state.activeDocUnsubscribe = null; }
  if (adminUsersUnsub) { adminUsersUnsub(); adminUsersUnsub = null; }
  if (adminPermsUnsub) { adminPermsUnsub(); adminPermsUnsub = null; }
}

// Render the header user badge: signed-in identity + sign-out, or a sign-in button. Empty in
// local-only mode (no auth). Authorization is not decided here — that's renderAppState via caps.
function renderUserBadge() {
  if (!state.authManager) {
    userProfileBadge.innerHTML = '';
    return;
  }
  const user = state.authManager.currentUser;
  if (user) {
    userProfileBadge.innerHTML = `
      <div class="user-badge" title="Signed in as ${user.username}">
        <img src="${user.avatar}" class="user-avatar" alt="${user.username}">
        <span>${user.globalName || user.username}</span>
        <button id="btn-logout" class="btn btn-secondary btn-sm" style="margin-left:4px; padding:2px 6px;">Sign Out</button>
      </div>
    `;
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      state.authManager.logout().catch((err) => showToast(err.message));
    });
  } else {
    userProfileBadge.innerHTML = `
      <button id="btn-google-login" class="btn btn-secondary">Sign in with Google</button>
    `;
    document.getElementById('btn-google-login')?.addEventListener('click', () => {
      state.authManager.login().catch((err) => showToast(err.message));
    });
  }
}

// ── Sidebar navigation (codex → type → entry, then Admin) ───────────────────
// The nav is data-driven: types come from listTypes() (the current codex's schemas) and entries
// from the seed index. Selecting a type loads its first entry into the reader; selecting an entry
// opens it. Admin is the only fixed, non-type item and shows only to admins.

// The current codex's display name in the (Phase-4) switcher. No registry yet, so the id is the name.
function renderCodexSwitcher() {
  codexSwitcherLabel.textContent = state.currentCodexId;
}

function renderTypeNav() {
  const types = listTypes();
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
      </div>
    </div>`
    )
    .join('');

  wireTypeNav();
}

function wireTypeNav() {
  typeNav.querySelectorAll('[data-type-header]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentTab = btn.dataset.typeHeader;
      switchTab(state.currentTab);
    });
  });
  typeNav.querySelectorAll('.nav-entry').forEach((btn) => {
    btn.addEventListener('click', () => loadEntry(btn.dataset.type, btn.dataset.id));
  });
}

// Mark the active type (expanded) + entry, or Admin.
function highlightNav() {
  typeNav.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('is-active'));
  navAdmin.classList.remove('is-active');

  if (state.currentTab === 'admin') {
    navAdmin.classList.add('is-active');
    return;
  }
  const typeEl = typeNav.querySelector(`.nav-type[data-type="${CSS.escape(state.currentTab)}"]`);
  if (!typeEl) return;
  typeEl.classList.add('is-expanded');
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

// Reflect capabilities + read/edit mode + tab kind in the workspace chrome. Builder read = full-width
// reader; builder edit = full-width form; admin = editor + preview. Viewers (no canEdit) stay in read.
function applyMode() {
  const canEdit = !!state.caps.canEdit;
  const isBuilder = BUILDER_TABS.includes(state.currentTab);
  if (!canEdit || !isBuilder) state.mode = 'read';

  const editing = state.mode === 'edit';
  const kind = isBuilder ? 'builder' : 'admin';

  mainWorkspace.classList.remove('tab-builder', 'tab-admin', 'mode-read', 'mode-edit');
  mainWorkspace.classList.add(`tab-${kind}`, editing ? 'mode-edit' : 'mode-read');

  // Edit affordance sits in the reader header (read mode); Save/Done live in the form header (edit).
  editToggleBtn.hidden = !(canEdit && isBuilder && !editing);
  saveEntryBtn.hidden = !canEdit;

  // Admin is the only non-type nav item, admins only.
  navAdmin.hidden = !state.caps.canAdmin;
}

editToggleBtn.addEventListener('click', () => {
  if (!state.caps.canEdit) return;
  state.mode = 'edit';
  applyMode();
});

doneEditBtn.addEventListener('click', () => {
  state.mode = 'read';
  refreshBuilderPreview();
  applyMode();
});

saveEntryBtn.addEventListener('click', () => saveEntry());

navAdmin.addEventListener('click', () => {
  if (!state.caps.canAdmin) return;
  state.currentTab = 'admin';
  switchTab('admin');
});

// Switch to a type (loads its first entry) or the Admin section.
function switchTab(tabKey) {
  if (tabKey === 'admin') {
    enterAdminTab();
    applyMode();
    highlightNav();
    return;
  }

  const seed = SEED_BY_TYPE[tabKey] || [];
  state.formData = seed.length ? { ...seed[0] } : {};
  showRenderedPane();
  renderForm();
  applyMode();
  highlightNav();
}

// ── Admin section (admin-only) ──────────────────────────────────────────────
// Two panels: Users & Access (roster + codex init) and Types (the schema editor). Editors author
// entries against the schemas an admin defines here; only admins reach this section.

let adminUsersUnsub = null;
let adminPermsUnsub = null;

// True when the admin is on the Types panel — the schema editor is active.
function editingSchema() {
  return state.currentTab === 'admin' && state.adminPanel === 'types';
}

function enterAdminTab() {
  if (!state.caps.canAdmin) return switchTab('civilization'); // safety; nav item is also hidden
  readerTitle.textContent = 'Admin';
  editorTitle.textContent = 'Admin';
  showRenderedPane();
  ensureAdminSubscriptions();
  fetchCodexStatus();
  renderAdminPanel();
}

function renderAdminPanel() {
  if (state.adminPanel === 'types') {
    formContainer.innerHTML = renderAdminSubnav('types') + '<div id="admin-types-mount"></div>';
    wireAdminSubnav();
    setEditingType(state.editingType || 'civilization'); // renders the schema editor into the mount
  } else {
    formContainer.innerHTML =
      renderAdminSubnav('access') +
      renderAccessPanel({
        codexId: state.currentCodexId,
        initialized: state.codexInitialized,
        rows: buildRosterRows(),
      });
    wireAdminSubnav();
    wireAccessPanel();
    updateRenderedPreview('<div class="admin-blurb">Admin — manage codex access and type schemas.</div>');
    updateRawJson('');
  }
}

function wireAdminSubnav() {
  formContainer.querySelectorAll('[data-admin-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminPanel = btn.dataset.adminPanel;
      renderAdminPanel();
    });
  });
}

function wireAccessPanel() {
  formContainer.querySelector('#btn-init-codex')?.addEventListener('click', () => {
    window.seedCodex().then(() => fetchCodexStatus());
  });
  formContainer.querySelectorAll('[data-grant-uid]').forEach((btn) => {
    btn.addEventListener('click', () => grantRole(btn.dataset.grantUid, btn.dataset.grantRole));
  });
}

// Join the users roster with their permission for the current codex.
function buildRosterRows() {
  const adminEmail = (appConfig.auth.adminEmail || '').toLowerCase();
  const roleByUid = new Map(
    state.adminPerms.filter((p) => p.codexId === state.currentCodexId).map((p) => [p.uid, p.role])
  );
  return state.adminUsers.map((u) => ({
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    lastSeenAt: u.lastSeenAt,
    role: roleByUid.get(u.uid) || 'none',
    isAdmin: (u.email || '').toLowerCase() === adminEmail,
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
      if (state.currentTab === 'admin' && state.adminPanel === 'access') renderAdminPanel();
    });
  }
  if (!adminPermsUnsub) {
    adminPermsUnsub = state.fbManager.subscribePermissions((perms) => {
      state.adminPerms = perms;
      if (state.currentTab === 'admin' && state.adminPanel === 'access') renderAdminPanel();
    });
  }
}

async function fetchCodexStatus() {
  if (!(state.fbManager && state.fbManager.isConfigured())) { state.codexInitialized = false; return; }
  try {
    state.codexInitialized = !!(await state.fbManager.getCodexMeta(state.currentCodexId));
  } catch {
    state.codexInitialized = false;
  }
  if (state.currentTab === 'admin' && state.adminPanel === 'access') renderAdminPanel();
}

// ── Schema editor (lives inside the Admin › Types panel) ─────────────────────
// The editor holds a deep-cloned working schema. Structural edits rebuild the editor
// DOM; text edits don't (to keep input focus). Every change re-renders the live preview
// through the in-memory overlay. Nothing persists until Save; Reset returns to seed.

// Where the schema editor mounts: the Admin › Types sub-container when present, else the form panel.
function typesMountEl() {
  return document.getElementById('admin-types-mount') || formContainer;
}

// A representative entry to render the type's read-view preview against.
function sampleForType(type) {
  const list = SEED_BY_TYPE[type] || [];
  return list.length ? list[0] : {};
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
      return setEditingType(intent.type);
    case 'save':
      return saveWorkingSchema();
    case 'reset':
      return resetWorkingSchema();
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
  showToast(`Saved “${state.editingType}” type`);
}

function resetWorkingSchema() {
  resetSchema(state.editingType); // overlay -> seed + drop localStorage entry
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope.deleteSchema(state.editingType).catch((err) => showToast('Firebase reset error: ' + err.message));
  }
  state.editorErrors = [];
  state.workingSchema = structuredClone(getSchema(state.editingType)); // now the seed
  renderTypesEditor();
  showToast(`Reset “${state.editingType}” to default`);
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
  subscribeToLiveFirestoreDoc(state.currentTab, state.formData.id);
}

function renderFormWithoutResubscribe() {
  lastFocusedProseField = null;

  const title = entryTitle(state.formData, state.currentTab);
  readerTitle.textContent = title;
  editorTitle.textContent = title;

  const mediaBlock = MEDIA_TABS.includes(state.currentTab) ? renderMediaControls(state.formData) : '';
  formContainer.innerHTML = renderSchemaForm(getSchema(state.currentTab), state.formData, renderCtx) + mediaBlock;

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
      readerTitle.textContent = entryTitle(state.formData, state.currentTab);
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
  if (!MEDIA_TABS.includes(state.currentTab)) return;
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
  return JSON.stringify({ ...state.formData, type: state.currentTab }, null, 2);
}

// Whether the current entry has any content worth saving
function entryHasContent() {
  return Object.values(state.formData || {}).some((v) =>
    typeof v === 'string' ? v.trim() !== '' : v != null
  );
}

// Entry HTML + carousel composed after it (carousel is never part of the entry body)
function currentPreviewHTML() {
  return renderEntryHTML(state.currentTab, state.formData, renderCtx) + renderCarousel(state.formData.gallery);
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
  const entry = findSeedEntry(type, id);
  if (!entry) {
    showToast('Entry not found');
    return;
  }
  state.formData = { ...entry };
  state.currentTab = type;
  showRenderedPane();
  renderForm();
  applyMode();
  highlightNav();
  showToast(`Opened ${entryLabel(entry)}`);
}

function updateRawJson(jsonText) {
  // Editable only in the admin Types editor (the Raw JSON power tool). Builder entries no longer
  // surface Raw JSON in the content-edit path.
  previewRawTextarea.readOnly = !(state.caps.canEdit && editingSchema());
  // Never overwrite the textarea while the user is actively typing in it
  if (document.activeElement === previewRawTextarea) return;
  previewRawTextarea.value = jsonText;
  clearJsonError();
}

// Persist the current entry to Firebase — used by autosave-on-input and the form Save button.
function autoSaveToFirebase() {
  if (!state.caps.canEdit) return; // read-only users never write (rules also enforce)
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope.saveDoc(state.currentTab, state.formData.id || 'draft', state.formData);
  }
}

// Explicit per-entry Save (form header): persist, then return to the reader.
function saveEntry() {
  if (!state.caps.canEdit) {
    showToast('Read-only — you don’t have edit access.');
    return;
  }
  if (!entryHasContent()) {
    showToast('Nothing to save!');
    return;
  }
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope
      .saveDoc(state.currentTab, state.formData.id || 'entry', state.formData)
      .then(() => showToast('Saved entry'))
      .catch((err) => showToast('Save error: ' + err.message));
  } else {
    showToast('Saved locally');
  }
  state.mode = 'read';
  refreshBuilderPreview();
  applyMode();
  highlightNav();
}

// Apply a live edit from the Raw JSON editor (admin Types power tool) back into the schema.
function applyRawJsonEdit() {
  if (editingSchema()) return applySchemaRawJsonEdit();
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
  if (!editingSchema()) return;
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
