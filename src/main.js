/**
 * ATM10 Design Codex Studio — Main Application Bootstrap
 */

import { seedCivilizations, seedMods, seedRegions, seedDecisionLogs } from './data/seedData.js';
import { renderEntryHTML, formatInline } from './utils/entryRenderer.js';
import { FirebaseManager } from './utils/firebase.js';
import { DiscordAuth } from './utils/discordAuth.js';

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
import { renderMatrixView } from './components/matrixView.js';
import { renderAtlasView, initAtlasCanvas } from './components/atlasView.js';
import { renderAuthGateway } from './components/authGateway.js';
import { renderMediaControls, attachMediaControls } from './components/mediaControls.js';
import { renderCarousel, initCarousel } from './components/carousel.js';
import { resolve as resolvePoolImage } from './utils/imagePool.js';

// Tabs whose entries support imagery (hero / carousel / inline)
const MEDIA_TABS = ['civilization', 'mod', 'region'];

// Last-focused prose textarea, target for inline-image insertion
let lastFocusedProseField = null;

// Tabs that represent a single editable JSON entry
const BUILDER_TABS = ['civilization', 'mod', 'region', 'decision'];

// Application State
const state = {
  currentTab: 'civilization',
  currentViewMode: 'rendered',
  formData: { ...seedCivilizations[0] },
  fileHandle: null,
  currentFileName: null,
  firebaseConfig: JSON.parse(localStorage.getItem('atm10_firebase_config') || 'null'),
  discordClientId: localStorage.getItem('atm10_discord_client_id') || '',
  fbManager: null,
  discordAuth: null,
  activeDocUnsubscribe: null,
  liveDocId: null,
  // Types tab (schema editor) working state
  editingType: 'civilization',
  workingSchema: null,
  editorErrors: []
};

// Initialize Firebase & Discord Auth Manager
if (state.firebaseConfig) {
  state.fbManager = new FirebaseManager(state.firebaseConfig);
}
state.discordAuth = new DiscordAuth(state.discordClientId);

// Overlay any Firestore-authored schemas on top of the bundled seed schemas. Seed is
// the offline source of truth; this only adds/overrides when a project is configured.
let schemaUnsubscribe = null;
function subscribeSchemaOverlay() {
  if (schemaUnsubscribe) { schemaUnsubscribe(); schemaUnsubscribe = null; }
  if (!(state.fbManager && state.fbManager.isConfigured())) return;
  schemaUnsubscribe = state.fbManager.subscribeSchemas((schemas) => {
    schemas.forEach((s) => { if (s && s.type) setOverlaySchema(s.type, s); });
    if (BUILDER_TABS.includes(state.currentTab)) renderFormWithoutResubscribe();
  });
}
// Local schema edits (from the Types tab) survive a reload via localStorage; a Firestore
// subscription then wins per-type when configured. Hydrate before the first render.
hydrateOverlayFromStorage();
subscribeSchemaOverlay();

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
const presetButtonsContainer = document.getElementById('preset-buttons');
const previewRendered = document.getElementById('preview-content-rendered');
const previewRawTextarea = document.getElementById('raw-json-textarea');
const previewRawContainer = document.getElementById('preview-content-raw');
const jsonErrorEl = document.getElementById('json-error');
const toastContainer = document.getElementById('toast-container');
const activeFileIndicator = document.getElementById('active-file-indicator');
const fallbackFileInput = document.getElementById('fallback-file-input');
const userProfileBadge = document.getElementById('user-profile-badge');
const gatewayContainer = document.getElementById('gateway-container');
const mainWorkspace = document.getElementById('main-workspace');

// Firebase Modal References
const fbDialog = document.getElementById('firebase-dialog');
const btnFbSettings = document.getElementById('btn-firebase-settings');
const btnCloseFbDialog = document.getElementById('btn-close-fb-dialog');
const fbForm = document.getElementById('firebase-form');

// Check OAuth callback token from URL
async function initAuth() {
  await state.discordAuth.handleCallback();
  renderUserBadge();
  checkAuthAndRenderState();
}

