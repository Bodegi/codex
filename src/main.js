/**
 * Codex Studio — Main Application Bootstrap
 */

import { demoCodexId, demoCodexMeta, demoSchemas, demoEntriesByType } from './data/demoFixture.js';
import { renderEntryHTML } from './utils/entryRenderer.js';
import { renderTypeIndex, renderSummaryCard } from './utils/summaryCard.js';
import { FirebaseManager } from './utils/firebase.js';
import { AuthManager } from './utils/authManager.js';
import { appConfig, resolveFirebaseConfig, resolveSupabaseConfig } from './config/appConfig.js';

import { renderForm as renderSchemaForm } from './schema/formRenderer.js';
import {
  getSchema,
  setOverlaySchema,
  listTypes,
  listArchivedTypes,
  getAllSchemas,
  loadCodex,
  applyCodexSchemas,
  saveSchemaLocal,
  markSchemaSynced,
  resetSchema,
} from './schema/schemaStore.js';
import { indexEntries, activeEntries, archivedEntries, findEntry } from './schema/entryIndex.js';
import { buildCodexExport, exportFilename } from './schema/exportCodex.js';
import { switcherCodices, archivedCodices } from './schema/codexRegistry.js';
import { buildTemplateSchemas } from './schema/codexTemplate.js';
import { newId } from './utils/id.js';
import { blankEntry } from './schema/entryDraft.js';
import { validateSchema } from './schema/schemaValidate.js';
import { escapeHtml } from './schema/inlineText.js';
import { getIcon, findIcon, activeIcons, setOverlayIcons, bundledIcons, validateIcon } from './schema/iconRegistry.js';
import { sanitizeSvg } from './schema/sanitizeSvg.js';
import { buildNavModel } from './schema/navModel.js';
import { buildRoster } from './schema/rosterModel.js';
import {
  buildIconPanelModel,
  buildEmblemPanelModel,
  glyphDesignerParams,
  buildGlyphLibraryPool,
  glyphSaveTarget,
} from './schema/glyphAdminModel.js';
import {
  selectType,
  toRead,
  toEdit,
  toSchemaAdmin,
  toIndex,
  openGlobalAdmin,
  selectAdminPanel,
  closeGlobalAdmin,
  openSearch,
  normalize,
} from './schema/viewState.js';
import { buildSearchDocs, searchEntries } from './schema/searchIndex.js';
import { referencesTo, dependentsWarning } from './schema/referenceIndex.js';
import {
  renderSchemaEditor,
  attachSchemaEditor,
  updateErrorBanner,
  deriveKey,
  allFieldKeys,
  addField,
  removeField,
  updateField,
  updateFieldLabel,
  stripProvisional,
  updateFieldAssociation,
  updateSummaryCard,
  summaryCardBlock,
  setTitleField,
  repointTitleField,
  moveField,
  moveFieldTo,
  newTypeSchema,
} from './components/schemaEditor.js';
import { openComponentPalette } from './components/componentPalette.js';
import { cloneStarterSchemas } from './schema/starterTypes.js';
import { renderAuthGateway } from './components/authGateway.js';
import { renderAwaitingAccess, renderInviteRequired } from './components/awaitingAccess.js';
import {
  renderInvitesPanel,
  renderInviteRows,
  renderAccessPanel,
  renderRosterRows,
  renderCodicesPanel,
  renderImagesPanel,
  renderImageCards,
  renderIconsPanel,
  renderEmblemsPanel,
} from './components/adminView.js';
import { filterRows } from './utils/filterRows.js';
import { parseInviteToken, buildInviteUrl } from './utils/inviteLink.js';
import { buildInviteRows, countPendingGrants } from './schema/inviteModel.js';
import { openGlyphDesigner, openLibraryPicker } from './components/glyphDesigner.js';
import { resolveCapabilities, isAdminEmail, roleBadge } from './utils/capabilities.js';
import { syncBadge } from './utils/syncBadge.js';
import { getKind, previewSample } from './schema/fieldKinds.js';
import { initCarousel } from './components/carousel.js';
import { initMapReadCanvases } from './components/mapComponent.js';
import { createImageIndex, publicUrl } from './schema/imageIndex.js';
import { createImageStore } from './utils/imageStore.js';
import { uploadImage, labelFromFilename, validateImageFile } from './schema/imageUpload.js';
import { optimizeImage } from './utils/imageOptimize.js';
import { attachLightbox } from './components/lightbox.js';
import { openConfirm } from './components/confirmModal.js';
import { openConflictModal } from './components/conflictModal.js';
import { openHistoryModal } from './components/historyModal.js';
import * as safeStorage from './utils/safeStorage.js';

// localStorage key persisting the active codex across reloads.
const CURRENT_CODEX_KEY = 'codex_current_id';

// Firebase config resolved once; presence drives configured vs. local-only mode. Read via safeStorage:
// a raw localStorage access here throws (and blank-screens the whole app) in Safari private mode /
// disabled-storage contexts — see safeStorage.js.
const firebaseConfig = resolveFirebaseConfig(appConfig.firebase, safeStorage.getItem('codex_firebase_override'));

// Supabase (image bytes) resolved once, off the same override sentinel. null in local-only mode, so the
// image index stays empty and every id resolves to the not-found SVG (images need Firebase).
const supabaseConfig = resolveSupabaseConfig(appConfig.supabase, safeStorage.getItem('codex_firebase_override'));

// The codex shown first: a configured build uses the baked default if the deployer set one, else
// starts with no codex (null) and adopts the first one the registry returns — never a hardcoded
// slug that may name no real codex (issue #26 F3). Local-only mode is the single demo-fixture codex.
const DEFAULT_CODEX_ID = firebaseConfig ? (appConfig.defaultCodexId || null) : demoCodexId;

// Application State
const state = {
  // The single source of truth for what's on screen (see schema/viewState.js): a per-type content
  // surface ({kind:'type', type, mode:'read'|'edit'|'admin'}) or the global-admin door
  // ({kind:'global-admin', panel:'access'|'codices'}). `type` is null only in the empty-content case
  // (a codex with no types). normalize() clamps it to a valid, permitted view once schemas + caps load.
  view: { kind: 'type', type: null, mode: 'read' },
  formData: {},
  // Which sidebar type-sections are expanded — independent of the current selection, so an opened
  // section can be collapsed and stay collapsed across re-renders.
  navExpanded: new Set(),
  // The active codex. Every Firestore access is codex-scoped; the switcher re-scopes on change.
  currentCodexId: safeStorage.getItem(CURRENT_CODEX_KEY) || DEFAULT_CODEX_ID,
  firebaseConfig,
  fbManager: null,
  authManager: null,
  // Explicit-save write path: `dirty` = unsaved form edits; `baseVersion` = the entry version this
  // edit started from (the form-Save transaction's conflict guard compares against it).
  dirty: false,
  baseVersion: 0,
  // The current codex's live entries grouped by type (replaces the bundled SEED_BY_TYPE).
  entryIndex: {},
  // The current codex's live image index (id → URL), rebuilt from subscribeImagesForCodex. Empty until
  // the first snapshot (and always empty in local-only mode). resolve(id) → URL or null (not-found SVG).
  imageIndex: createImageIndex([], supabaseConfig),
  // Codex registry: the meta docs the viewer may switch between, and (non-admin) their own grants.
  codices: [],
  ownPermissions: [],
  // Access control (Phase 2): the current user's capabilities on the current codex, their own
  // permission doc, and whether that doc has loaded yet (to avoid flashing awaiting-access on boot).
  caps: { isAuthed: false, role: 'none', canRead: false, canEdit: false, canAdmin: false },
  permission: null,
  permissionLoaded: false,
  // Live-sync health for the header badge + connection banner (both read this one value, so they can't
  // disagree). 'healthy' until a codex-content subscription errors; 'lost' on a dropped connection,
  // 'access-changed' on permission-denied. A good snapshot resets it. Only meaningful in cloud mode.
  connection: 'healthy',
  workspaceReady: false,
  // Schema editor (per-type Structure mode) working state
  editingType: '',
  workingSchema: null,
  editorErrors: [],
  // Field cards in the Structure editor collapse to a header until opened; this holds the keys of the
  // currently-expanded cards so the state survives the wholesale re-renders (add/remove/move/kind).
  expandedFields: new Set(),
  // The same for the content (entry) form's collapsible cards. Kept so a card stays open across the
  // mid-edit re-renders hero/gallery trigger on image-pick; cleared when a fresh entry is opened.
  expandedContentFields: new Set(),
  // Whether the Structure-mode live preview pane is showing (hidden by default so the editor is
  // full-width). Preview reveals it rendered; Edit JSON reveals it raw. Reset on each Structure entry.
  structurePreview: null, // null = hidden, 'rendered' | 'raw' = shown in that mode
  // A brand-new type in flight: its id while the builder holds an in-memory draft that hasn't been
  // Saved. It lives only in the store overlay (never localStorage/Firestore) so an abandoned draft
  // leaves no orphan — mirrors the entry flow (blank draft, persist on Save). `typeDraftDirty` gates
  // the discard warning: an untouched draft leaves silently, an edited one confirms first.
  newTypeDraft: null,
  typeDraftDirty: false,
  // Global-admin roster state
  adminUsers: [],
  adminPerms: [],
  // Invite gate: the token carried by a ?invite= link (captured at boot, held through the sign-in
  // popup), the block reason if a signed-in account wasn't invited (drives the invite-required
  // screen), and the admin's live invites list.
  pendingInviteToken: null,
  inviteBlocked: null,
  adminInvites: [],
  // Global-admin Images gallery: every image record, all statuses (subscribeAllImages).
  adminImages: [],
  // Per-panel client-side filter query (#6). The whole collection is already in memory; these narrow
  // the rows before they reach the builder. Not a read-cost fix — pagination is the deferred half.
  adminFilters: { images: '', access: '', invites: '' },
  // App-global icon overlay: every icon record, all statuses (subscribeIcons). Active ones are
  // pushed into iconRegistry via setOverlayIcons; the admin Icons panel reads the full list.
  icons: [],
  // App-global emblem set: every emblem record, all statuses (subscribeEmblems). No bundled
  // baseline — rendered straight from here (Emblems panel + map glyph resolution).
  emblems: []
};

// ── View-state helpers ───────────────────────────────────────────────────────
// The single source of truth is state.view; these read it, and goto()/renderView() write it.
const curType = () => (state.view.kind === 'type' ? state.view.type : null);
const inGlobalAdmin = () => state.view.kind === 'global-admin';
const inSchemaAdmin = () => state.view.kind === 'type' && state.view.mode === 'admin';
// The context normalize() clamps against: current capabilities + the codex's live type keys.
const viewCtx = () => ({ caps: state.caps, types: listTypes() });
// Apply a view transition, clamp it, and re-render the whole workspace to match.
// True when a view is the in-flight type draft's own Structure surface — the one place the draft
// is allowed to live. Any other target means we're leaving it.
const isTypeDraftView = (v) =>
  !!state.newTypeDraft && v && v.kind === 'type' && v.type === state.newTypeDraft && v.mode === 'admin';

// Drop an unsaved new-type draft: it only ever sat in the store overlay (in-memory), so clearing
// it un-persists nothing. Idempotent. The main leave-paths route through confirmDiscardIfDirty
// (which purges on proceed); this is the safety net for the few that reach goto directly.
function discardTypeDraft() {
  if (!state.newTypeDraft) return;
  setOverlaySchema(state.newTypeDraft, null);
  state.newTypeDraft = null;
  state.typeDraftDirty = false;
}

function goto(nextView) {
  if (!isTypeDraftView(nextView)) discardTypeDraft();
  state.view = normalize(nextView, viewCtx());
  renderView();
}

// Explicit-save guard: leaving an entry mid-edit with unsaved changes must confirm first (there's no
// autosave to fall back on). Returns true when it's safe to proceed — not editing, nothing dirty, or the
// user chose to discard. Wraps the user-initiated edit-exit paths (Done, nav, codex switch, admin).
async function confirmDiscardIfDirty() {
  const editingEntry = state.view.kind === 'type' && state.view.mode === 'edit' && state.dirty;
  // A new-type draft the author has touched — leaving discards it (it never persisted). An untouched
  // draft (typeDraftDirty false) skips the prompt but is still purged below, like a blank new entry.
  const draftingType = !!state.newTypeDraft && state.typeDraftDirty;
  if (!editingEntry && !draftingType) {
    discardTypeDraft(); // clean up an untouched draft on the way out
    return true;
  }
  const ok = await openConfirm({
    title: draftingType ? 'Discard new type?' : 'Discard unsaved changes?',
    message: draftingType
      ? 'This new type hasn’t been saved yet — leaving will discard it.'
      : 'Your unsaved edits to this entry will be lost.',
    confirmLabel: 'Discard',
  });
  if (ok) {
    state.dirty = false;
    discardTypeDraft();
  }
  return ok;
}

// Initialize Firebase + Google Auth. Auth needs an initialized Firebase app, so the auth manager
// only exists when Firebase is configured; local-only mode runs unauthenticated (no login wall).
if (state.firebaseConfig) {
  state.fbManager = new FirebaseManager(state.firebaseConfig);
  state.authManager = new AuthManager(state.fbManager.app);
}

// The active codex's Firestore scope (entries / schemas under codices/${id}/…), or null in
// local-only mode. Every Firestore read/write goes through this so nothing is hardwired to one codex.
function codexScope() {
  // No current codex (the pre-registry / no-codices neutral state) has no scope — callers no-op.
  return state.fbManager && state.currentCodexId ? state.fbManager.codex(state.currentCodexId) : null;
}

// ── Image byte store + upload/remove (editor path) ───────────────────────────
// The Supabase byte adapter. Its token port yields the current Firebase ID token so Supabase trusts
// our project's JWTs — `authManager.auth.currentUser` is the raw Firebase user (getIdToken),
// distinct from `authManager.currentUser` (the mapped profile). Null store in local-only mode → the
// upload UI stays hidden, so the coordinator never sees a null store.
const imageStore = createImageStore(supabaseConfig, () =>
  state.authManager?.auth?.currentUser?.getIdToken() ?? Promise.resolve(null)
);

// Firestore image-metadata port for the upload coordinator (bytes-first, then metadata — see imageUpload.js).
const imageMetaPort = state.fbManager
  ? {
      getImage: (id) => state.fbManager.getImage(id),
      createImage: (id, data) => state.fbManager.createImage(id, data),
      addImageToCodex: (id, codexId) => state.fbManager.addImageToCodex(id, codexId),
      setImageStatus: (id, status) => state.fbManager.setImageStatus(id, status),
    }
  : null;

