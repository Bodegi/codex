/**
 * ATM10 Design Codex Studio — Main Application Bootstrap
 */

import { seedCivilizations, seedMods, seedRegions, seedDecisionLogs } from './data/seedData.js';
import { 
  compileCivilizationMarkdown, 
  compileModMarkdown, 
  compileRegionMarkdown, 
  compileDecisionLogMarkdown, 
  renderMarkdownToHTML 
} from './utils/markdownCompiler.js';
import { FirebaseManager } from './utils/firebase.js';
import { DiscordAuth } from './utils/discordAuth.js';

import { renderCivilizationForm } from './components/civilizationBuilder.js';
import { renderModForm } from './components/modBuilder.js';
import { renderRegionForm } from './components/regionBuilder.js';
import { renderDecisionLogForm } from './components/decisionLogBuilder.js';
import { renderMatrixView } from './components/matrixView.js';
import { renderAtlasView, initAtlasCanvas } from './components/atlasView.js';
import { renderAuthGateway } from './components/authGateway.js';

// Tabs that represent a single editable JSON entry
const BUILDER_TABS = ['civilization', 'mod', 'region', 'decision'];

// Application State
const state = {
  currentTab: 'civilization',
  currentViewMode: 'rendered',
  formData: { ...seedCivilizations[0] },
  compiledMarkdown: '',
  fileHandle: null,
  currentFileName: null,
  firebaseConfig: JSON.parse(localStorage.getItem('atm10_firebase_config') || 'null'),
  discordClientId: localStorage.getItem('atm10_discord_client_id') || '',
  fbManager: null,
  discordAuth: null,
  activeDocUnsubscribe: null,
  liveDocId: null
};

// Initialize Firebase & Discord Auth Manager
if (state.firebaseConfig) {
  state.fbManager = new FirebaseManager(state.firebaseConfig);
}
state.discordAuth = new DiscordAuth(state.discordClientId);

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
      updatePreview('', '');
      break;
    case 'atlas':
      formContainer.innerHTML = renderAtlasView();
      initAtlasCanvas(state.fbManager);
      updatePreview('The World Atlas is interactive — drop waypoints, draw roads, and outline territories directly on the map. Changes sync to the cloud automatically.', '');
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
  if (state.currentTab === 'civilization') {
    formContainer.innerHTML = renderCivilizationForm(state.formData);
  } else if (state.currentTab === 'mod') {
    formContainer.innerHTML = renderModForm(state.formData);
  } else if (state.currentTab === 'region') {
    formContainer.innerHTML = renderRegionForm(state.formData);
  } else if (state.currentTab === 'decision') {
    formContainer.innerHTML = renderDecisionLogForm(state.formData);
  }

  attachFormInputListeners();
  compileAndRefreshMarkdown();
}

// Attach Input Listeners & Auto-Sync to Firebase
function attachFormInputListeners() {
  const inputs = formContainer.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const fieldId = e.target.id;
      const key = fieldId.replace(/^(civ|mod|region|adr)-/, '');
      state.formData[key] = e.target.value;
      compileAndRefreshMarkdown();
      autoSaveToFirebase();
    });
  });
}

// Serialize the current entry as pretty JSON (the stored format)
function currentEntryJson() {
  return JSON.stringify({ ...state.formData, type: state.currentTab }, null, 2);
}

// Compile the current entry's markdown (drives the rendered reading view)
function compileMarkdownForCurrent() {
  if (state.currentTab === 'civilization') return compileCivilizationMarkdown(state.formData);
  if (state.currentTab === 'mod') return compileModMarkdown(state.formData);
  if (state.currentTab === 'region') return compileRegionMarkdown(state.formData);
  if (state.currentTab === 'decision') return compileDecisionLogMarkdown(state.formData);
  return '';
}

// Recompile from form state & refresh both preview panels
function compileAndRefreshMarkdown() {
  const md = compileMarkdownForCurrent();
  state.compiledMarkdown = md;
  updatePreview(md, currentEntryJson());
}

// Update Preview Panels — rendered view from markdown, raw view from JSON
function updatePreview(markdownText, jsonText = '') {
  updateRenderedPreview(markdownText);
  updateRawJson(jsonText);
}

function updateRenderedPreview(markdownText) {
  previewRendered.innerHTML = renderMarkdownToHTML(markdownText);
}

function updateRawJson(jsonText) {
  // Only single-entry builder tabs are editable
  previewRawTextarea.readOnly = !BUILDER_TABS.includes(state.currentTab);
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
  const md = compileMarkdownForCurrent();
  state.compiledMarkdown = md;
  updateRenderedPreview(md); // reflect edits in the reading view; leave the textarea as typed
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
  if (!state.compiledMarkdown) {
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
