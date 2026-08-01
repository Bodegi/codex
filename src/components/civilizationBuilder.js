export function renderCivilizationForm(data) {
  return `
    <div class="form-section">
      <div class="section-header">🏰 Core Identity</div>
      <div class="form-grid">
        <div class="form-group">
          <label for="civ-id">Civilization ID</label>
          <input type="text" id="civ-id" class="form-control" value="${data.id || ''}" placeholder="e.g. dwarves">
        </div>
        <div class="form-group">
          <label for="civ-name">Title / Name</label>
          <input type="text" id="civ-name" class="form-control" value="${data.name || ''}" placeholder="e.g. Dwarves — Masters of Industry">
        </div>
        <div class="form-group form-grid-full">
          <label for="civ-philosophy">Philosophy</label>
          <textarea id="civ-philosophy" class="form-control" rows="2">${data.philosophy || ''}</textarea>
        </div>
        <div class="form-group form-grid-full">
          <label for="civ-history">History</label>
          <textarea id="civ-history" class="form-control" rows="2">${data.history || ''}</textarea>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="section-header">🎨 Visual Languages & Architecture</div>
      <div class="form-grid">
        <div class="form-group form-grid-full">
          <label for="civ-architecture">Architecture Style</label>
          <textarea id="civ-architecture" class="form-control" rows="2">${data.architecture || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="civ-materialPalette">Material Palette (Blocks)</label>
          <input type="text" id="civ-materialPalette" class="form-control" value="${data.materialPalette || ''}" placeholder="Stone Brick, Andesite, Copper, Lava">
        </div>
        <div class="form-group">
          <label for="civ-silhouette">Silhouette</label>
          <input type="text" id="civ-silhouette" class="form-control" value="${data.silhouette || ''}" placeholder="Skyline shape">
        </div>
        <div class="form-group">
          <label for="civ-infrastructure">Infrastructure Style</label>
          <input type="text" id="civ-infrastructure" class="form-control" value="${data.infrastructure || ''}" placeholder="Tunnels and mine rail">
        </div>
        <div class="form-group">
          <label for="civ-geography">Geography & Terrain</label>
          <input type="text" id="civ-geography" class="form-control" value="${data.geography || ''}" placeholder="Mountains, cliffs, caves">
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="section-header">⚖️ Economy & Trade Relationships</div>
      <div class="form-grid">
        <div class="form-group form-grid-full">
          <label for="civ-economy">Economy</label>
          <input type="text" id="civ-economy" class="form-control" value="${data.economy || ''}">
        </div>
        <div class="form-group">
          <label for="civ-exports">Trade Exports</label>
          <input type="text" id="civ-exports" class="form-control" value="${data.exports || ''}" placeholder="Metals, Machinery, Tools">
        </div>
        <div class="form-group">
          <label for="civ-imports">Trade Imports</label>
          <input type="text" id="civ-imports" class="form-control" value="${data.imports || ''}" placeholder="Food, Magic, Logistics">
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="section-header">⚙️ Gameplay Systems & Settlements</div>
      <div class="form-grid">
        <div class="form-group form-grid-full">
          <label for="civ-assignedMods">Assigned Mods</label>
          <input type="text" id="civ-assignedMods" class="form-control" value="${data.assignedMods || ''}" placeholder="Create, Mekanism, Industrial Foregoing">
        </div>
        <div class="form-group">
          <label for="civ-majorCities">Major Cities</label>
          <input type="text" id="civ-majorCities" class="form-control" value="${data.majorCities || ''}">
        </div>
        <div class="form-group">
          <label for="civ-minorSettlements">Minor Settlements</label>
          <input type="text" id="civ-minorSettlements" class="form-control" value="${data.minorSettlements || ''}">
        </div>
        <div class="form-group">
          <label for="civ-landmarks">Landmarks</label>
          <input type="text" id="civ-landmarks" class="form-control" value="${data.landmarks || ''}">
        </div>
        <div class="form-group">
          <label for="civ-designPatterns">Design Patterns</label>
          <input type="text" id="civ-designPatterns" class="form-control" value="${data.designPatterns || ''}">
        </div>
        <div class="form-group form-grid-full">
          <label for="civ-futureExpansion">Future Expansion</label>
          <textarea id="civ-futureExpansion" class="form-control" rows="2">${data.futureExpansion || ''}</textarea>
        </div>
      </div>
    </div>
  `;
}