// Editor upload: read the file to bytes, run the dedup/resurrect/create coordinator into the current
// codex, and return the new image as a { id, label, url } descriptor. The single-file flow resolves
// the picker with `id`; multi-file/drag uploads use `label`/`url` to append a live thumb (the id's
// public URL is deterministic, so the thumb shows before the subscription refreshes the index). Any
// failure propagates to the picker's inline error.
async function uploadImageToCurrentCodex(file) {
  if (!imageStore || !imageMetaPort) throw new Error('Image upload needs cloud mode.');
  // Backstop the picker's own gate (defense in depth): reject unsupported/oversize files before we read
  // the bytes. The picker surfaces the thrown message inline.
  const problem = validateImageFile({ type: file.type, size: file.size });
  if (problem) throw new Error(problem);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await uploadImage(
    {
      bytes,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      codexId: state.currentCodexId,
      uid: state.authManager?.currentUser?.uid || '',
    },
    // compress runs only on a dedup miss; it downscales + WebP-encodes the source, falling back to
    // the raw bytes when that isn't a win. The id above is already hashed from the source bytes.
    { storage: imageStore, meta: imageMetaPort, compress: () => optimizeImage(file) }
  );
  return { id, label: labelFromFilename(file.name), url: publicUrl(supabaseConfig, id) };
}

// Editor remove-from-codex: confirm (destructive), then drop the current codex from the image's
// membership; other codices are untouched. Returns whether it was removed (the picker pulls the thumb).
async function removeImageFromCurrentCodex(id) {
  if (!state.fbManager) return false;
  const ok = await openConfirm({
    title: 'Remove image from this codex?',
    message: 'It stays available in any other codex it belongs to, and an admin can restore it.',
    confirmLabel: 'Remove',
  });
  if (!ok) return false;
  await state.fbManager.removeImageFromCodex(id, state.currentCodexId);
  return true;
}

// ── Codex content: schemas + entries for the active codex ────────────────────
// The store + entry index are (re)loaded per codex. In configured mode a Firestore subscription
// keeps both live; in local-only mode the demo fixture is the single codex's content. The Firestore
// subscriptions are deferred to showWorkspace() so no read fires before the user has read access.
let schemaUnsubscribe = null;
let entriesUnsubscribe = null;
let imagesUnsubscribe = null;

function subscribeCodexContent() {
  const scope = codexScope();
  if (!(scope && scope.isConfigured())) return;

  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  schemaUnsubscribe = scope.subscribeSchemas((schemas) => {
    markSyncHealthy(); // a live snapshot means sync is healthy again
    applyCodexSchemas(schemas);
    onCodexContentChanged();
  }, handleContentSubscriptionError);

  if (entriesUnsubscribe) { entriesUnsubscribe(); entriesUnsubscribe = null; }
  entriesUnsubscribe = scope.subscribeEntries((entries) => {
    markSyncHealthy();
    state.entryIndex = indexEntries(entries);
    onCodexContentChanged();
  }, handleContentSubscriptionError);

  // The codex's image library (the runtime replacement for the build-time pool): rebuild the in-memory
  // index on every snapshot, then re-render so images that were showing not-found resolve, and removed
  // ones fall back to the not-found SVG. subscribeImagesForCodex already filters to active records.
  if (imagesUnsubscribe) { imagesUnsubscribe(); imagesUnsubscribe = null; }
  imagesUnsubscribe = state.fbManager.subscribeImagesForCodex(state.currentCodexId, (records) => {
    state.imageIndex = createImageIndex(records, supabaseConfig);
    onImagesChanged();
  }, handleContentSubscriptionError);
}

// Re-render nav + selection when the codex's live types/entries change.
function onCodexContentChanged() {
  if (!state.workspaceReady) return;
  renderNav();
  ensureValidView();
}

// Re-render the current content view when the codex's images change, so hero / carousel / inline / thumbs
// pick up new URLs (or the not-found SVG). Skipped in global-admin, whose panels render no codex images.
function onImagesChanged() {
  if (!state.workspaceReady || inGlobalAdmin()) return;
  renderView();
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
  // Reset the image index on boot + every codex switch; the subscription refills it in configured mode.
  state.imageIndex = createImageIndex([], supabaseConfig);
}
loadCodexContent();

// Cross-entry lookup for the nav + reference fields, backed by the live entry index.
const entryLabel = (e) => {
  const schema = getSchema(e.type);
  return (schema && e[schema.titleField]) || e.name || e.title || e.id;
};
const entriesOfType = (type) =>
  activeEntries(state.entryIndex, type, entryLabel).map((e) => ({ id: e.id, label: entryLabel(e) }));
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
  resolveImage: (id) => state.imageIndex.resolve(id),
  listEntries: (type) => entriesOfType(type),
  resolveRef: (type, id) => {
    const entry = findEntryByTypeId(type, id);
    // `emblem` feeds the map's glyph-inheritance step: a marker linked to an
    // entry inherits that entry's emblem as a default glyph. No entry carries an `emblem` field yet
    // (the emblem editor isn't built), so this is a forward seam that reads `undefined` today.
    return entry
      ? { label: entryLabel(entry), exists: true, emblem: entry.emblem }
      : { label: id, exists: false };
  },
  // Glyph resolution for map markers. Resolves a glyph key to SVG markup,
  // consulting the emblems collection first (full-color, the intended fit) then icons (monochrome
  // `currentColor` fallback). Returns `null` — not a default glyph — when neither has the key, so the
  // marker's fallback chain drops to its palette dot.
  resolveGlyph: (key) => {
    if (!key) return null;
    const emblem = state.emblems.find((e) => e && e.key === key && e.svg && e.status !== 'archived');
    return emblem ? emblem.svg : findIcon(key);
  },
  // The pickable-glyph pool for the map inspector: emblems first, then icons.
  listGlyphs: () => [...activeEmblems(), ...activeIcons().map((e) => ({ key: e.key, svg: e.svg }))],
};

// DOM References
const formContainer = document.getElementById('form-container');
const previewRendered = document.getElementById('preview-content-rendered');
const previewRawTextarea = document.getElementById('raw-json-textarea');
const previewRawContainer = document.getElementById('preview-content-raw');
const jsonErrorEl = document.getElementById('json-error');
const toastContainer = document.getElementById('toast-container');
const userProfileBadge = document.getElementById('user-profile-badge');
const gatewayContainer = document.getElementById('gateway-container');
const mainWorkspace = document.getElementById('main-workspace');
const appBody = document.querySelector('.app-body');
const appContainer = document.getElementById('app');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const editToggleBtn = document.getElementById('btn-edit-toggle');
const structureBtn = document.getElementById('btn-structure');
const closePreviewBtn = document.getElementById('btn-close-preview');
const saveEntryBtn = document.getElementById('btn-save-entry');
const historyEntryBtn = document.getElementById('btn-history-entry');
const archiveEntryBtn = document.getElementById('btn-archive-entry');
const deleteEntryBtn = document.getElementById('btn-delete-entry');
const doneEditBtn = document.getElementById('btn-done-edit');
const readerTitle = document.getElementById('reader-title');
const editorTitle = document.getElementById('editor-title');

// The reader/editor header for an OPEN ENTRY is a breadcrumb "Type › Entry" rather than the bare
// entry title, which duplicated the rendered H1 (issue #30 F11). The Type segment links up to that
// type's index (the list of sibling entries); the entry name is the current context. Set on both
// #reader-title (read) and #editor-title (edit), so in edit mode the up-link doubles as the
// discoverable "Back" of #29. Other header states (admin, search, a type index) stay a plain label.
function setEntryCrumb(type, title) {
  const schema = getSchema(type);
  const typeLabel = (schema && schema.label) || type;
  // a11y: the muted parent is a real navigation control, so name its destination (a title tooltip
  // for sighted users + it reads on the button for AT); the entry segment is the current location
  // (aria-current="page", the breadcrumb convention); the ›  glyph is decorative (aria-hidden).
  const html =
    `<button type="button" class="crumb-parent" data-crumb-type="${escapeHtml(type)}" title="All ${escapeHtml(
      typeLabel
    )} entries">${escapeHtml(typeLabel)}</button>` +
    `<span class="crumb-sep" aria-hidden="true">›</span>` +
    `<span class="crumb-current" aria-current="page">${escapeHtml(title)}</span>`;
  readerTitle.innerHTML = html;
  editorTitle.innerHTML = html;
}
const typeNav = document.getElementById('type-nav');
const navSearch = document.getElementById('nav-search');
const codexSwitcher = document.getElementById('codex-switcher');
const codexSwitcherLabel = document.getElementById('codex-switcher-label');
const roleBadgeEl = document.getElementById('role-badge');

// ── Auth + access control (Phase 2) ─────────────────────────────────────────
// Boot flow: on every auth change we upsert the user into the roster, (re)subscribe to their own
// permission doc for the current codex, recompute capabilities, and render one of four screens
// (gateway / loading / awaiting-access / workspace). Codex-content subscriptions are deferred until
// read access is confirmed, so a no-access user never issues a denied Firestore read.

function initAuth() {
  // Capture an ?invite= token before anything else and strip it from the URL (cosmetic: avoids a
  // stale link being re-shared or re-triggering). Held in memory across the Google sign-in popup.
  state.pendingInviteToken = parseInviteToken(location.search);
  if (state.pendingInviteToken) {
    const url = new URL(location.href);
    url.searchParams.delete('invite');
    history.replaceState(null, '', url);
  }
  // Synchronous initial paint: gated + unresolved defaults to the gateway (no workspace flash);
  // local-only mode resolves straight to the open workspace.
  recomputeCaps();
  renderUserBadge();
  renderAppState();
  if (state.authManager) {
    state.authManager.onChange(onAuthChanged);
    maybeDevSignIn();
  }
}

// Dev-only: if a custom token is staged in localStorage (minted by scripts/dev-mint-token.mjs), exchange
// it for a session so an automated browser can sign in as a real user without the Google popup. Single-use
// — the key is cleared after reading; Firebase then persists the session normally across reloads. Inert for
// every real user (no such key is ever set in production).
function maybeDevSignIn() {
  const token = safeStorage.getItem('codex_dev_custom_token');
  if (!token) return;
  safeStorage.removeItem('codex_dev_custom_token');
  state.authManager.loginWithCustomToken(token).catch((err) => {
    console.error('dev custom-token sign-in failed', err);
    showToast('Dev sign-in failed: ' + err.message);
  });
}

function onAuthChanged() {
  const user = state.authManager?.currentUser || null;
  renderUserBadge();
  recomputeCaps();  // establishes canAdmin (email-based) so the upsert can bypass the invite gate for admins
  if (user) {
    // The upsert enforces the invite gate: a new non-admin without a live invite is BLOCKED (no row
    // written). We surface that as the invite-required screen once the decision resolves.
    state.fbManager
      ?.upsertUser(user, { isAdmin: !!state.caps.canAdmin, pendingToken: state.pendingInviteToken })
      .then((decision) => {
        const blocked = decision && decision.action === 'blocked' ? decision.reason : null;
        if (blocked !== state.inviteBlocked) {
          state.inviteBlocked = blocked;
          renderAppState();
        }
      })
      .catch((err) => console.warn('user upsert failed', err));
  } else {
    state.inviteBlocked = null;
  }
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
  if (!(user && state.currentCodexId && state.fbManager && state.fbManager.isConfigured())) return;
  permissionUnsub = state.fbManager.subscribePermission(
    user.uid,
    state.currentCodexId,
    (perm) => {
      state.permission = perm;
      state.permissionLoaded = true;
      recomputeCaps();
      renderAppState();
    },
    (err) => {
      // If the permission read fails, don't hang on the "Checking access…" spinner forever — resolve as
      // no-access so the user lands on the awaiting-access screen (a real denial looks the same to them).
      console.error('permission subscription error', err);
      state.permission = null;
      state.permissionLoaded = true;
      recomputeCaps();
      renderAppState();
    }
  );
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
  // Not invited (no roster row was created) → a private-site wall, not the awaiting-access queue.
  if (state.inviteBlocked) return showInviteRequired();
  // Admin is authorized by email — no need to wait for a permission doc. Everyone else waits for the
  // first snapshot so a real viewer/editor never flashes the awaiting-access screen on boot.
  if (!caps.canAdmin && !state.permissionLoaded) return showLoading();
  if (caps.canRead) return showWorkspace();
  return showAwaitingAccess();
}

