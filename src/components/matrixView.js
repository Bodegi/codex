// Parked component (not in nav) — awaiting the summary-card redesign. Seed dependency removed
// with the Phase-4 seed teardown; it now takes its data as a parameter (empty until rewired).
export function renderMatrixView(civilizations = []) {
  const cardsHtml = civilizations.map(civ => `
    <div class="matrix-card">
      <div class="matrix-title">${civ.name}</div>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">${civ.philosophy}</p>
      
      <div style="margin-bottom:8px;">
        <strong style="font-size:11px; color:var(--accent-gold); display:block;">Primary Gameplay Mods:</strong>
        ${civ.assignedMods.split(',').map(mod => `<span class="matrix-tag">${mod.trim()}</span>`).join('')}
      </div>

      <div style="margin-bottom:8px;">
        <strong style="font-size:11px; color:var(--accent-emerald); display:block;">Trade Exports:</strong>
        <span style="font-size:12px; color:var(--text-main);">${civ.exports}</span>
      </div>

      <div>
        <strong style="font-size:11px; color:var(--accent-crimson); display:block;">Trade Imports:</strong>
        <span style="font-size:12px; color:var(--text-main);">${civ.imports}</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="form-section">
      <div class="section-header">World Ecosystem & Civilization Matrix</div>
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
        Visual summary of how all 7 core civilizations interlock through gameplay mods, resource exports, and trade networks.
      </p>
      <div class="matrix-container">
        ${cardsHtml}
      </div>
    </div>
  `;
}
