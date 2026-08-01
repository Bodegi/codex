import { renderMediaControls } from './mediaControls.js';

export function renderModForm(data) {
  return `
    <div class="form-section">
      <div class="section-header">⚙️ Mod Specification</div>
      <div class="form-grid">
        <div class="form-group">
          <label for="mod-id">Mod ID</label>
          <input type="text" id="mod-id" class="form-control" value="${data.id || ''}" placeholder="e.g. create">
        </div>
        <div class="form-group">
          <label for="mod-name">Mod Name</label>
          <input type="text" id="mod-name" class="form-control" value="${data.name || ''}" placeholder="e.g. Create">
        </div>
        <div class="form-group">
          <label for="mod-civilization">Assigned Civilization</label>
          <input type="text" id="mod-civilization" class="form-control" value="${data.civilization || ''}" placeholder="e.g. Dwarves">
        </div>
        <div class="form-group">
          <label for="mod-regionPlacement">Region Placement</label>
          <input type="text" id="mod-regionPlacement" class="form-control" value="${data.regionPlacement || ''}">
        </div>
        <div class="form-group form-grid-full">
          <label for="mod-gameplayPurpose">Gameplay Purpose</label>
          <textarea id="mod-gameplayPurpose" class="form-control" rows="2">${data.gameplayPurpose || ''}</textarea>
        </div>
        <div class="form-group form-grid-full">
          <label for="mod-architecturalThemes">Architectural Themes</label>
          <textarea id="mod-architecturalThemes" class="form-control" rows="2">${data.architecturalThemes || ''}</textarea>
        </div>
        <div class="form-group form-grid-full">
          <label for="mod-typicalBuildings">Typical Buildings</label>
          <input type="text" id="mod-typicalBuildings" class="form-control" value="${data.typicalBuildings || ''}">
        </div>
        <div class="form-group form-grid-full">
          <label for="mod-progression">Progression</label>
          <textarea id="mod-progression" class="form-control" rows="2">${data.progression || ''}</textarea>
        </div>
        <div class="form-group form-grid-full">
          <label for="mod-integration">Integration</label>
          <textarea id="mod-integration" class="form-control" rows="2">${data.integration || ''}</textarea>
        </div>
      </div>
    </div>

    ${renderMediaControls(data)}
  `;
}