function showOverlay(html) {
  teardownWorkspace();
  appBody.classList.add('hidden');   // hides the sidebar + workspace together
  appContainer.classList.remove('is-authed'); // drop the mobile drawer affordance while gated
  closeSidebar();
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

function showInviteRequired() {
  showOverlay(renderInviteRequired(state.authManager.currentUser));
  document.getElementById('invite-required-logout-btn')?.addEventListener('click', () => {
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

// The dedicated error screen — the place to land when the app hits a wall it can't recover from in
// place (a fatal boot failure). A last resort, not the everyday path: transient/subscription failures
// use the connection banner (recoverable, keeps the workspace) and stray rejections use a toast. Reuses
// the one overlay mechanism, so it tears the workspace down cleanly. Message is escaped (may carry an
// error string).
function showError(message) {
  showOverlay(`
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:80vh; text-align:center; padding:24px;">
      <div style="font-size:56px; margin-bottom:12px;">⚠️</div>
      <h1 style="font-family:var(--font-heading); color:var(--accent-gold); font-size:26px; margin-bottom:8px;">Something went wrong</h1>
      <p style="font-size:14px; color:var(--text-muted); max-width:480px; margin-bottom:24px;">
        ${escapeHtml(message || 'The app hit an unexpected error. Reloading usually fixes it.')}
      </p>
      <button id="error-reload-btn" class="btn btn-primary">Reload</button>
    </div>
  `);
  document.getElementById('error-reload-btn')?.addEventListener('click', () => location.reload());
}

// The in-workspace "connection lost / access changed" bar. Unlike
// showError it does NOT tear the workspace down — the last-loaded content stays readable — it just
// signals that live sync stopped and offers a reload. Injected once, then toggled; a successful
// snapshot hides it again (see subscribeCodexContent), so a self-healing reconnect clears it.
let connectionBanner = null;
function showConnectionBanner(message) {
  if (!connectionBanner) {
    connectionBanner = document.createElement('div');
    connectionBanner.setAttribute('role', 'alert');
    connectionBanner.style.cssText =
      'position:fixed; top:0; left:0; right:0; z-index:1000; display:flex; align-items:center; justify-content:center; gap:12px;' +
      'padding:8px 16px; font-size:13px; background:#7f1d1d; color:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.4);';
    const msg = document.createElement('span');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm';
    btn.textContent = 'Reload';
    btn.addEventListener('click', () => location.reload());
    connectionBanner.append(msg, btn);
    connectionBanner._msg = msg;
    document.body.prepend(connectionBanner);
  }
  connectionBanner._msg.textContent = message;
  connectionBanner.style.display = 'flex';
}
function hideConnectionBanner() {
  if (connectionBanner) connectionBanner.style.display = 'none';
}

// A good snapshot arrived: clear any degraded state so the badge + banner both return to healthy.
function markSyncHealthy() {
  if (state.connection !== 'healthy') {
    state.connection = 'healthy';
    renderSyncStatus();
  }
  hideConnectionBanner();
}

// A live codex-content subscription errored (permission-denied after an access change, or a dropped
// connection). The workspace keeps the last-loaded data; `state.connection` drives both the header
// badge (glanceable) and the banner (explains + offers Reload), so they can't disagree.
function handleContentSubscriptionError(err) {
  console.error('Codex subscription error', err);
  const accessChanged = err?.code === 'permission-denied';
  state.connection = accessChanged ? 'access-changed' : 'lost';
  renderSyncStatus();
  showConnectionBanner(
    accessChanged
      ? 'Your access to this codex changed. Reload to continue.'
      : 'Connection lost — showing the last loaded data. Reload to reconnect.'
  );
}

// A non-critical subscription errored (codex registry, admin roster, global icon/emblem overlays).
// These degrade gracefully — the last-loaded data stays usable — so they get a quiet toast, not the
// full connection banner. `what` names the surface for the log + message.
function subError(what) {
  return (err) => {
    console.error(`${what} subscription error`, err);
    showToast(`Couldn’t sync ${what}. Reload if it persists.`);
  };
}

function showWorkspace() {
  gatewayContainer.classList.add('hidden');
  appBody.classList.remove('hidden');
  appContainer.classList.add('is-authed'); // reveal the mobile drawer toggle
  mainWorkspace.classList.remove('hidden');
  if (!state.workspaceReady) {
    state.workspaceReady = true;
    subscribeCodexRegistry();      // populate the switcher (app-global, not codex-scoped)
    subscribeIconOverlay();        // app-global icon overlay (nav renders it for every user)
    subscribeEmblemOverlay();      // app-global emblem set (content + map markers resolve it)
    subscribeCodexContent();       // deferred schema + entry subscriptions (now that canRead is true)
    renderCodexSwitcher();
    state.view = normalize(state.view, viewCtx());
    renderView();                  // renders the sidebar nav + picks the first type (or empty/admin)
    renderSyncStatus();
  } else {
    // Already up: capabilities may have just changed (permission arrived) — re-clamp + reflect chrome.
    state.view = normalize(state.view, viewCtx());
    renderRoleBadge();
    applyViewChrome();
  }
}

// Tear down codex-content subscriptions + the one-time workspace init, so re-auth re-initializes.
function teardownWorkspace() {
  state.workspaceReady = false;
  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  if (entriesUnsubscribe) { entriesUnsubscribe(); entriesUnsubscribe = null; }
  if (imagesUnsubscribe) { imagesUnsubscribe(); imagesUnsubscribe = null; }
  if (codicesUnsub) { codicesUnsub(); codicesUnsub = null; }
  if (ownPermsUnsub) { ownPermsUnsub(); ownPermsUnsub = null; }
  if (iconsUnsub) { iconsUnsub(); iconsUnsub = null; }
  if (emblemsUnsub) { emblemsUnsub(); emblemsUnsub = null; }
  state.emblems = []; // drop the set so a re-auth starts clean
  setOverlayIcons([]); // drop the overlay so a re-auth starts from the bundled baseline
  if (adminUsersUnsub) { adminUsersUnsub(); adminUsersUnsub = null; }
  if (adminPermsUnsub) { adminPermsUnsub(); adminPermsUnsub = null; }
  if (adminInvitesUnsub) { adminInvitesUnsub(); adminInvitesUnsub = null; }
  if (adminImagesUnsub) { adminImagesUnsub(); adminImagesUnsub = null; }
}

// Enter the global-admin door (from the header user menu). Keeps the last panel if already there.
async function enterAdmin() {
  if (!state.caps.canAdmin) return;
  if (!(await confirmDiscardIfDirty())) return;
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
let iconsUnsub = null;
let emblemsUnsub = null;

// The codices to show in the switcher, per the pure registry rules.
function visibleCodices() {
  if (!state.firebaseConfig) return [demoCodexMeta];
  const uid = state.authManager?.currentUser?.uid || '';
  return switcherCodices(state.codices, state.ownPermissions, { isAdmin: !!state.caps.canAdmin, uid });
}

// Once the registry loads, a current codex id that names no visible codex — a purged slug, a stale
// stored id, or the null first-run seed — would strand the app on a phantom. Adopt the first codex the
// user can actually see; with none, stay in the neutral no-codex state (the switcher shows a prompt).
// A no-op when the current id already resolves, so it's safe to call on every registry snapshot.
function reconcileCurrentCodex() {
  const list = visibleCodices();
  if (state.currentCodexId && list.some((c) => c.codexId === state.currentCodexId)) return;
  const next = list[0]?.codexId;
  if (next) {
    switchCodex(next); // full re-scope; its watchOwnPermission resolves the access state
    return;
  }
  // No codex to adopt (a signed-in user with no grants). Nothing will subscribe a per-codex
  // permission doc, so resolve the access state here — otherwise a non-admin hangs on the
  // "Checking access…" loader (renderAppState gates on permissionLoaded) instead of landing on
  // the awaiting-access screen. An admin is authorized by email and is unaffected.
  state.permissionLoaded = true;
  recomputeCaps();
  renderAppState();
}

/** The current codex's human name, falling back to its id only when the meta is unnamed/unknown. */
function currentCodexName() {
  const meta = state.codices.find((c) => c.codexId === state.currentCodexId);
  return (meta && meta.name) || state.currentCodexId;
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
        reconcileCurrentCodex();
        renderCodexSwitcher();
        if (inGlobalAdmin() && state.view.panel === 'codices') renderAdminPanel();
      }, subError('codices'));
    }
  } else if (uid && !ownPermsUnsub) {
    ownPermsUnsub = state.fbManager.subscribeOwnPermissions(uid, async (perms) => {
      state.ownPermissions = perms;
      const metas = await Promise.all(
        perms.map((p) => state.fbManager.getCodexMeta(p.codexId).then((m) => (m ? { ...m, codexId: p.codexId } : null)))
      );
      state.codices = metas.filter(Boolean);
      reconcileCurrentCodex();
      renderCodexSwitcher();
    }, subError('your codices'));
  }
}

// App-global icon overlay: one subscription for the whole session (icons are readable by any
// signed-in user — the nav renders them). Each snapshot installs the active icons into the
// registry so getIcon reflects them everywhere, and refreshes the nav + the Icons admin panel.
// Inert in local-only mode (subscribeIcons no-ops without Firebase).
function subscribeIconOverlay() {
  if (iconsUnsub || !(state.fbManager && state.fbManager.isConfigured())) return;
  iconsUnsub = state.fbManager.subscribeIcons((icons) => {
    // Sanitize admin-authored SVG at the ingestion choke point: every downstream sink — nav
    // `getIcon`, the overlay registry, the admin panel — reads from state.icons, so cleaning once
    // here covers them all. Bundled icons and designer output are already clean (a no-op).
    state.icons = icons.map((i) => (i && i.svg ? { ...i, svg: sanitizeSvg(i.svg) } : i));
    const active = state.icons
      .filter((i) => i && i.key && i.svg && i.status !== 'archived')
      .map((i) => ({ key: i.key, svg: i.svg }));
    setOverlayIcons(active);
    renderNav(); // type icons pick up the overlay live
    if (inGlobalAdmin() && state.view.panel === 'icons') renderAdminPanel();
  }, subError('icons'));
}

// App-global emblem set: full-color glyphs, readable by any signed-in user (content + map markers
// render them). No bundled baseline and no registry merge — state.emblems is the whole story; the
// map glyph resolver and the Emblems admin panel read it directly. Inert in local-only mode.
function subscribeEmblemOverlay() {
  if (emblemsUnsub || !(state.fbManager && state.fbManager.isConfigured())) return;
  emblemsUnsub = state.fbManager.subscribeEmblems((emblems) => {
    // Sanitize at ingestion — resolveGlyph, the map, and the Emblems panel all read state.emblems.
    state.emblems = emblems.map((e) => (e && e.svg ? { ...e, svg: sanitizeSvg(e.svg) } : e));
    renderNav(); // markers/content that resolve an emblem pick it up live
    if (inGlobalAdmin() && state.view.panel === 'emblems') renderAdminPanel();
  }, subError('emblems'));
}

/** Active (non-archived) emblems as `[{ key, svg }]` — the pool the map glyph resolver consults. */
function activeEmblems() {
  return state.emblems.filter((e) => e && e.key && e.svg && e.status !== 'archived').map((e) => ({ key: e.key, svg: e.svg }));
}

// Paint the non-admin role signal (#22) under the switcher. roleBadge() decides who sees one
// (editors/viewers only), so this just reflects its verdict — hidden when it returns null.
function renderRoleBadge() {
  if (!roleBadgeEl) return;
  const badge = roleBadge(state.caps);
  if (!badge) {
    roleBadgeEl.hidden = true;
    roleBadgeEl.innerHTML = '';
    return;
  }
  roleBadgeEl.hidden = false;
  roleBadgeEl.dataset.role = badge.role;
  roleBadgeEl.innerHTML =
    `<span class="role-badge-label">${escapeHtml(badge.label)}</span>` +
    `<span class="role-badge-blurb">${escapeHtml(badge.blurb)}</span>`;
}

function renderCodexSwitcher() {
  renderRoleBadge();
  const list = visibleCodices();
  const current = list.find((c) => c.codexId === state.currentCodexId);
  // A resolved codex shows its name (id only as a last resort). With no current codex — the neutral
  // first-run / post-reset state — show a prompt, never a raw id posing as a name (issue #26 F3).
  codexSwitcherLabel.textContent = current ? current.name || current.codexId : 'Select a codex';

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
  // Admins get shortcuts straight to codex management: create, plus a signpost that rename/archive
  // live on the same panel — otherwise they're buried behind Admin › Codices with no entry point (#20).
  const adminActions = state.caps.canAdmin
    ? '<button class="codex-switcher-option codex-switcher-new" data-codex-new>＋ New codex</button>' +
      '<button class="codex-switcher-option codex-switcher-manage" data-codex-manage>⚙ Manage codices</button>'
    : '';
  menu.innerHTML = optionsHtml + adminActions;
  codexSwitcherWrap.appendChild(menu);
  menu.querySelectorAll('[data-codex-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      menu.classList.add('hidden');
      switchCodex(btn.dataset.codexId);
    });
  });
  menu.querySelectorAll('[data-codex-new], [data-codex-manage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      menu.classList.add('hidden');
      openCodicesAdmin();
    });
  });
}

codexSwitcher.addEventListener('click', () => {
  if (codexSwitcher.disabled) return;
  codexSwitcherWrap.querySelector('.codex-switcher-menu')?.classList.toggle('hidden');
});

// Re-scope every codex subscription onto a different codex. normalize() keeps a global-admin view
// as-is and retargets a now-missing type, so the whole choreography reduces to re-clamp → render.
async function switchCodex(codexId) {
  if (!codexId || codexId === state.currentCodexId) return;
  if (!(await confirmDiscardIfDirty())) return;
  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  if (entriesUnsubscribe) { entriesUnsubscribe(); entriesUnsubscribe = null; }
  if (imagesUnsubscribe) { imagesUnsubscribe(); imagesUnsubscribe = null; }

  state.currentCodexId = codexId;
  safeStorage.setItem(CURRENT_CODEX_KEY, codexId);
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
  if (open) {
    // Read mode reflects a remote edit to the open entry live; edit mode keeps its in-memory draft
    // (refreshed only by an explicit Save/conflict). Compare versions so our own just-saved change —
    // which already advanced state.formData.version — doesn't toast at us.
    if (state.view.kind === 'type' && state.view.mode === 'read' && (open.version ?? 0) !== (state.formData.version ?? 0)) {
      state.formData = { ...open };
      state.baseVersion = open.version ?? 0;
      refreshBuilderPreview();
      showToast('This entry was just updated');
    }
    highlightNav();
    return;
  }
  loadFirstEntry(type);                            // the open entry was archived → fall back to first
}

// Open a type's first active entry (or a blank draft) in the reader — form + preview + chrome.
function loadFirstEntry(type) {
  const entries = activeEntries(state.entryIndex, type, entryLabel);
  state.formData = entries.length ? { ...entries[0] } : { type };
  showRenderedPane();
  renderForm();
  applyViewChrome();
  highlightNav();
}

// A codex with no types (fresh/blank) — nothing to read yet. Starting types are chosen at create
// time (the Codices panel's starting-types picker), so the empty state just points admins at the
// sidebar's "＋ New type" to add more.
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
  // Redemption alert: count of non-admin users still awaiting a role (see inviteModel.countPendingGrants).
  const pending = state.fbManager?.isConfigured() ? countPendingGrants(buildRosterRows()) : 0;
  const accessLabel = pending > 0
    ? `Users &amp; Access <span class="nav-badge">${pending}</span>`
    : 'Users &amp; Access';
  typeNav.innerHTML = `
    <button class="nav-item nav-admin-back" data-admin-back>‹ Back to codex</button>
    <div class="nav-admin-group">
      <span class="nav-section-label">Admin</span>
      ${item('access', accessLabel)}
      ${item('codices', 'Codices')}
      ${item('images', 'Images')}
      ${item('icons', 'Icons')}
      ${item('emblems', 'Emblems')}
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
  // An unsaved new-type draft is resolvable (overlay) so its preview + picker work, but it isn't a
  // browsable type yet — keep it out of the sidebar until Save, mirroring a new entry.
  const types = listTypes().filter((t) => t.type !== state.newTypeDraft);
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

// The admin-only "＋ New type" affordance at the foot of the nav. It opens the schema builder on an
// in-memory draft; the type's name is the builder head's "Name" field (no separate nav input).
function renderNewTypeRow() {
  return `
    <div class="nav-new-type">
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
  // closing it just collapses, leaving the current selection untouched. Exception: while an edit
  // form is open, a header always navigates to that type's index — collapsing would leave the form
  // up and read as inert (the "click does nothing" trap of #29).
  typeNav.querySelectorAll('[data-type-header]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.typeHeader;
      if (state.view.mode === 'edit') {
        selectTypeTab(type); // dirty-guarded; lands on the type's index
      } else if (state.navExpanded.has(type)) {
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
async function selectTypeTab(type) {
  if (!(await confirmDiscardIfDirty())) return;
  state.navExpanded.add(type);
  goto(selectType(state.view, type));
}

// The header wordmark is a home affordance: it lands on the first type's index (a type's home),
// mirroring the sidebar's type-select entry point — dirty-guarded the same way.
async function goHome() {
  if (!(await confirmDiscardIfDirty())) return;
  const home = listTypes()[0]?.type ?? null;
  if (home) state.navExpanded.add(home);
  goto(selectType(state.view, home));
}
document.getElementById('brand-home')?.addEventListener('click', goHome);

// ── Mobile sidebar drawer (#8) ──
// On narrow screens the sidebar is off-canvas; the header hamburger toggles it. The
// class lives on #app so both the drawer (in .app-body) and the header button see it.
// No-ops on desktop, where CSS pins the sidebar and hides the toggle/scrim.
function closeSidebar() {
  appContainer.classList.remove('sidebar-open');
  sidebarToggle?.setAttribute('aria-expanded', 'false');
}
function openSidebar() {
  appContainer.classList.add('sidebar-open');
  sidebarToggle?.setAttribute('aria-expanded', 'true');
}
function toggleSidebar() {
  if (appContainer.classList.contains('sidebar-open')) closeSidebar();
  else openSidebar();
}
sidebarToggle?.addEventListener('click', toggleSidebar);
sidebarBackdrop?.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && appContainer.classList.contains('sidebar-open')) closeSidebar();
});
// Any nav choice that swaps the workspace closes the drawer; a type-header just expands
// its entries in place, so leave the drawer open for it.
typeNav.addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item && !item.matches('.nav-type-header')) closeSidebar();
});

