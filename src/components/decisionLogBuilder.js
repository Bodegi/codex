export function renderDecisionLogForm(data) {
  return `
    <div class="form-section">
      <div class="section-header">📜 Architectural Decision Record (ADR)</div>
      <div class="form-grid">
        <div class="form-group">
          <label for="adr-id">Decision ID</label>
          <input type="text" id="adr-id" class="form-control" value="${data.id || ''}" placeholder="e.g. adr-001">
        </div>
        <div class="form-group">
          <label for="adr-date">Date</label>
          <input type="date" id="adr-date" class="form-control" value="${data.date || new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group form-grid-full">
          <label for="adr-title">Decision Title</label>
          <input type="text" id="adr-title" class="form-control" value="${data.title || ''}" placeholder="e.g. Civilization-First Mod Allocation">
        </div>
        <div class="form-group form-grid-full">
          <label for="adr-whatChanged">What Changed</label>
          <textarea id="adr-whatChanged" class="form-control" rows="2">${data.whatChanged || ''}</textarea>
        </div>
        <div class="form-group form-grid-full">
          <label for="adr-why">Why (Rationale)</label>
          <textarea id="adr-why" class="form-control" rows="2">${data.why || ''}</textarea>
        </div>
        <div class="form-group form-grid-full">
          <label for="adr-alternativesConsidered">Alternatives Considered</label>
          <textarea id="adr-alternativesConsidered" class="form-control" rows="2">${data.alternativesConsidered || ''}</textarea>
        </div>
        <div class="form-group form-grid-full">
          <label for="adr-longTermImplications">Long-Term Implications</label>
          <textarea id="adr-longTermImplications" class="form-control" rows="2">${data.longTermImplications || ''}</textarea>
        </div>
      </div>
    </div>
  `;
}