// Render User Avatar Profile Badge
function renderUserBadge() {
  const user = state.discordAuth.currentUser;
  if (user && user.isAuthorized) {
    userProfileBadge.innerHTML = `
      <div class="user-badge" title="Logged in as ${user.username}">
        <img src="${user.avatar}" class="user-avatar" alt="${user.username}">
        <span>${user.globalName || user.username}</span>
        <button id="btn-logout" class="btn btn-secondary btn-sm" style="margin-left:4px; padding:2px 6px;">Sign Out</button>
      </div>
    `;
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      state.discordAuth.logout();
      renderUserBadge();
      checkAuthAndRenderState();
      showToast('Signed out of Discord');
    });
  } else {
    userProfileBadge.innerHTML = `
      <button id="btn-discord-login" class="btn btn-discord">
        <span>💬</span> Login with Discord
      </button>
    `;
    document.getElementById('btn-discord-login')?.addEventListener('click', () => {
      try {
        state.discordAuth.login();
      } catch (err) {
        showToast(err.message);
        fbDialog.showModal();
      }
    });
  }
}

// Private Workspace Auth Enforcement
function checkAuthAndRenderState() {
  const isAuth = state.discordAuth.isAuthenticated();

  if (!isAuth && state.discordClientId) {
    // Show private gateway overlay
    mainWorkspace.classList.add('hidden');
    gatewayContainer.classList.remove('hidden');
    gatewayContainer.innerHTML = renderAuthGateway(state.discordAuth);

    document.getElementById('gateway-login-btn')?.addEventListener('click', () => {
      try {
        state.discordAuth.login();
      } catch (err) {
        showToast(err.message);
        fbDialog.showModal();
      }
    });

    document.getElementById('gateway-logout-btn')?.addEventListener('click', () => {
      state.discordAuth.logout();
      renderUserBadge();
      checkAuthAndRenderState();
    });
  } else {
    // Show main workspace
    gatewayContainer.classList.add('hidden');
    mainWorkspace.classList.remove('hidden');
  }
}

// Tab Navigation Listener
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentTab = btn.dataset.tab;
    switchTab(state.currentTab);
  });
});

// View Mode Switcher
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

// Switch Tab Logic
function switchTab(tabKey) {
  renderPresets(tabKey);

  switch (tabKey) {
    case 'civilization':
      state.formData = { ...seedCivilizations[0] };
      renderForm();
      break;
    case 'mod':
      state.formData = { ...seedMods[0] };
      renderForm();
      break;
    case 'region':
      state.formData = { ...seedRegions[0] };
      renderForm();
      break;
    case 'decision':
      state.formData = { ...seedDecisionLogs[0] };
      renderForm();
      break;
    case 'matrix':
      formContainer.innerHTML = renderMatrixView();
      updateRenderedPreview('');
      updateRawJson('');
      break;
    case 'atlas':
      formContainer.innerHTML = renderAtlasView();
      initAtlasCanvas(state.fbManager);
      updateRenderedPreview(formatInline('The World Atlas is interactive — drop waypoints, draw roads, and outline territories directly on the map. Changes sync to the cloud automatically.'));
      updateRawJson('');
      break;
    case 'types':
      enterTypesTab();
      break;
  }
}

// Render Presets Bar
function renderPresets(tabKey) {
  presetButtonsContainer.innerHTML = '';

  let list = [];
  if (tabKey === 'civilization') list = seedCivilizations;
  else if (tabKey === 'mod') list = seedMods;
  else if (tabKey === 'region') list = seedRegions;
  else if (tabKey === 'decision') list = seedDecisionLogs;

  list.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'chip-btn';
    btn.textContent = item.name || item.title || item.id;
    btn.addEventListener('click', () => {
      state.formData = { ...item };
      state.fileHandle = null;
      state.currentFileName = null;
      renderForm();
      subscribeToLiveFirestoreDoc(state.currentTab, state.formData.id);
      showToast(`Loaded preset: ${item.name || item.title}`);
    });
    presetButtonsContainer.appendChild(btn);
  });
}

// ── Types tab: in-app schema editor ────────────────────────────────────────
// The editor holds a deep-cloned working schema. Structural edits rebuild the editor
// DOM; text edits don't (to keep input focus). Every change re-renders the live preview
// through the in-memory overlay. Nothing persists until Save; Reset returns to seed.

// A representative entry to render the type's read-view preview against.
function sampleForType(type) {
  const list = SEED_BY_TYPE[type] || [];
  return list.length ? list[0] : {};
}

function enterTypesTab() {
  setEditingType(state.editingType || 'civilization');
}

function setEditingType(type) {
  state.editingType = type;
  state.editorErrors = [];
  state.workingSchema = structuredClone(getSchema(type));
  renderTypesEditor();
}