// Reflect expansion (from navExpanded) + the active type/entry (or Admin) in the nav.
function highlightNav() {
  typeNav.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('is-active'));
  typeNav.querySelectorAll('.nav-type').forEach((el) => el.classList.remove('is-expanded'));

  // Expansion is independent of selection — an opened section stays open until toggled shut.
  state.navExpanded.forEach((type) => {
    typeNav.querySelector(`.nav-type[data-type="${CSS.escape(type)}"]`)?.classList.add('is-expanded');
  });

  // The blanket .nav-item strip above also clears the admin panel items, so re-mark the active one
  // here — otherwise entering admin (or jumping straight to a panel) lands with no highlight until you
  // click a panel by hand.
  if (inGlobalAdmin()) {
    typeNav.querySelector(`[data-admin-nav="${CSS.escape(state.view.panel)}"]`)?.classList.add('is-active');
    return;
  }
  const type = curType();
  if (!type) return;
  const typeEl = typeNav.querySelector(`.nav-type[data-type="${CSS.escape(type)}"]`);
  if (!typeEl) return;
  // The full-bar highlight marks the one level you're actually on; ancestors keep only their
  // gold icon-dot. An open entry (read/edit) is that level → bar the matching entry row and leave
  // its parent type header as a dot. A bare type surface (index/structure) is itself the level →
  // bar the header and highlight no entry (a stale formData.id must not light a sibling).
  const atEntry = state.view.mode === 'read' || state.view.mode === 'edit';
  if (atEntry) {
    typeEl.querySelectorAll('.nav-entry').forEach((el) => {
      if (el.dataset.id === String(state.formData.id)) el.classList.add('is-active');
    });
  } else {
    typeEl.querySelector('.nav-type-header')?.classList.add('is-active');
  }
}

// Swap the reader pane between the rendered view and the raw-JSON textarea. Raw is a de-emphasized
// escape hatch reachable only from the Structure editor's More ▸ Edit JSON (reordering is the visual
// editor's job — Up/Down + drag-and-drop); every other surface forces rendered via showRenderedPane.
function setPreviewMode(mode) {
  const raw = mode === 'raw';
  previewRendered.classList.toggle('hidden', raw);
  previewRawContainer.classList.toggle('hidden', !raw);
}

// The preview column's own dismiss (Structure only). Entering rendered vs raw stays on the editor
// toolbar (Preview / More ▸ Edit JSON); this just collapses whichever is open.
closePreviewBtn.addEventListener('click', hideStructurePreview);

// Content-form field cards collapse to their head (see formRenderer.js). One delegated toggle on the
// persistent form container flips the body's `hidden` (AT skips a shut card) and records the open set
// so a card survives the mid-edit re-renders hero/gallery trigger. The schema editor uses
// `data-se-toggle`, so there's no cross-fire on this shared container.
formContainer.addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-field-toggle]');
  if (!toggle || !formContainer.contains(toggle)) return;
  const card = toggle.closest('[data-field-card]');
  const bodyEl = card?.querySelector('.field-card-body');
  if (!bodyEl) return;
  const open = bodyEl.hidden; // about to open
  bodyEl.hidden = !open;
  card.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  const caret = toggle.querySelector('.field-card-caret');
  if (caret) caret.textContent = open ? '▾' : '▸';
  const key = bodyEl.id.replace(/^fc-/, ''); // body id is `fc-<field.key>`
  if (open) state.expandedContentFields.add(key);
  else state.expandedContentFields.delete(key);
});

// Force the rendered pane (used on every surface entry/exit so the JSON hatch never
// lingers open across navigations).
function showRenderedPane() {
  setPreviewMode('rendered');
}

// Structure-mode preview pane (Part 1): hidden by default so the editor is full-width; Preview
// reveals it rendered, Edit JSON reveals it raw. `preview-collapsed` on the workspace drops the
// reader column (see main.css). The Preview toggle's aria-pressed is patched in place — a full
// editor rebuild would be needless churn for a pane toggle.
function reflectPreviewToggle() {
  const btn = typesMountEl().querySelector('[data-se="preview"]');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(state.structurePreview === 'rendered'));
  // Preview opens the pane; the pane's own Close dismisses it — so hide the opener while it's open.
  btn.hidden = state.structurePreview !== null;
}
function showStructurePreview(mode) {
  state.structurePreview = mode;
  mainWorkspace.classList.remove('preview-collapsed');
  setPreviewMode(mode);
  reflectPreviewToggle();
}
function hideStructurePreview() {
  state.structurePreview = null;
  mainWorkspace.classList.add('preview-collapsed');
  reflectPreviewToggle();
}

// The single renderer: render the content area + chrome to match state.view. Used on navigation,
// codex switch, content changes, and boot — NOT on in-place read/edit toggles (those keep the open
// form/preview without re-subscribing). Content dispatch by view: global-admin door, empty codex,
// per-type schema editor ("admin"), else the entry reader/form.
function renderView() {
  const v = state.view;
  // Leaving search (result click, nav, etc.) empties the box so the sidebar reads as "browsing".
  if (v.kind !== 'search' && navSearch && navSearch.value) navSearch.value = '';
  renderNav(); // the sidebar reflects the surface: content types, or the admin nav
  if (v.kind === 'global-admin') enterGlobalAdmin();
  else if (v.kind === 'search') enterSearch(v.query);
  else if (!v.type) renderEmptyCodexState();
  else if (v.mode === 'admin') enterSchemaAdmin(v.type);
  else if (v.mode === 'index') enterTypeIndex(v.type);
  else {
    // Ensure the open entry belongs to the current type (a type switch reselects its first entry).
    if (!state.formData || state.formData.type !== v.type) {
      const entries = activeEntries(state.entryIndex, v.type, entryLabel);
      state.formData = entries.length ? { ...entries[0] } : { type: v.type };
    }
    if (!state.formData.id) {
      // Nothing concrete to read (an entry-less type, or a just-discarded new draft) — show the
      // type's index (its home) instead of a phantom "(untitled)" entry header (#29).
      state.view = toIndex(v);
      enterTypeIndex(v.type);
    } else {
      showRenderedPane();
      renderForm();
    }
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

  // The index shares the read layout (full-width reader, form hidden) — it's a read-only surface.
  const cls =
    v.kind === 'global-admin' ? 'view-global-admin'
    : v.kind === 'search' ? 'view-content-read' // search shares the full-width reader layout
    : v.mode === 'edit' ? 'view-content-edit'
    : v.mode === 'admin' ? 'view-content-admin'
    : 'view-content-read';
  mainWorkspace.classList.remove('view-content-read', 'view-content-edit', 'view-content-admin', 'view-global-admin');
  mainWorkspace.classList.add(cls);
  // `preview-collapsed` (Structure's full-width editor) only applies in admin mode; drop it elsewhere
  // so a lingering class never affects another layout. enterSchemaAdmin re-adds it on entry.
  if (v.mode !== 'admin') mainWorkspace.classList.remove('preview-collapsed');

  // Edit sits in the reader header (content read); Save + the discard exit live in the form header
  // (edit). Structure is a toggle: "Structure" to enter from reading, "Back" to leave — never a dead end.
  const inTypeRead = v.kind === 'type' && !!v.type && v.mode === 'read';
  const inStructure = v.kind === 'type' && !!v.type && v.mode === 'admin';
  const inIndex = v.kind === 'type' && !!v.type && v.mode === 'index';
  editToggleBtn.hidden = !(canEdit && inTypeRead);
  // Structure enters the editor from the reader/index (reachable from the index landing too, so an
  // admin needn't drill into an entry first). Leaving is the editor toolbar's own "← Back" — so this
  // no longer shows inside Structure, where the preview column carries only its Close.
  structureBtn.hidden = !(canAdmin && (inTypeRead || inIndex));
  closePreviewBtn.hidden = !inStructure;
  // Export (#2) is a whole-codex owner operation — it lives on the admin Codices panel now, not the
  // reader header (see exportCurrentCodex / the Codices panel), so nothing to toggle here.
  const editingEntry = v.kind === 'type' && v.mode === 'edit';
  saveEntryBtn.hidden = !(canEdit && editingEntry);
  // The form's discard exit, distinct from Save (#29): a never-saved draft (no id) reads "Cancel";
  // an existing entry reads "Back". The header breadcrumb's type up-link is the same exit.
  doneEditBtn.textContent = state.formData.id ? 'Back' : 'Cancel';
  // Archive only makes sense for an already-saved entry (a brand-new draft has no id yet).
  archiveEntryBtn.hidden = !(canEdit && editingEntry && !!state.formData.id);
  // Permanent delete is the admin break-glass beside Archive: admin-only (not just editor), and only
  // for an already-saved entry. Mirrors the isAdmin() gate on the entry `delete` rule.
  deleteEntryBtn.hidden = !(state.caps.canAdmin && editingEntry && !!state.formData.id);
  // History is a cloud-only recovery surface (local-only entries reset on reload — nothing to ring),
  // and only a saved entry has a ring.
  const cloudEntry = !!(codexScope() && codexScope().isConfigured());
  historyEntryBtn.hidden = !(canEdit && editingEntry && !!state.formData.id && cloudEntry);
}

editToggleBtn.addEventListener('click', () => {
  if (!state.caps.canEdit || state.view.kind !== 'type' || !state.view.type) return;
  state.view = toEdit(state.view);
  renderFormWithoutResubscribe(); // reflect current formData (e.g. an id just assigned on save)
  applyViewChrome();
});

// Leaving Structure ("Back", from the reader-header toggle or the editor toolbar): guard an unsaved
// new-type draft before it's discarded, then return to the reader.
async function exitStructure() {
  if (!state.caps.canAdmin || state.view.kind !== 'type' || !state.view.type) return;
  if (!(await confirmDiscardIfDirty())) return;
  goto(toRead(state.view));
}

structureBtn.addEventListener('click', async () => {
  if (!state.caps.canAdmin || state.view.kind !== 'type' || !state.view.type) return;
  if (inSchemaAdmin()) return exitStructure();
  goto(toSchemaAdmin(state.view));
});

// The header breadcrumb's parent segment (see setEntryCrumb): navigate up to the type's index. Same
// target as clicking the type in the nav (selectType lands in index mode), guarding a dirty edit
// form on the way out. Delegated on both title elements since either can host the crumb.
async function onCrumbClick(e) {
  const btn = e.target.closest('[data-crumb-type]');
  if (!btn) return;
  if (!(await confirmDiscardIfDirty())) return;
  const type = btn.dataset.crumbType;
  state.navExpanded.add(type);
  goto(selectType(state.view, type));
}
readerTitle.addEventListener('click', onCrumbClick);
editorTitle.addEventListener('click', onCrumbClick);

// Export the current codex to a JSON file (#2): gather meta + effective schemas + all entries
// (active and archived) from live state and hand the browser a download. Image bytes aren't
// bundled — entries keep their references (see exportCodex.js). Lives on the admin Codices panel
// (the current codex's row) — a whole-codex owner operation, not a per-view reader action.
function exportCurrentCodex() {
  const meta = state.codices.find((c) => c.codexId === state.currentCodexId) || { codexId: state.currentCodexId };
  const entries = Object.values(state.entryIndex).flat();
  const exportedAt = new Date().toISOString();
  const payload = buildCodexExport({ meta, schemas: getAllSchemas(), entries, exportedAt });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(meta, exportedAt);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

doneEditBtn.addEventListener('click', async () => {
  if (!(await confirmDiscardIfDirty())) return;
  // A never-saved draft ("Cancel") has no entry to return to — land on the type's index (its home)
  // rather than a blank "(untitled)" read view (#29). An existing entry ("Back") returns to reading it.
  if (state.formData.id) {
    state.view = toRead(state.view);
    refreshBuilderPreview();
    applyViewChrome();
  } else {
    goto(selectType(state.view, curType()));
  }
});

saveEntryBtn.addEventListener('click', () => saveEntry());
historyEntryBtn.addEventListener('click', () => openEntryHistory());
archiveEntryBtn.addEventListener('click', () => archiveCurrentEntry());
deleteEntryBtn.addEventListener('click', () => deleteCurrentEntry());

// ── Sidebar search box ───────────────────────────────────────────────────────
// Debounced: the first non-empty keystroke transitions into the search view (full re-render for the
// chrome swap); subsequent keystrokes only re-run the results pane, so the sidebar (and the box's
// focus) never rebuild mid-type. Clearing the box returns to wherever search was opened from. Entering
// search is non-destructive — an open edit draft lives in state.formData and is intact on return.
let searchDebounce = null;
let searchReturnView = null; // where clearing the box lands you back (the view search was opened from)

function runSearch(value) {
  const q = value.trim();
  if (state.view.kind === 'search') {
    if (!q) return leaveSearch();
    state.view = openSearch(state.view, value); // update the query in place
    enterSearch(value); // re-render results only — no nav/chrome churn
    return;
  }
  if (!q) return; // idle box, nothing to search
  searchReturnView = state.view; // remember where to land when the box is cleared
  goto(openSearch(state.view, value));
}

function leaveSearch() {
  const back = searchReturnView;
  searchReturnView = null;
  goto(back || selectType(state.view, listTypes()[0]?.type ?? null));
}

navSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => runSearch(navSearch.value), 120);
});

navSearch.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  clearTimeout(searchDebounce);
  navSearch.value = '';
  if (state.view.kind === 'search') leaveSearch();
  navSearch.blur();
});

// ── Global-admin door (admin-only) ──────────────────────────────────────────
// Two panels: Users & Access (roster) and Codices (create/rename/archive). Per-type schema editing is
// no longer here — it's the per-type "Structure" (admin) mode. Only admins reach this surface
// (normalize() guarantees it).

let adminUsersUnsub = null;
let adminPermsUnsub = null;
let adminInvitesUnsub = null;
let adminImagesUnsub = null;

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
  } else if (state.view.panel === 'images') {
    formContainer.innerHTML = renderImagesPanelHtml();
    wireImagesPanel();
  } else if (state.view.panel === 'icons') {
    formContainer.innerHTML = renderIconsPanelHtml();
    wireIconsPanel();
  } else if (state.view.panel === 'emblems') {
    formContainer.innerHTML = renderEmblemsPanelHtml();
    wireEmblemsPanel();
  } else {
    const inv = invitesPanelModel();
    const ros = rosterPanelModel();
    formContainer.innerHTML =
      renderInvitesPanel({ rows: inv.rows, query: inv.query }) +
      renderAccessPanel({ codexName: currentCodexName(), codexId: state.currentCodexId, rows: ros.rows, query: ros.query });
    wireInvitesPanel();
    wireAccessPanel();
  }
}

