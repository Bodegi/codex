export function renderRegionForm(data) {
  return `
    <div class="form-section">
      <div class="section-header">⛰️ Region Specification</div>
      <div class="form-grid">
        <div class="form-group">
          <label for="region-id">Region ID</label>
          <input type="text" id="region-id" class="form-control" value="${data.id || ''}" placeholder="e.g. ironvein_peaks">
        </div>
        <div class="form-group">
          <label for="region-name">Region Name</label>
          <input type="text" id="region-name" class="form-control" value="${data.name || ''}" placeholder="e.g. Ironvein Peaks">
        </div>
        <div class="form-group">
          <label for="region-climate">Climate</label>
          <input type="text" id="region-climate" class="form-control" value="${data.climate || ''}" placeholder="e.g. Alpine Cold">
        </div>
        <div class="form-group">
          <label for="region-dominantCivilization">Dominant Civilization</label>
          <input type="text" id="region-dominantCivilization" class="form-control" value="${data.dominantCivilization || ''}" placeholder="e.g. Dwarves">
        </div>
        <div class="form-group form-grid-full">
          <label for="region-geography">Geography</label>
          <textarea id="region-geography" class="form-control" rows="2">${data.geography || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="region-settlements">Settlements</label>
          <input type="text" id="region-settlements" class="form-control" value="${data.settlements || ''}">
        </div>
        <div class="form-group">
          <label for="region-tradeRoutes">Trade Routes</label>
          <input type="text" id="region-tradeRoutes" class="form-control" value="${data.tradeRoutes || ''}">
        </div>
        <div class="form-group form-grid-full">
          <label for="region-resources">Resources</label>
          <input type="text" id="region-resources" class="form-control" value="${data.resources || ''}">
        </div>
        <div class="form-group form-grid-full">
          <label for="region-storyHooks">Story Hooks</label>
          <textarea id="region-storyHooks" class="form-control" rows="2">${data.storyHooks || ''}</textarea>
        </div>
        <div class="form-group form-grid-full">
          <label for="region-pointsOfInterest">Points of Interest</label>
          <input type="text" id="region-pointsOfInterest" class="form-control" value="${data.pointsOfInterest || ''}">
        </div>
      </div>
    </div>
  `;
}