// Rebuild the structured editor (after a structural change) and refresh the preview.
function renderTypesEditor() {
  formContainer.innerHTML = renderSchemaEditor(state.workingSchema, {
    types: listTypes(),
    editingType: state.editingType,
    errors: state.editorErrors,
  });
  attachSchemaEditor(formContainer.querySelector('.schema-editor'), handleSchemaIntent);
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
  if (state.fbManager && state.fbManager.isConfigured()) {
    state.fbManager
      .saveSchema(state.editingType, state.workingSchema)
      .catch((err) => showToast('Firebase save error: ' + err.message));
  }
  renderTypesEditor();
  showToast(`Saved “${state.editingType}” type`);
}

function resetWorkingSchema() {
  resetSchema(state.editingType); // overlay -> seed + drop localStorage entry
  if (state.fbManager && state.fbManager.isConfigured()) {
    state.fbManager.deleteSchema(state.editingType).catch((err) => showToast('Firebase reset error: ' + err.message));
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
  formContainer.innerHTML = renderSchemaEditor(state.workingSchema, {
    types: listTypes(),
    editingType: state.editingType,
    errors: state.editorErrors,
  });
  attachSchemaEditor(formContainer.querySelector('.schema-editor'), handleSchemaIntent);
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

  if (state.fbManager && state.fbManager.isConfigured() && id) {
    state.liveDocId = id;
    state.activeDocUnsubscribe = state.fbManager.subscribeToDoc(type, id, (remoteData) => {
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
  state.fileHandle = null;
  state.currentFileName = null;
  setActiveTab(type);
  renderForm();
  showToast(`Opened ${entryLabel(entry)}`);
}

function updateRawJson(jsonText) {
  // Single-entry builder tabs edit an entry; the Types tab edits a schema — both editable.
  previewRawTextarea.readOnly = !(BUILDER_TABS.includes(state.currentTab) || state.currentTab === 'types');
  // Never overwrite the textarea while the user is actively typing in it
  if (document.activeElement === previewRawTextarea) return;
  previewRawTextarea.value = jsonText;
  clearJsonError();
}

// Persist the current entry to Firebase — shared by the form and JSON editors
function autoSaveToFirebase() {
  if (state.fbManager && state.fbManager.isConfigured()) {
    state.fbManager.saveDoc(state.currentTab, state.formData.id || 'draft', state.formData);
  }
}

// Apply a live edit from the Raw JSON editor back into form state
function applyRawJsonEdit() {
  if (state.currentTab === 'types') return applySchemaRawJsonEdit();
  if (!BUILDER_TABS.includes(state.currentTab)) return;

  let parsed;
  try {
    parsed = JSON.parse(previewRawTextarea.value);
  } catch (err) {
    setJsonError(err.message);
    return;
  }
  clearJsonError();

  state.formData = parsed;
  // reflect edits in the reading view; leave the textarea as typed
  updateRenderedPreview(currentPreviewHTML());
  initCarousel(previewRendered);
  autoSaveToFirebase();
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

// Raw JSON editor — live-apply on valid input, resync the form on blur
previewRawTextarea.addEventListener('input', applyRawJsonEdit);
previewRawTextarea.addEventListener('change', () => {
  if (state.currentTab === 'types') {
    try {
      JSON.parse(previewRawTextarea.value);
    } catch {
      return; // leave the invalid text and error visible for the user to fix
    }
    renderTypesEditor(); // rebuild editor + normalize the schema JSON
    return;
  }
  if (!BUILDER_TABS.includes(state.currentTab)) return;
  try {
    JSON.parse(previewRawTextarea.value);
  } catch {
    return; // leave the invalid text and error visible for the user to fix
  }
  renderFormWithoutResubscribe(); // resync the left form and normalize the JSON
});

// 📂 Open File Handler
document.getElementById('btn-open-file').addEventListener('click', async () => {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Codex JSON Files (*.json)',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const file = await handle.getFile();
      const text = await file.text();

      state.fileHandle = handle;
      state.currentFileName = file.name;
      loadJsonIntoState(text, file.name);
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Error opening file: ' + err.message);
    }
  } else {
    fallbackFileInput.click();
  }
});

fallbackFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    state.fileHandle = null;
    state.currentFileName = file.name;
    loadJsonIntoState(event.target.result, file.name);
  };
  reader.readAsText(file);
});