// The per-type "Structure" (schema) surface: the schema editor mounted for `type` in the left panel,
// its live type preview on the right. Entered via the reader's Structure button or the editor's type
// picker. Note: this is a content-surface mode (kind:'type', mode:'admin'), not the global-admin door.
function enterSchemaAdmin(type) {
  const schema = getSchema(type);
  readerTitle.textContent = (schema && schema.label) || type;
  editorTitle.textContent = readerTitle.textContent;
  // The preview pane starts hidden (editor full-width); Preview / Edit JSON reveal it. Reset fresh
  // each entry so it never lingers open across navigations. The reader pane is still primed to
  // rendered mode so revealing it lands on the entry preview, not a stale raw view.
  state.structurePreview = null;
  mainWorkspace.classList.add('preview-collapsed');
  showRenderedPane();
  setEditingType(type); // renders the schema editor into #form-container + refreshes the preview
}

// The across-entries index (Axis 2): the type's active entries rendered as a summary-card grid in
// the (full-width) reader. A read-only surface — no open entry, no form; clicking a card opens that
// entry in read mode (see the previewRendered click handler).
function enterTypeIndex(type) {
  const schema = getSchema(type);
  readerTitle.textContent = (schema && schema.label) || type;
  showRenderedPane();
  updateRenderedPreview(renderTypeIndex(type, activeEntries(state.entryIndex, type, entryLabel), renderCtx));
}

// ── Reader search ────────────────────────────────────────────────────────────
// A full-width read surface over the whole (active) codex. buildSearchDocs/searchEntries are pure
// (schema/searchIndex.js); this only renders the ranked hits and hands their type/id to the existing
// reference-link click path (data-ref-type/-id → loadEntry). The box lives in the sidebar and drives
// this via the input handler above.

// Turn a hit's snippet segments into escaped HTML, wrapping matched runs in <mark>.
function snippetHtml(parts) {
  return (parts || [])
    .map((p) => (p.hit ? `<mark class="search-hit">${escapeHtml(p.text)}</mark>` : escapeHtml(p.text)))
    .join('');
}

function renderSearchResults(query, results) {
  const heading = `<h1 class="search-heading">Search</h1>`;
  const q = query.trim();
  if (!q) {
    return `${heading}<p class="muted search-empty">Type to search entries across this codex.</p>`;
  }
  if (!results.length) {
    return `${heading}<p class="muted search-empty">No entries match “${escapeHtml(q)}”.</p>`;
  }
  const count = `<p class="muted search-count">${results.length} match${results.length === 1 ? '' : 'es'}</p>`;
  const rows = results
    .map((r) => {
      const typeLabel = getSchema(r.type)?.label || r.type;
      return `<button type="button" class="search-result" data-ref-type="${escapeHtml(r.type)}" data-ref-id="${escapeHtml(
        r.id
      )}">
        <span class="search-result-head">
          <span class="search-result-title">${escapeHtml(r.title)}</span>
          <span class="search-result-type">${escapeHtml(typeLabel)}</span>
        </span>
        <span class="search-snippet">${snippetHtml(r.parts)}</span>
      </button>`;
    })
    .join('');
  return `${heading}${count}<div class="search-results">${rows}</div>`;
}

// Render the search surface for the current query against the live entry index.
function enterSearch(query) {
  readerTitle.textContent = 'Search';
  showRenderedPane();
  const docs = buildSearchDocs(state.entryIndex, getSchema, renderCtx);
  const results = searchEntries(docs, query);
  updateRenderedPreview(renderSearchResults(query, results));
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
  const createName = document.getElementById('codex-create-name');
  document.getElementById('codex-create-btn')?.addEventListener('click', createCodex);
  createName?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); createCodex(); }
  });

  // Rename: commit on Enter, and keep the button disabled until the field diverges from the
  // rendered name (`defaultValue`) so it's clear the field is the editable control and the button
  // only appears live once there's a change to commit.
  formContainer.querySelectorAll('[data-codex-name]').forEach((input) => {
    const id = input.dataset.codexName;
    const btn = formContainer.querySelector(`[data-codex-rename="${CSS.escape(id)}"]`);
    const dirty = () => input.value.trim() !== '' && input.value !== input.defaultValue;
    const sync = () => { if (btn) btn.disabled = !dirty(); };
    sync();
    input.addEventListener('input', sync);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (dirty()) renameCodex(id, input.value); }
    });
  });
  formContainer.querySelectorAll('[data-codex-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.codexRename;
      const input = formContainer.querySelector(`[data-codex-name="${CSS.escape(id)}"]`);
      renameCodex(id, input ? input.value : '');
    });
  });
  formContainer.querySelectorAll('[data-codex-archive]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await openConfirm({
        title: 'Archive this codex?',
        message: 'It’s hidden from the switcher for everyone who uses it. Nothing is deleted — you can restore it from the Archived list below.',
        confirmLabel: 'Archive',
      });
      if (ok) setCodexStatus(btn.dataset.codexArchive, 'archived');
    });
  });
  formContainer.querySelectorAll('[data-codex-restore]').forEach((btn) => {
    btn.addEventListener('click', () => setCodexStatus(btn.dataset.codexRestore, 'active'));
  });
  // Export only appears on the current codex's row (only its schemas + entries are in memory).
  formContainer.querySelector('[data-codex-export]')?.addEventListener('click', exportCurrentCodex);
}

// ── Images admin panel (label / cross-assign / archive-restore) ──────────────
// The shared image library across all codices. Bytes are global + public, so a card's tile URL is
// deterministic from the id regardless of membership/status (publicUrl); archived just hides the
// record everywhere. Inert in local-only mode (no `images` collection).

function renderImagesPanelHtml() {
  if (!(state.fbManager && state.fbManager.isConfigured())) {
    return '<div class="admin-section"><div class="admin-muted">The image library needs cloud mode (Firebase).</div></div>';
  }
  const m = imagesPanelModel();
  return renderImagesPanel({ rows: m.rows, codices: m.codices, query: m.query });
}

// Shape + filter the Images gallery rows. Shared by the first render and the filter re-render so both
// see the same sort + query; filtering is pure array work over state.adminImages (already in memory).
function imagesPanelModel() {
  const uid = state.authManager?.currentUser?.uid || '';
  const codices = switcherCodices(state.codices, [], { isAdmin: true, uid });
  const rows = state.adminImages
    .map((img) => ({
      id: img.id,
      label: img.label || img.id,
      status: img.status || 'active',
      codices: img.codices || [],
      url: publicUrl(supabaseConfig, img.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const query = state.adminFilters.images;
  return { rows: filterRows(rows, query, (r) => r.label), codices, query };
}

function rerenderImageRows() {
  const el = document.getElementById('images-results');
  if (!el) return;
  const m = imagesPanelModel();
  el.innerHTML = renderImageCards(m.rows, m.codices, m.query);
  wireImageRows();
}

function wireImagesPanel() {
  wireAdminFilter('images-filter', 'images', rerenderImageRows);
  wireImageRows();
}

function wireImageRows() {
  const fb = state.fbManager;
  if (!fb) return;
  const guard = (p) => Promise.resolve(p).catch((err) => showToast('Image error: ' + err.message));

  // Label edit + cross-assign are immediate (reversible); archive is destructive → confirm.
  formContainer.querySelectorAll('[data-image-label]').forEach((input) => {
    input.addEventListener('change', () => {
      const label = input.value.trim();
      if (label) guard(fb.updateImageLabel(input.dataset.imageLabel, label).then(() => showToast('Saved label')));
    });
  });
  formContainer.querySelectorAll('[data-image-add-codex]').forEach((sel) => {
    sel.addEventListener('change', () => {
      if (sel.value) guard(fb.addImageToCodex(sel.dataset.imageAddCodex, sel.value).then(() => showToast('Added to codex')));
    });
  });
  formContainer.querySelectorAll('[data-image-drop-codex]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await openConfirm({
        title: 'Remove image from this codex?',
        message: 'It stays in the shared library and in any other codex it belongs to.',
        confirmLabel: 'Remove',
      });
      if (ok) guard(fb.removeImageFromCodex(btn.dataset.imageDropCodex, btn.dataset.codex).then(() => showToast('Removed from codex')));
    });
  });
  formContainer.querySelectorAll('[data-image-restore]').forEach((btn) => {
    btn.addEventListener('click', () =>
      guard(fb.setImageStatus(btn.dataset.imageRestore, 'active').then(() => showToast('Restored image')))
    );
  });
  formContainer.querySelectorAll('[data-image-archive]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await openConfirm({
        title: 'Archive this image?',
        message: 'It will be hidden from every codex. The bytes are retained, and you can restore it.',
        confirmLabel: 'Archive',
      });
      if (ok) guard(fb.setImageStatus(btn.dataset.imageArchive, 'archived').then(() => showToast('Archived image')));
    });
  });
}

// ── Icons admin panel (create / edit markup / archive-restore) ───────────────
// The app-global icon overlay. Icons are SVG-as-text; the live overlay subscription
// (subscribeIconOverlay) keeps the nav in sync, so this panel only mutates — writes flow
// back through that subscription. All writes are admin-only (firestore.rules). Inert local-only.

function renderIconsPanelHtml() {
  if (!(state.fbManager && state.fbManager.isConfigured())) {
    return '<div class="admin-section"><div class="admin-muted">Icon management needs cloud mode (Firebase).</div></div>';
  }
  return renderIconsPanel(buildIconPanelModel(state.icons, bundledIcons));
}

function wireIconsPanel() {
  const fb = state.fbManager;
  if (!fb) return;
  const guard = (p) => Promise.resolve(p).catch((err) => showToast('Icon error: ' + err.message));

  // Live preview of the create form's SVG (admin-authored, trusted markup — same as the nav injects)
  // plus the Add button's disabled gate: key and SVG are required (label is optional), so the button
  // stays disabled until both carry a non-empty value.
  const createKey = document.getElementById('icon-create-key');
  const createSvg = document.getElementById('icon-create-svg');
  const createPreview = document.getElementById('icon-create-preview');
  const createBtn = document.getElementById('icon-create-btn');
  const syncCreateState = () => {
    if (createPreview) createPreview.innerHTML = /<svg[\s>]/i.test(createSvg?.value || '') ? createSvg.value : '';
    if (createBtn) createBtn.disabled = !(createKey?.value.trim() && createSvg?.value.trim());
  };
  createKey?.addEventListener('input', syncCreateState);
  createSvg?.addEventListener('input', syncCreateState);
  syncCreateState();

  document.getElementById('icon-create-btn')?.addEventListener('click', createIcon);

  // Visual authoring (icon-designer.md): Draw opens the layered editor blank (mono); Browse library
  // seeds it from any bundled/overlay glyph; per-card "Edit in designer" reopens a layered record.
  document.getElementById('icon-draw-btn')?.addEventListener('click', () => openGlyphFor('mono'));
  document.getElementById('icon-library-btn')?.addEventListener('click', browseGlyphLibrary);
  formContainer.querySelectorAll('[data-icon-design]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rec = state.icons.find((i) => i.key === btn.dataset.iconDesign);
      if (rec) openGlyphFor('mono', rec);
    });
  });

  // Clear the add-icon card (handy after an Override seeds it, or to abandon a draft).
  document.getElementById('icon-create-clear')?.addEventListener('click', () => {
    ['icon-create-key', 'icon-create-label', 'icon-create-svg'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    // Re-fire input so the live preview empties too.
    document.getElementById('icon-create-svg')?.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('icon-create-key')?.focus();
  });

  // "Override…" on a bundled icon seeds the create form with that key + its baseline markup, so the
  // admin edits from the current glyph. Creating an overlay with a bundled key is exactly an override.
  formContainer.querySelectorAll('[data-icon-override]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.iconOverride;
      const bundled = bundledIcons.find((i) => i.key === key);
      const keyInput = document.getElementById('icon-create-key');
      const svgInput = document.getElementById('icon-create-svg');
      if (keyInput) keyInput.value = key;
      if (svgInput) {
        svgInput.value = bundled ? bundled.svg : '';
        svgInput.dispatchEvent(new Event('input', { bubbles: true })); // refresh the live preview
      }
      keyInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      keyInput?.focus();
    });
  });

  // Label + markup save together (the SVG textarea is multiline → an explicit Save, not on-change).
  formContainer.querySelectorAll('[data-icon-save]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.iconSave;
      const label = formContainer.querySelector(`[data-icon-label="${CSS.escape(key)}"]`)?.value.trim() || '';
      const svg = formContainer.querySelector(`[data-icon-svg="${CSS.escape(key)}"]`)?.value.trim() || '';
      const problems = validateIcon({ key, svg }); // key is fixed here; svg is the real gate
      if (problems.length) return showToast(problems[0]);
      guard(fb.updateIcon(key, { label, svg }).then(() => showToast(`Saved icon “${key}”`)));
    });
  });

  formContainer.querySelectorAll('[data-icon-restore]').forEach((btn) => {
    btn.addEventListener('click', () =>
      guard(fb.setIconStatus(btn.dataset.iconRestore, 'active').then(() => showToast('Restored icon')))
    );
  });

  formContainer.querySelectorAll('[data-icon-archive]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await openConfirm({
        title: 'Archive this icon?',
        message: 'It drops out of the overlay; types using its key fall back to the bundled or default glyph. You can restore it.',
        confirmLabel: 'Archive',
      });
      if (ok) guard(fb.setIconStatus(btn.dataset.iconArchive, 'archived').then(() => showToast('Archived icon')));
    });
  });
}

// Add a new icon: validated (key shape + uniqueness, svg markup), then created. The overlay
// subscription re-renders the panel with the new card.
async function createIcon() {
  const fb = state.fbManager;
  if (!fb) return;
  const key = (document.getElementById('icon-create-key')?.value || '').trim();
  const label = (document.getElementById('icon-create-label')?.value || '').trim();
  const svg = (document.getElementById('icon-create-svg')?.value || '').trim();
  const problems = validateIcon({ key, svg }, state.icons.map((i) => i.key));
  if (problems.length) return showToast(problems[0]);
  try {
    await fb.createIcon(key, { label, svg });
    showToast(`Added icon “${key}”`);
  } catch (err) {
    showToast('Add failed: ' + err.message);
  }
}

// ── Emblems admin panel (create / edit / archive-restore) ────────────────────
// The app-global emblem set: full-color glyphs with no bundled baseline (rendered straight from
// state.emblems). Primary authoring is the shared glyph designer; a color-SVG paste box is the
// escape hatch. All writes admin-only (firestore.rules). Inert local-only.

