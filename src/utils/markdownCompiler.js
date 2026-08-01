/**
 * ATM10 Design Codex Markdown & YAML Frontmatter Compiler
 */

export function compileCivilizationMarkdown(data) {
  const yamlFrontmatter = `---
id: "${data.id || 'new-civ'}"
title: "${data.name || 'Civilization Name'}"
type: "civilization"
primary_mods: [${(data.assignedMods || '').split(',').map(m => `"${m.trim()}"`).join(', ')}]
exports: [${(data.exports || '').split(',').map(e => `"${e.trim()}"`).join(', ')}]
imports: [${(data.imports || '').split(',').map(i => `"${i.trim()}"`).join(', ')}]
infrastructure_style: "${data.infrastructure || ''}"
updated_at: "${new Date().toISOString()}"
---`;

  const body = `# ${data.name || 'Civilization Name'}

## Philosophy
${data.philosophy || 'No philosophy specified.'}

## History
${data.history || 'No history specified.'}

## Geography
${data.geography || 'No geography specified.'}

## Architecture
${data.architecture || 'No architectural details specified.'}

## Material Palette
${data.materialPalette || 'No material palette specified.'}

## Silhouette
${data.silhouette || 'No silhouette details specified.'}

## Infrastructure
${data.infrastructure || 'No infrastructure style specified.'}

## Economy
${data.economy || 'No economy specified.'}

## Trade
- **Exports:** ${data.exports || 'None'}
- **Imports:** ${data.imports || 'None'}

## Assigned Mods
${data.assignedMods || 'None'}

## Major Cities
${data.majorCities || 'None'}

## Minor Settlements
${data.minorSettlements || 'None'}

## Landmarks
${data.landmarks || 'None'}

## Design Patterns
${data.designPatterns || 'None'}

## Future Expansion
${data.futureExpansion || 'None'}
`;

  return `${yamlFrontmatter}\n\n${body}`;
}

export function compileModMarkdown(data) {
  const yamlFrontmatter = `---
id: "${data.id || 'mod-entry'}"
title: "${data.name || 'Mod Name'}"
type: "mod"
civilization: "${data.civilization || ''}"
region_placement: "${data.regionPlacement || ''}"
updated_at: "${new Date().toISOString()}"
---`;

  const body = `# ${data.name || 'Mod Name'}

## Civilization
${data.civilization || 'Unassigned'}

## Gameplay Purpose
${data.gameplayPurpose || 'No gameplay purpose specified.'}

## Architectural Themes
${data.architecturalThemes || 'No architectural themes specified.'}

## Typical Buildings
${data.typicalBuildings || 'No typical buildings specified.'}

## Region Placement
${data.regionPlacement || 'No region placement specified.'}

## Progression
${data.progression || 'No progression path specified.'}

## Integration
${data.integration || 'No integration details specified.'}
`;

  return `${yamlFrontmatter}\n\n${body}`;
}

export function compileRegionMarkdown(data) {
  const yamlFrontmatter = `---
id: "${data.id || 'region-entry'}"
title: "${data.name || 'Region Name'}"
type: "region"
dominant_civilization: "${data.dominantCivilization || ''}"
climate: "${data.climate || ''}"
updated_at: "${new Date().toISOString()}"
---`;

  const body = `# ${data.name || 'Region Name'}

## Geography
${data.geography || 'No geography specified.'}

## Climate
${data.climate || 'No climate specified.'}

## Dominant Civilization
${data.dominantCivilization || 'Unassigned'}

## Settlements
${data.settlements || 'None'}

## Trade Routes
${data.tradeRoutes || 'None'}

## Resources
${data.resources || 'None'}

## Story Hooks
${data.storyHooks || 'None'}

## Points of Interest
${data.pointsOfInterest || 'None'}
`;

  return `${yamlFrontmatter}\n\n${body}`;
}

export function compileDecisionLogMarkdown(data) {
  const yamlFrontmatter = `---
id: "${data.id || 'adr-000'}"
title: "${data.title || 'Decision Title'}"
type: "decision_log"
date: "${data.date || new Date().toISOString().split('T')[0]}"
---`;

  const body = `# ${data.title || 'Decision Title'}

**Date:** ${data.date || new Date().toISOString().split('T')[0]}

## What Changed
${data.whatChanged || 'No details specified.'}

## Why
${data.why || 'No rationale specified.'}

## Alternatives Considered
${data.alternativesConsidered || 'No alternatives specified.'}

## Long-Term Implications
${data.longTermImplications || 'No implications specified.'}
`;

  return `${yamlFrontmatter}\n\n${body}`;
}

/**
 * Lightweight Markdown Parser for Visual HTML Preview
 */
export function renderMarkdownToHTML(markdownText) {
  if (!markdownText) return '';

  let html = markdownText;

  // Render YAML Frontmatter as a special styled callout block
  html = html.replace(/^---\r?\n([\s\S]*?)\r?\n---/g, (match, yamlContent) => {
    return `<div class="frontmatter-box"><strong>⚙️ YAML Metadata (Frontmatter)</strong><pre>${escapeHtml(yamlContent)}</pre></div>`;
  });

  // Render Headings
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');

  // Bold & Italics
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Lists
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gis, '<ul>$1</ul>');

  // Line breaks to paragraphs
  const paragraphs = html.split(/\r?\n\r?\n/).map(p => {
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<div') || p.startsWith('<block')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return paragraphs;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