// Load a Codex JSON entry into state
function loadJsonIntoState(text, filename) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    showToast(`⚠️ ${filename} is not valid JSON`);
    return;
  }

  state.formData = parsed;

  setActiveTab(BUILDER_TABS.includes(parsed.type) ? parsed.type : 'civilization');

  renderForm();
  renderSyncStatus();
  showToast(`📂 Opened ${filename}`);
}

function setActiveTab(tabKey) {
  state.currentTab = tabKey;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabKey);
  });
  renderPresets(tabKey);
}

// 💾 Save File (Firebase DB + Local File System Access)
document.getElementById('btn-save-disk').addEventListener('click', async () => {
  if (!entryHasContent()) {
    showToast('Nothing to save!');
    return;
  }

  // Structured JSON is the source of truth (both cloud and local file)
  const jsonPayload = currentEntryJson();

  // Save to Firebase Firestore
  if (state.fbManager && state.fbManager.isConfigured()) {
    try {
      await state.fbManager.saveDoc(state.currentTab, state.formData.id || 'entry', state.formData);
      showToast('🔥 Saved entry to Firebase Cloud DB!');
    } catch (err) {
      showToast('Firebase save error: ' + err.message);
    }
  }

  // Save to Local File System
  if (state.fileHandle && 'createWritable' in state.fileHandle) {
    try {
      const writable = await state.fileHandle.createWritable();
      await writable.write(jsonPayload);
      await writable.close();
      renderSyncStatus();
      showToast(`💾 Saved changes to ${state.currentFileName}!`);
      return;
    } catch (err) {
      console.warn('Local file overwrite failed', err);
    }
  }

  // Native Save File Picker
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: `${state.formData.id || 'codex-entry'}.json`,
        types: [{
          description: 'Codex JSON File (*.json)',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonPayload);
      await writable.close();

      state.fileHandle = handle;
      state.currentFileName = handle.name;
      renderSyncStatus();
      showToast(`💾 Saved ${handle.name} to disk!`);
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Save error: ' + err.message);
    }
  }
});

// Firebase & Discord Settings Dialog
btnFbSettings.addEventListener('click', () => {
  if (state.firebaseConfig) {
    document.getElementById('fb-apiKey').value = state.firebaseConfig.apiKey || '';
    document.getElementById('fb-authDomain').value = state.firebaseConfig.authDomain || '';
    document.getElementById('fb-projectId').value = state.firebaseConfig.projectId || '';
  }
  document.getElementById('fb-discordClientId').value = state.discordClientId || '';
  document.getElementById('fb-allowedDiscordIds').value = (state.discordAuth.getAllowedUserIds() || []).join(', ');
  fbDialog.showModal();
});

btnCloseFbDialog.addEventListener('click', () => {
  fbDialog.close();
});

fbForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const apiKey = document.getElementById('fb-apiKey').value.trim();
  const authDomain = document.getElementById('fb-authDomain').value.trim();
  const projectId = document.getElementById('fb-projectId').value.trim();
  const clientId = document.getElementById('fb-discordClientId').value.trim();
  const allowedIdsStr = document.getElementById('fb-allowedDiscordIds').value.trim();

  if (clientId) {
    state.discordClientId = clientId;
    localStorage.setItem('atm10_discord_client_id', clientId);
    state.discordAuth.clientId = clientId;
  }

  if (allowedIdsStr) {
    const ids = allowedIdsStr.split(',').map(s => s.trim()).filter(Boolean);
    state.discordAuth.setAllowedUserIds(ids);
  }

  if (apiKey && projectId) {
    const config = { apiKey, authDomain, projectId };
    state.firebaseConfig = config;
    state.fbManager = new FirebaseManager(config);
    subscribeToLiveFirestoreDoc(state.currentTab, state.formData.id);
    subscribeSchemaOverlay();
    showToast('🔥 Firebase DB & Real-time Sync Connected!');
  }

  fbDialog.close();
  renderUserBadge();
  checkAuthAndRenderState();
  renderSyncStatus();
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
  if (state.currentFileName) label += ` · ${state.currentFileName}`;

  activeFileIndicator.className = `compliance-badge${configured ? '' : ' is-local'}`;
  activeFileIndicator.innerHTML = `<span class="${configured ? 'pulse-dot' : 'idle-dot'}"></span> ${label}`;
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✨</span> ${message}`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Bootstrap Auth & Application
initAuth();
switchTab('civilization');
renderSyncStatus();