function renderEmblemsPanelHtml() {
  if (!(state.fbManager && state.fbManager.isConfigured())) {
    return '<div class="admin-section"><div class="admin-muted">Emblem management needs cloud mode (Firebase).</div></div>';
  }
  return renderEmblemsPanel(buildEmblemPanelModel(state.emblems));
}

function wireEmblemsPanel() {
  const fb = state.fbManager;
  if (!fb) return;
  const guard = (p) => Promise.resolve(p).catch((err) => showToast('Emblem error: ' + err.message));

  // Live preview + Add gate for the paste escape hatch (color SVG, admin-authored trusted markup).
  const createKey = document.getElementById('emblem-create-key');
  const createSvg = document.getElementById('emblem-create-svg');
  const createPreview = document.getElementById('emblem-create-preview');
  const createBtn = document.getElementById('emblem-create-btn');
  const syncCreateState = () => {
    if (createPreview) createPreview.innerHTML = /<svg[\s>]/i.test(createSvg?.value || '') ? createSvg.value : '';
    if (createBtn) createBtn.disabled = !(createKey?.value.trim() && createSvg?.value.trim());
  };
  createKey?.addEventListener('input', syncCreateState);
  createSvg?.addEventListener('input', syncCreateState);
  syncCreateState();

  document.getElementById('emblem-draw-btn')?.addEventListener('click', () => openGlyphFor('color'));
  document.getElementById('emblem-create-btn')?.addEventListener('click', createEmblemFromPaste);
  document.getElementById('emblem-create-clear')?.addEventListener('click', () => {
    ['emblem-create-key', 'emblem-create-label', 'emblem-create-svg'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('emblem-create-svg')?.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('emblem-create-key')?.focus();
  });

  formContainer.querySelectorAll('[data-emblem-design]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rec = state.emblems.find((e) => e.key === btn.dataset.emblemDesign);
      if (rec) openGlyphFor('color', rec);
    });
  });

  // Pasted (layer-less) emblems save their raw markup; designed ones save the label only.
  formContainer.querySelectorAll('[data-emblem-save]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.emblemSave;
      const label = formContainer.querySelector(`[data-emblem-label="${CSS.escape(key)}"]`)?.value.trim() || '';
      const svg = formContainer.querySelector(`[data-emblem-svg="${CSS.escape(key)}"]`)?.value.trim() || '';
      if (!/<svg[\s>]/i.test(svg)) return showToast('SVG must contain an <svg> element.');
      guard(fb.updateEmblem(key, { label, svg }).then(() => showToast(`Saved emblem “${key}”`)));
    });
  });
  formContainer.querySelectorAll('[data-emblem-save-label]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.emblemSaveLabel;
      const label = formContainer.querySelector(`[data-emblem-label="${CSS.escape(key)}"]`)?.value.trim() || '';
      guard(fb.updateEmblem(key, { label }).then(() => showToast('Saved label')));
    });
  });

  formContainer.querySelectorAll('[data-emblem-restore]').forEach((btn) => {
    btn.addEventListener('click', () =>
      guard(fb.setEmblemStatus(btn.dataset.emblemRestore, 'active').then(() => showToast('Restored emblem')))
    );
  });
  formContainer.querySelectorAll('[data-emblem-archive]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await openConfirm({
        title: 'Archive this emblem?',
        message: 'It drops out of the set; content and map markers using its key fall back. You can restore it.',
        confirmLabel: 'Archive',
      });
      if (ok) guard(fb.setEmblemStatus(btn.dataset.emblemArchive, 'archived').then(() => showToast('Archived emblem')));
    });
  });
}

// Add an emblem from the paste box (no structured layers — the escape hatch, mirrors createIcon).
async function createEmblemFromPaste() {
  const fb = state.fbManager;
  if (!fb) return;
  const key = (document.getElementById('emblem-create-key')?.value || '').trim();
  const label = (document.getElementById('emblem-create-label')?.value || '').trim();
  const svg = (document.getElementById('emblem-create-svg')?.value || '').trim();
  const problems = validateIcon({ key, svg }, state.emblems.map((e) => e.key)); // reuse the key+<svg> gate
  if (problems.length) return showToast(problems[0]);
  try {
    await fb.createEmblem(key, { label, svg });
    showToast(`Added emblem “${key}”`);
  } catch (err) {
    showToast('Add failed: ' + err.message);
  }
}

// ── Shared glyph designer glue (icons + emblems) ─────────────────────────────
// One designer, two collections. `palette` picks the starting kind; editing an existing record
// (`rec` present) locks the palette so a glyph never silently jumps collections. On save, the
// record routes by its final palette: mono → icons, color → emblems (createGlyph or updateGlyph).

async function openGlyphFor(palette, rec = null) {
  const params = glyphDesignerParams(palette, rec, {
    iconKeys: state.icons.map((i) => i.key),
    emblemKeys: state.emblems.map((e) => e.key),
  });
  await openGlyphDesigner({ ...params, onSave: (record) => saveGlyph(record, !!rec) });
}

async function browseGlyphLibrary() {
  // Our own curated set: the bundled baseline plus the active overlay (generalizes "Override…").
  // Source the overlay from state.icons so a designed glyph keeps its `layers` (opens in the editor).
  const pool = buildGlyphLibraryPool(bundledIcons, state.icons);
  const chosen = await openLibraryPicker(pool);
  if (!chosen) return;
  if (chosen.layers) {
    // A layered source opens straight in the designer under a fresh key (blanked so it's a new glyph).
    return openGlyphFor('mono', { key: '', label: '', layers: chosen.layers, palette: 'mono' });
  }
  // A bundled/pasted source seeds the raw create form (no layers to edit visually).
  const keyInput = document.getElementById('icon-create-key');
  const svgInput = document.getElementById('icon-create-svg');
  if (keyInput) keyInput.value = '';
  if (svgInput) {
    svgInput.value = chosen.svg || '';
    svgInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  keyInput?.focus();
}

// Write a designer record to the collection its palette selects. `isEdit` updates in place (the key
// is fixed); a create stamps a new doc. The live subscription re-renders the panel with the result.
async function saveGlyph(record, isEdit) {
  const fb = state.fbManager;
  if (!fb) throw new Error('Glyph authoring needs cloud mode.');
  const { collection, op, key, data, toast } = glyphSaveTarget(record, isEdit);
  if (collection === 'emblem') {
    await (op === 'update' ? fb.updateEmblem(key, data) : fb.createEmblem(key, data));
  } else {
    await (op === 'update' ? fb.updateIcon(key, data) : fb.createIcon(key, data));
  }
  showToast(toast);
}

// The starting-types picker's sentinel for "seed the bundled starter examples" — distinct from a
// real codexId (which is an opaque newId) and from '' (blank).
const STARTER_TEMPLATE_ID = '__starter__';

// Create a codex: an opaque id, meta + creator grant, then the chosen starting types, then auto-
// switch to it. The starting-types choice (blank / starter examples / copy an existing codex) is
// resolved into schemas and written as part of this one deliberate commit — nothing hits the DB
// before "Create codex". The display name is free-form (duplicates are fine — the id is unique).
async function createCodex() {
  if (!(state.fbManager && state.fbManager.isConfigured())) return;
  const name = (document.getElementById('codex-create-name')?.value || '').trim();
  if (!name) return showToast('Enter a codex name');
  const id = newId();
  const templateId = document.getElementById('codex-create-template')?.value || '';
  const uid = state.authManager?.currentUser?.uid;
  const nowIso = new Date().toISOString();
  try {
    await state.fbManager.saveCodexMeta(id, { name, status: 'active', createdBy: uid, createdAt: nowIso });
    if (uid) await state.fbManager.savePermission(uid, id, { role: 'editor', grantedBy: uid, grantedAt: nowIso });
    const startingTypes =
      templateId === STARTER_TEMPLATE_ID
        ? cloneStarterSchemas(demoSchemas)
        : templateId
        ? buildTemplateSchemas(await state.fbManager.codex(templateId).getSchemas())
        : [];
    if (startingTypes.length) {
      const dest = state.fbManager.codex(id);
      await Promise.all(startingTypes.map((s) => dest.saveSchema(s.type, s)));
    }
    showToast(`Created “${name}”`);
    // Land in the new codex's content: its empty state surfaces "＋ New type" (or a template's first
    // type once schemas load). A blank content view lets switchCodex's normalize resolve it.
    state.view = { kind: 'type', type: null, mode: 'read' };
    switchCodex(id);
  } catch (err) {
    showToast('Create failed: ' + err.message);
  }
}

// Rename edits the display name only — the codex id (Firestore key) is immutable.
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

// Debounced filter wiring shared by the three scaling panels (#6). On input it stores the query and
// re-renders ONLY the results container (rerender), never the panel — so the box keeps focus/caret
// mid-type. Per-key timers so the two boxes on the invites+access surface don't cancel each other.
const adminFilterDebounce = {};
function wireAdminFilter(inputId, key, rerender) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(adminFilterDebounce[key]);
    adminFilterDebounce[key] = setTimeout(() => {
      state.adminFilters[key] = input.value;
      rerender();
    }, 120);
  });
}

function rosterPanelModel() {
  const query = state.adminFilters.access;
  const rows = filterRows(buildRosterRows(), query, (r) => `${r.displayName || ''} ${r.email || ''}`);
  return { rows, query };
}

function invitesPanelModel() {
  const query = state.adminFilters.invites;
  const rows = filterRows(
    buildInviteRows({ invites: state.adminInvites, users: state.adminUsers, nowMs: Date.now() }),
    query,
    (r) => `${r.label || ''} ${r.redeemers.map((u) => u.displayName || u.email || u.uid).join(' ')}`
  );
  return { rows, query };
}

function rerenderRosterRows() {
  const el = document.getElementById('access-rows');
  if (!el) return;
  const m = rosterPanelModel();
  el.innerHTML = renderRosterRows(m.rows, m.query);
  wireAccessRows();
}

function rerenderInviteRows() {
  const el = document.getElementById('invites-rows');
  if (!el) return;
  const m = invitesPanelModel();
  el.innerHTML = renderInviteRows(m.rows, m.query);
  wireInviteRows();
}

function wireAccessPanel() {
  wireAdminFilter('access-filter', 'access', rerenderRosterRows);
  wireAccessRows();
}

function wireAccessRows() {
  formContainer.querySelectorAll('[data-grant-uid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.grantUid;
      const role = btn.dataset.grantRole;
      if (role === 'none') {
        const ok = await openConfirm({
          title: 'Remove access?',
          message: 'This person loses access to this codex. Their account is untouched, and you can grant access again.',
          confirmLabel: 'Remove access',
        });
        if (!ok) return;
      }
      grantRole(uid, role);
    });
  });
}

function wireInvitesPanel() {
  document.getElementById('invite-generate-btn')?.addEventListener('click', generateInvite);
  wireAdminFilter('invites-filter', 'invites', rerenderInviteRows);
  wireInviteRows();
}

function wireInviteRows() {
  formContainer.querySelectorAll('[data-invite-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyInviteLink(btn.dataset.inviteCopy));
  });
  formContainer.querySelectorAll('[data-invite-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await openConfirm({
        title: 'Revoke this invite?',
        message: 'The link stops working immediately. You can reactivate it later.',
        confirmLabel: 'Revoke',
      });
      if (ok) changeInviteStatus(btn.dataset.inviteRevoke, 'revoked');
    });
  });
  formContainer.querySelectorAll('[data-invite-reactivate]').forEach((btn) => {
    btn.addEventListener('click', () => changeInviteStatus(btn.dataset.inviteReactivate, 'active'));
  });
}

// Mint an invite (random UUID = the secret token), persist it, and copy its link to the clipboard.
// The roster/invites panel re-renders from the live subscription once the write lands.
function generateInvite() {
  if (!state.fbManager?.isConfigured()) return showToast('Invites need cloud mode (not available local-only)');
  const label = (document.getElementById('invite-label')?.value || '').trim() || null;
  const token = crypto.randomUUID();
  const user = state.authManager?.currentUser;
  const createdBy = user?.email || user?.uid || null;
  state.fbManager
    .createInvite(token, { label, createdBy })
    .then(() => copyInviteLink(token, 'Invite link generated & copied to clipboard'))
    .catch((err) => showToast('Could not create invite: ' + err.message));
}

function copyInviteLink(token, msg = 'Invite link copied to clipboard') {
  const url = buildInviteUrl(location.origin + import.meta.env.BASE_URL, token);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => showToast(msg)).catch(() => showToast(url));
  } else {
    showToast(url);
  }
}

function changeInviteStatus(token, status) {
  if (!state.fbManager?.isConfigured()) return;
  state.fbManager
    .setInviteStatus(token, status)
    .then(() => showToast(status === 'revoked' ? 'Invite revoked' : 'Invite reactivated'))
    .catch((err) => showToast('Invite update failed: ' + err.message));
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
    scope
      .saveSchema(type, schema)
      .then(() => markSchemaSynced(type)) // server-acked: retire the draft (issue #27)
      .catch((err) => showToast('Firebase save error: ' + err.message));
  }
}

// "＋ New type": open the schema builder on an in-memory draft (name lives in the builder head,
// not a separate nav input), persisting nothing until Save. The draft sits in the store overlay
// only so getSchema/listTypes resolve it — a live preview + a picker option — while it stays out of
// Firestore/localStorage. Abandon it and discardTypeDraft cleans it up, so no orphan is left behind.
async function createType() {
  if (!state.caps.canAdmin) return;
  if (!(await confirmDiscardIfDirty())) return; // guards a dirty entry edit or a prior draft
  const draft = newTypeSchema();
  setOverlaySchema(draft.type, draft);
  state.newTypeDraft = draft.type;
  state.typeDraftDirty = false;
  goto(toSchemaAdmin(selectType(state.view, draft.type)));
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
  return buildRoster({
    users: state.adminUsers,
    perms: state.adminPerms,
    codexId: state.currentCodexId,
    adminEmail: appConfig.auth.adminEmail,
  });
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
  action
    ?.then(() => showToast(role === 'none' ? 'Access removed' : `Access set to ${role}`))
    .catch((err) => showToast('Access change failed: ' + err.message));
}

function ensureAdminSubscriptions() {
  if (!(state.caps.canAdmin && state.fbManager && state.fbManager.isConfigured())) return;
  if (!adminUsersUnsub) {
    adminUsersUnsub = state.fbManager.subscribeUsers((users) => {
      state.adminUsers = users;
      if (inGlobalAdmin()) renderAdminNav();  // refresh the pending-grants badge
      if (inGlobalAdmin() && state.view.panel === 'access') renderAdminPanel();
    }, subError('the user roster'));
  }
  if (!adminPermsUnsub) {
    adminPermsUnsub = state.fbManager.subscribePermissions((perms) => {
      state.adminPerms = perms;
      if (inGlobalAdmin()) renderAdminNav();  // a new grant clears someone from the pending count
      if (inGlobalAdmin() && state.view.panel === 'access') renderAdminPanel();
    }, subError('access grants'));
  }
  if (!adminInvitesUnsub) {
    adminInvitesUnsub = state.fbManager.subscribeInvites((invites) => {
      state.adminInvites = invites;
      if (inGlobalAdmin() && state.view.panel === 'access') renderAdminPanel();
    }, subError('invites'));
  }
  if (!adminImagesUnsub) {
    adminImagesUnsub = state.fbManager.subscribeAllImages((images) => {
      state.adminImages = images;
      if (inGlobalAdmin() && state.view.panel === 'images') renderAdminPanel();
    }, subError('the image library'));
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

function setEditingType(type) {
  state.editingType = type;
  state.editorErrors = [];
  state.workingSchema = structuredClone(getSchema(type));
  renderTypesEditor();
}

// The schema editor's "Editing type" picker: switch which type's Structure is open, guarding (and
// discarding) an unsaved draft first so it never lingers behind the newly-selected type.
async function pickEditingType(type) {
  if (!(await confirmDiscardIfDirty())) return;
  goto(toSchemaAdmin(selectType(state.view, type)));
}

// Rebuild the structured editor (after a structural change) and refresh the preview.
function renderTypesEditor() {
  revalidateEditorErrors(); // so a shown banner rebuilds fresh, not stale (issue #28)
  const mount = typesMountEl();
  mount.innerHTML = renderSchemaEditor(state.workingSchema, {
    types: listTypes(),
    editingType: state.editingType,
    errors: state.editorErrors,
    isNewDraft: state.editingType === state.newTypeDraft,
    expanded: state.expandedFields,
    previewMode: state.structurePreview,
  });
  attachSchemaEditor(mount.querySelector('.schema-editor'), handleSchemaIntent);
  refreshWorkingPreview();
}

// Push the working schema into the overlay and refresh both preview panes. Does NOT
// rebuild the editor DOM — safe to call from text-input handlers without losing focus.
function refreshWorkingPreview() {
  // Keep an already-shown validation banner honest as edits move the schema toward valid, patching
  // it in place so a focused input isn't blurred by a rebuild (issue #28).
  if (state.editorErrors.length) {
    revalidateEditorErrors();
    updateErrorBanner(typesMountEl().querySelector('.schema-editor'), state.editorErrors);
  }
  setOverlaySchema(state.editingType, state.workingSchema);
  // A filled, per-kind schematic of the layout being built (not live entry data): both previews
  // show a representative example even for a type with no entries. See fieldKinds `previewSample`.
  const sample = previewSample(state.workingSchema);
  // The rendered entry, labelled symmetrically with the summary-card preview below so authors read
  // it as a preview and don't assume there's no structure preview (issue #28 F9).
  const entry = `<div class="se-entry-preview"><div class="se-card-preview-label">Entry preview</div>${renderEntryHTML(
    state.editingType,
    sample,
    renderCtx
  )}</div>`;
  // A live summary-card preview so the "Summary card" config gives visible feedback (the entry
  // preview above never reflects it). The card is inert here — clicks navigate only in index mode.
  const card = `<div class="se-card-preview"><div class="se-card-preview-label">Summary card preview</div>${renderSummaryCard(
    state.workingSchema,
    sample,
    renderCtx
  )}</div>`;
  updateRenderedPreview(entry + card);
  // The raw-JSON hatch shows the persist form — no in-editor `provisional` markers leak into it.
  updateRawJson(JSON.stringify(stripProvisional(state.workingSchema), null, 2));
}

// Re-evaluate the validation banner ONLY when one is already showing (a save has been blocked). We
// don't surface errors proactively mid-edit — this just keeps a shown banner in sync so it shrinks
// and clears as the author fixes things, instead of lingering stale until the next Save.
function revalidateEditorErrors() {
  if (!state.editorErrors.length) return;
  state.editorErrors = validateSchema(state.workingSchema).errors;
}

// Translate an editor intent into a working-schema transform. Structural actions rebuild
// the editor; text/checkbox edits only refresh the preview.
function handleSchemaIntent(intent) {
  const s = state.workingSchema;
  // Any edit to an unsaved draft arms the discard warning (pick-type/save aren't edits to it).
  if (state.newTypeDraft && intent.action !== 'pick-type' && intent.action !== 'save') {
    state.typeDraftDirty = true;
  }
  switch (intent.action) {
    case 'pick-type':
      // The editor's type picker navigates to that type's Structure mode (single source of truth),
      // guarding an unsaved draft on the way out.
      return pickEditingType(intent.type);
    case 'edit-label':
      state.workingSchema = { ...s, label: intent.label };
      return refreshWorkingPreview();
    case 'edit-field-label': {
      // A provisional field's key tracks its label. The edit is non-structural (no rebuild, to keep
      // input focus), so when the key changes we patch the visible key chip in place and migrate the
      // expansion set — both keyed off the old key that the rebuild would otherwise carry stale.
      const prevKey = s.fields[intent.fi]?.key;
      state.workingSchema = updateFieldLabel(s, intent.fi, intent.label);
      const newKey = state.workingSchema.fields[intent.fi]?.key;
      if (newKey && newKey !== prevKey) {
        if (state.expandedFields.delete(prevKey)) state.expandedFields.add(newKey);
        const card = typesMountEl().querySelector(`.se-field[data-fi="${intent.fi}"]`);
        if (card) {
          card.dataset.key = newKey; // keeps the collapse toggle's key in sync before any rebuild
          const chip = card.querySelector('.se-key');
          if (chip) chip.textContent = newKey;
        }
        // The summary-card selectors label their options and carry their selections by field key,
        // so a rename leaves them stale until a rebuild. Re-render just that block in place (its
        // handlers are delegated off the editor root, and the focused label input lives elsewhere,
        // so neither breaks) — the pointer migration in updateFieldLabel keeps the picks intact.
        const summary = typesMountEl().querySelector('.se-summary');
        if (summary) summary.outerHTML = summaryCardBlock(state.workingSchema);
      }
      return refreshWorkingPreview();
    }
    case 'set-title-field':
      // Repointing the title field doesn't restructure the editor — refresh the preview only.
      state.workingSchema = setTitleField(s, intent.key);
      return refreshWorkingPreview();
    case 'save':
      return saveWorkingSchema();
    case 'reset':
      return confirmRevertType();
    case 'archive':
      return confirmArchiveType();
    case 'back':
      return exitStructure();
    case 'preview':
      // Toggle the on-demand rendered preview pane. Edit JSON owns the raw mode; if raw is open,
      // Preview switches it to rendered rather than closing the pane.
      return state.structurePreview === 'rendered' ? hideStructurePreview() : showStructurePreview('rendered');
    case 'edit-json':
      return state.structurePreview === 'raw' ? hideStructurePreview() : showStructurePreview('raw');
    case 'toggle-field': {
      // The card already flipped its own DOM (see attachSchemaEditor); just record the state so it
      // survives the next wholesale rebuild. No re-render.
      if (intent.expanded) state.expandedFields.add(intent.key);
      else state.expandedFields.delete(intent.key);
      return undefined;
    }
    case 'add-field':
      return addFieldFromPalette();
    case 'remove-field':
      // Auto-repoint titleField when the deleted field was the title, so Save stays reachable
      // without a raw-JSON detour (issue #28 F7).
      state.workingSchema = repointTitleField(removeField(s, intent.fi));
      return renderTypesEditor();
    case 'move-field':
      state.workingSchema = moveField(s, intent.fi, intent.delta);
      return renderTypesEditor();
    case 'move-field-to':
      state.workingSchema = moveFieldTo(s, intent.fromFi, intent.toFi);
      return renderTypesEditor();
    case 'pick-kind':
      return changeFieldKind(intent.fi);
    case 'edit-field':
      state.workingSchema = updateField(s, intent.fi, intent.patch);
      return refreshWorkingPreview();
    case 'edit-field-structural':
      // A multi toggle adds/removes the dependent "Display as" control — rebuild the editor DOM.
      state.workingSchema = updateField(s, intent.fi, intent.patch);
      return renderTypesEditor();
    case 'edit-association':
      // A mode change toggles whether the target picker shows — rebuild the editor (structural).
      state.workingSchema = updateFieldAssociation(s, intent.fi, intent.patch);
      return renderTypesEditor();
    case 'edit-summary':
      // Summary-card picks don't restructure the editor DOM — refresh the preview only (keeps focus).
      state.workingSchema = updateSummaryCard(s, intent.patch);
      return refreshWorkingPreview();
    default:
      return undefined;
  }
}

// Add a field by picking its component from the palette (issue #31) — the flip from
// add-blank-then-retype-the-dropdown to choose-a-component-first. Cancelling adds nothing. A select
// seeds an empty options list so its editor control (and the "define ≥1 option" gate) show at once.
async function addFieldFromPalette() {
  const kind = await openComponentPalette();
  if (!kind) return;
  const s = state.workingSchema;
  // A heading's label is its rendered text, so seed a friendlier default than "New Field".
  const label = kind === 'heading' ? 'New Heading' : 'New Field';
  // `provisional`: no entry data lives under this key yet, so the key tracks the label until the type
  // is next saved (updateFieldLabel) — the fix for the frozen `newField` chip. Stripped on save.
  const field = { key: deriveKey(label, allFieldKeys(s)), label, kind, provisional: true };
  if (kind === 'select') field.options = [];
  state.workingSchema = addField(s, field);
  state.expandedFields.add(field.key); // open the new card so its label/kind are ready to edit
  renderTypesEditor();
}

// Change an existing field's component via the palette. Re-picking the current kind resolves null
// (no-op). Switching to select seeds an empty options list when the field has none yet.
async function changeFieldKind(fi) {
  const current = state.workingSchema.fields?.[fi];
  if (!current) return;
  const kind = await openComponentPalette({ current: current.kind });
  if (!kind || kind === current.kind) return;
  const patch = { kind };
  if (kind === 'select' && !Array.isArray(current.options)) patch.options = [];
  state.workingSchema = updateField(state.workingSchema, fi, patch);
  renderTypesEditor();
}

function saveWorkingSchema() {
  const result = validateSchema(state.workingSchema);
  if (!result.ok) {
    state.editorErrors = result.errors;
    renderTypesEditor();
    return;
  }
  state.editorErrors = [];
  // Save commits every provisional key: drop the markers so those keys stop tracking their labels
  // (they now hold entry data) and never land in stored data.
  state.workingSchema = stripProvisional(state.workingSchema);
  // This save is what persists a new-type draft for the first time; clear the marker so it stops
  // being treated as unsaved (and now shows in the nav like any other type).
  state.newTypeDraft = null;
  state.typeDraftDirty = false;
  saveSchemaLocal(state.editingType, state.workingSchema); // overlay + localStorage
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    const savedType = state.editingType;
    scope
      .saveSchema(savedType, state.workingSchema)
      // Server-acked: retire the draft so base is authoritative again (issue #27). The optimistic
      // onSnapshot has already refreshed base, so there's nothing to flicker back to.
      .then(() => markSchemaSynced(savedType))
      .catch((err) => showToast('Firebase save error: ' + err.message));
  }
  renderTypesEditor();
  renderTypeNav(); // reflect a rename / icon change in the sidebar
  showToast(`Saved “${state.workingSchema.label}” type`);
}

// Revert is destructive and irreversible — it discards working edits AND deletes the saved
// customization, falling back to the loaded base. Confirm before doing it.
async function confirmRevertType() {
  const ok = await openConfirm({
    title: 'Revert this type?',
    message: 'Your unsaved changes are discarded and this type is reset to its base definition. This can’t be undone.',
    confirmLabel: 'Revert changes',
  });
  if (ok) resetWorkingSchema();
}

async function confirmArchiveType() {
  const ok = await openConfirm({
    title: 'Archive this type?',
    message: 'Its entries stop showing and it drops out of the nav. Nothing is deleted — you can restore it.',
    confirmLabel: 'Archive',
  });
  if (ok) setTypeStatus(state.editingType, 'archived');
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
  if (!parsed || !Array.isArray(parsed.fields)) {
    setJsonError('A schema needs a "fields" array.');
    return;
  }
  clearJsonError();

  if (state.newTypeDraft) state.typeDraftDirty = true;
  state.workingSchema = parsed;
  const mount = typesMountEl();
  mount.innerHTML = renderSchemaEditor(state.workingSchema, {
    types: listTypes(),
    editingType: state.editingType,
    errors: state.editorErrors,
    isNewDraft: state.editingType === state.newTypeDraft,
  });
  attachSchemaEditor(mount.querySelector('.schema-editor'), handleSchemaIntent);
  setOverlaySchema(state.editingType, state.workingSchema);
  updateRenderedPreview(renderEntryHTML(state.editingType, previewSample(state.workingSchema), renderCtx));
}

// Realtime Firestore Doc Subscription
// Render the entry form from state.formData and reset the write-path state for a freshly-opened entry:
// capture the version this edit starts from and clear dirty. Edit mode holds NO live subscription — that
// was the self-echo / clobber source. Read mode picks up remote changes via the entries subscription
// (see ensureValidView); the form stays in-memory until an explicit Save.
function renderForm() {
  state.baseVersion = state.formData.version ?? 0;
  state.dirty = false;
  state.expandedContentFields.clear(); // a freshly-opened entry starts with every card collapsed
  renderFormWithoutResubscribe();
}

// Re-render the form WITHOUT touching write-path state. Use THIS (not renderForm) for any mid-edit
// re-render (e.g. a media mutation): renderForm resets state.baseVersion and clears state.dirty, which
// mid-edit would silently disarm the unsaved-changes guard AND re-baseline the conflict check.
function renderFormWithoutResubscribe() {
  setEntryCrumb(curType(), entryTitle(state.formData, curType()));

  formContainer.innerHTML = renderSchemaForm(getSchema(curType()), state.formData, renderCtx, state.expandedContentFields);

  attachFormInputListeners();
  wireComponentMounts();
  refreshBuilderPreview();
}

// Read a form control back into its stored value shape: list → array (one per line);
// multi-value reference/select → array of values (selected <option>s, or comma-split for the
// reference no-index text fallback); everything else → the raw string.
function readFieldValue(el) {
  const kind = el.dataset.fieldKind;
  if (kind === 'boolean') return el.checked;
  if (kind === 'list') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if ((kind === 'reference' || kind === 'select') && el.dataset.multi) {
    return el.multiple
      ? [...el.selectedOptions].map((o) => o.value).filter(Boolean)
      : el.value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return el.value;
}

// Attach input listeners to the scrape-able controls (text/prose/number/date/select/boolean/list/
// reference), which carry data-field-kind. Break components (hero/gallery) carry data-field-key on
// their root but no data-field-kind — they report through their mount's onChange, not this scrape
// (see wireComponentMounts).
function attachFormInputListeners() {
  formContainer.querySelectorAll('[data-field-kind]').forEach((input) => {
    const sync = (e) => {
      const el = e.target;
      const key = el.dataset.fieldKey;
      state.formData[key] = readFieldValue(el);
      // Keep the header breadcrumb's entry name live as the title field is edited.
      setEntryCrumb(curType(), entryTitle(state.formData, curType()));
      state.dirty = true;
      refreshBuilderPreview();
    };
    // `input` drives live text/textarea updates; `change` is the reliable event
    // for the reference <select> (Safari long omitted `input` on selects). The
    // handler is idempotent, so a select firing both is harmless.
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
  });
  // The click-to-toggle multi-value control (multi-select / multi-reference) reports by click, not
  // the scrape above — its root has data-field-key but no data-field-kind. Fresh nodes each render,
  // so attaching here (like the scrape) never stacks listeners.
  formContainer.querySelectorAll('.toggle-select').forEach((ctrl) => {
    ctrl.addEventListener('click', (e) => {
      const opt = e.target.closest('.toggle-option');
      if (!opt || !ctrl.contains(opt)) return;
      const now = opt.getAttribute('aria-selected') !== 'true';
      opt.setAttribute('aria-selected', String(now));
      opt.classList.toggle('is-selected', now);
      const key = ctrl.dataset.fieldKey;
      state.formData[key] = [...ctrl.querySelectorAll('.toggle-option')]
        .filter((b) => b.getAttribute('aria-selected') === 'true')
        .map((b) => b.dataset.value);
      setEntryCrumb(curType(), entryTitle(state.formData, curType()));
      state.dirty = true;
      refreshBuilderPreview();
    });
  });
}

// The mount-time context: renderCtx (image/reference resolution) plus the picker seam every
// media component's mount needs — the live image list and the editor upload/remove affordances.
function mountCtx() {
  return {
    ...renderCtx,
    listImages: () => state.imageIndex.listImages(),
    pickerOptions: {
      // Editors of the current codex may upload into it and remove images from it, inline in the picker.
      canManage: !!state.caps.canEdit,
      onUpload: uploadImageToCurrentCodex,
      onRemove: removeImageFromCurrentCodex,
    },
  };
}

// Generic imperative-wiring pass: after the form HTML is in the DOM, every component that
// declares a `mount` (hero/gallery imagery, prose inline-insert) gets wired. Components report
// edits through onChange → data[field.key], the single value path.
function wireComponentMounts() {
  const schema = getSchema(curType());
  if (!schema) return;
  const byKey = new Map();
  for (const field of schema.fields || []) byKey.set(field.key, field);
  const ctx = mountCtx();
  formContainer.querySelectorAll('[data-field-key]').forEach((el) => {
    const field = byKey.get(el.dataset.fieldKey);
    if (!field) return;
    const component = getKind(field.kind);
    if (!component?.mount) return;
    component.mount(el, {
      field,
      value: state.formData[field.key],
      onChange: (v) => {
        state.formData[field.key] = v;
        state.dirty = true;
        // selfRender components (map) own a live DOM/canvas a full form rebuild would reset;
        // they redraw themselves, so we only refresh the read preview. Others rebuild the form
        // (that's how hero/gallery thumbnails refresh).
        if (component.selfRender) refreshBuilderPreview();
        else renderFormWithoutResubscribe();
      },
      ctx,
    });
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

// The rendered entry. Media (hero at top, the gallery carousel in its section) is now part of
// the entry HTML via the registered components — no separately-appended carousel.
function currentPreviewHTML() {
  return renderEntryHTML(curType(), state.formData, renderCtx);
}

// Re-render the current builder entry & refresh both preview panels
function refreshBuilderPreview() {
  updateRenderedPreview(currentPreviewHTML());
  updateRawJson(currentEntryJson());
}

// The single write path to the reader pane. Wires the read-side components that need a post-render
// pass (carousel centering/autoplay, map canvases) wherever entry HTML is shown — the builder
// preview, the Structure entry preview, the reader. Both inits are safe no-ops on content without
// them, and initCarousel tears down the carousels it wired last time so timers never accumulate.
function updateRenderedPreview(html) {
  previewRendered.innerHTML = html;
  initCarousel(previewRendered);
  initMapReadCanvases(previewRendered);
}

// Click any content image to open it full-size. Delegated once per container so it survives the
// innerHTML re-renders both the reader preview and the admin gallery do (edit-side thumbs are excluded
// by the lightbox's own selector). previewRendered covers inline/hero/carousel; formContainer, the gallery.
attachLightbox(previewRendered);
attachLightbox(formContainer);

// Reference links in the reading view navigate to the target entry.
previewRendered.addEventListener('click', (e) => {
  // A summary card in the index opens its entry (read mode). Only the index's cards navigate —
  // the Structure surface's card preview is inert.
  const card = e.target.closest('[data-index-entry]');
  if (card && state.view.kind === 'type' && state.view.type && state.view.mode === 'index') {
    e.preventDefault();
    loadEntry(state.view.type, card.dataset.indexEntry);
    return;
  }
  const link = e.target.closest('[data-ref-type]');
  if (!link) return;
  e.preventDefault();
  loadEntry(link.dataset.refType, link.dataset.refId);
});

async function loadEntry(type, id) {
  const entry = findEntryByTypeId(type, id);
  if (!entry) {
    showToast('Entry not found');
    return;
  }
  if (!(await confirmDiscardIfDirty())) return;
  // Opening a result leaves search (loadEntry renders directly, bypassing renderView's box clear).
  if (state.view.kind === 'search') {
    navSearch.value = '';
    searchReturnView = null;
  }
  state.formData = { ...entry };
  state.navExpanded.add(type); // keep the selected entry's section open
  // Opening one entry is a deliberate drill into read (selectType alone would land on the index);
  // preserve edit if the author was already editing this type.
  const keepEditing = state.view.kind === 'type' && state.view.type === type && state.view.mode === 'edit';
  const base = selectType(state.view, type);
  state.view = normalize(keepEditing ? toEdit(base) : toRead(base), viewCtx());
  showRenderedPane();
  renderForm();
  applyViewChrome();
  highlightNav();
}

// ── Entry lifecycle: create + soft archive/restore ───────────────────────────
// A new entry is a blank-from-schema form in edit mode; its opaque id is minted on the first
// Save (newId). Archive/restore is a `status` flip persisted like any edit.

async function newEntry(type) {
  if (!state.caps.canEdit) return;
  const schema = getSchema(type);
  if (!schema) return;
  if (!(await confirmDiscardIfDirty())) return;
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
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    // Version-bumping status flip (reads current in-transaction) so it never clobbers a concurrent
    // field edit — see CodexScope.saveEntryStatus.
    scope.saveEntryStatus(type, id, status).catch((err) => showToast('Save error: ' + err.message));
  } else {
    upsertLocalEntry({ ...entry, status });
  }
  if (status === 'archived' && state.formData.id === id && curType() === type) {
    const remaining = activeEntries(state.entryIndex, type, entryLabel).filter((e) => e.id !== id);
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
async function archiveCurrentEntry() {
  if (!state.formData.id) return;
  // Surface the back-index so the author sees what points here before the ref goes dangling.
  const warning = dependentsWarning(referencesTo(state.entryIndex, getSchema, curType(), state.formData.id));
  const base = 'It’s hidden from readers but kept intact — you can restore it from the archived list.';
  const ok = await openConfirm({
    title: 'Archive this entry?',
    message: warning ? `${base} ${warning}` : base,
    confirmLabel: 'Archive',
  });
  if (ok) setEntryStatus(curType(), state.formData.id, 'archived');
}

// Permanently delete an entry (admin break-glass). Unlike archive, there's no status flag and no
// history to restore from — the entry and its ring are gone for good. Configured mode goes through
// CodexScope.deleteEntry (rules gate on isAdmin); local-only drops it from the in-memory index.
// After deleting the open entry, selects another active one — mirroring archive's navigation.
function deleteEntryPermanently(type, id) {
  if (!state.caps.canAdmin) return;
  const entry = findEntryByTypeId(type, id);
  if (!entry) return;
  const scope = codexScope();
  if (scope && scope.isConfigured()) {
    scope.deleteEntry(type, id).catch((err) => showToast('Delete error: ' + err.message));
  } else {
    const list = state.entryIndex[type];
    if (list) state.entryIndex[type] = list.filter((e) => e.id !== id);
  }
  if (state.formData.id === id && curType() === type) {
    const remaining = activeEntries(state.entryIndex, type, entryLabel).filter((e) => e.id !== id);
    state.formData = remaining[0] ? { ...remaining[0] } : { type };
    state.view = normalize(toRead(state.view), viewCtx());
    renderForm();
  }
  renderTypeNav();
  applyViewChrome();
  highlightNav();
  showToast('Deleted entry permanently');
}

// Permanently delete the entry open in the editor (header Delete button, admin-only). Irreversible —
// so the confirm spells that out and surfaces the same dependents warning as archive (the refs go
// dangling for good, not just hidden).
async function deleteCurrentEntry() {
  if (!state.caps.canAdmin || !state.formData.id) return;
  const type = curType();
  const id = state.formData.id;
  const warning = dependentsWarning(referencesTo(state.entryIndex, getSchema, type, id));
  const base = 'This permanently removes the entry and its version history. It cannot be undone or restored.';
  const ok = await openConfirm({
    title: 'Delete this entry permanently?',
    message: warning ? `${base} ${warning}` : base,
    confirmLabel: 'Delete permanently',
  });
  if (ok) deleteEntryPermanently(type, id);
}

// A prior version's timestamp, rendered for the history list. Falls back to the raw string if it
// isn't a parseable ISO date (legacy/absent updatedAt).
function formatWhen(iso) {
  if (!iso) return 'unknown time';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

// Version history for the open entry (#4): fetch the retained versions and let the author restore an
// earlier one. Restore loads the snapshot into the editor as unsaved edits (guarding a dirty draft
// first); the real write happens on the next Save, which snapshots the version it writes. The ring
// now holds the live version too (#44 — for out-of-band recovery), so drop that row here: restoring
// the current state is a no-op, and this dialog is about going *back*.
async function openEntryHistory() {
  const scope = codexScope();
  if (!(scope && scope.isConfigured()) || !state.formData.id) return;
  const type = curType();
  let history;
  try {
    history = await scope.getEntryHistory(type, state.formData.id);
  } catch (err) {
    showToast('Couldn’t load history: ' + err.message);
    return;
  }
  const rows = history
    .filter((snap) => (snap.version ?? 0) !== state.baseVersion)
    .map((snap) => ({
      version: snap.version ?? 0,
      when: formatWhen(snap.updatedAt),
      summary: entryTitle(snap, type),
      data: snap,
    }));
  const chosen = await openHistoryModal({ rows });
  if (!chosen) return;
  if (!(await confirmDiscardIfDirty())) return;
  // Load the snapshot as fresh edits. Drop its old version/updatedAt and pin version to the live
  // baseVersion so the next Save writes it forward as live+1 (saveEntry restamps both anyway); the
  // conflict guard stays keyed to the live version, not the old snapshot's.
  const { version, updatedAt, ...content } = chosen;
  state.formData = { ...content, version: state.baseVersion };
  state.dirty = true;
  renderFormWithoutResubscribe();
  showToast(`Loaded version ${version} — Save to keep it`);
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

// Return to the reader after a successful save (shared by the cloud + local paths).
function finishSaveToRead() {
  state.dirty = false;
  state.view = normalize(toRead(state.view), viewCtx());
  refreshBuilderPreview();
  renderTypeNav(); // a newly-created entry shows up in the nav
  applyViewChrome();
  highlightNav();
}

// Explicit per-entry Save (form header): mint a new entry's opaque id, then write it under a
// version guard. A matched version does a full-doc write (deletions persist); a stale version raises the
// conflict modal — keep the user's edits and let them overwrite or reload. `force` is the overwrite path.
async function saveEntry({ force = false } = {}) {
  if (!state.caps.canEdit) {
    showToast('Read-only — you don’t have edit access.');
    return;
  }
  if (!entryHasContent()) {
    showToast('Nothing to save!');
    return;
  }
  if (!state.formData.id) state.formData.id = newId();
  if (!state.formData.status) state.formData.status = 'active';

  const scope = codexScope();
  if (!(scope && scope.isConfigured())) {
    upsertLocalEntry(state.formData);
    showToast('Saved (local only — resets on reload)');
    finishSaveToRead();
    return;
  }

  try {
    const nextVersion = await scope.saveEntry(curType(), state.formData.id, state.formData, state.baseVersion, { force });
    state.formData.version = nextVersion;
    state.baseVersion = nextVersion;
    showToast('Saved entry');
    finishSaveToRead();
  } catch (err) {
    if (err.code === 'entry-too-large') {
      showToast(err.message); // already a complete, friendly sentence
      return;
    }
    if (err.code !== 'version-conflict') {
      showToast('Save error: ' + err.message);
      return;
    }
    const choice = await openConflictModal();
    if (choice === 'overwrite') {
      await saveEntry({ force: true });
    } else if (choice === 'reload') {
      const theirs = err.current || {};
      state.formData = { ...theirs };
      state.baseVersion = theirs.version ?? 0;
      finishSaveToRead();
      showToast('Reloaded the latest version');
    }
    // dismiss (null) → stay in edit with the unsaved edits intact
  }
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

// Reflect the real cloud-connection state in the status badge (see utils/syncBadge.js for the model).
function renderSyncStatus() {
  const configured = !!(state.fbManager && state.fbManager.isConfigured());
  const { label, dotClass, toneClass } = syncBadge({ configured, connection: state.connection });
  // One holder carries this now: the app header's `#active-file-indicator` (tagged `[data-sync-badge]`).
  // The query stays plural so any future holder is picked up without touching this.
  for (const el of document.querySelectorAll('[data-sync-badge]')) {
    el.className = `compliance-badge${toneClass}`;
    el.title = label; // full text stays available when the label is hidden on a narrow toolbar
    el.innerHTML = `<span class="${dotClass}"></span> <span class="sync-label">${label}</span>`;
  }
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

// Global error boundary. Last-resort catches so a failure surfaces instead of
// leaving a frozen or blank app: an uncaught promise rejection toasts (non-fatal — the app is usually
// still usable), and a resource/script `error` is logged for diagnosis. A *fatal boot* failure below
// escalates to the full error screen. Registered before boot so a throw during init is still caught.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection', e.reason);
  showToast('Something went wrong. If it persists, reload the page.');
});
window.addEventListener('error', (e) => {
  console.error('Uncaught error', e.error || e.message);
});

// Bootstrap Auth & Application. initAuth() resolves capabilities and renders the right screen;
// the workspace (initial nav render + content subscriptions) is set up by showWorkspace() once read
// access is confirmed — not here — so no codex reads fire before authorization. A synchronous throw
// here lands on the dedicated error screen instead.
try {
  initAuth();
  renderSyncStatus();
} catch (err) {
  console.error('Boot failed', err);
  showError('The app failed to start. Reloading usually fixes it.');
}
