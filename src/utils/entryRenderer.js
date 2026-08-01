/**
 * ATM10 Codex — Entry Renderer
 *
 * Renders a structured entry object straight to HTML for the Visual Preview.
 * No markdown intermediate: structured fields become HTML directly, and the small
 * amount of rich text that lives inside free-text fields is handled by formatInline.
 */

import { resolve as resolvePoolImage } from './imagePool.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Inline rich-text formatter for a single free-text field value.
 * Supports (on HTML-escaped text): paragraphs / line breaks, **bold**, *italic*,
 * [links](url), ![images](url), and simple "- " unordered lists. Anything else
 * renders literally.
 */
export function formatInline(raw) {
  if (raw == null || String(raw).trim() === '') return '';

  const escaped = escapeHtml(raw);

  return escaped
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const isList = lines.length > 0 && lines.every((l) => /^\s*-\s+/.test(l));
      if (isList) {
        const items = lines
          .map((l) => `<li>${inlineMarks(l.replace(/^\s*-\s+/, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${inlineMarks(block).replace(/\r?\n/g, '<br>')}</p>`;
    })
    .join('');
}

// Inline-level marks applied to already-escaped text.
function inlineMarks(text) {
  return text
    .replace(/!\[(.*?)\]\((.*?)\)/g, (_m, alt, url) => renderImageMark(alt, url))
    .replace(/\[(.*?)\]\((.*?)\)/g, (_m, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// An image mark. `pool:<id>` refs resolve through the image pool; other URLs pass
// through. An unresolved pool ref renders a small placeholder, not a broken image.
function renderImageMark(alt, url) {
  if (url.startsWith('pool:')) {
    const id = url.slice(5);
    const resolved = resolvePoolImage(id);
    if (!resolved) return `<span class="missing-img">⚠ missing image: ${alt || id}</span>`;
    return `<img class="inline-img" src="${resolved}" alt="${alt}">`;
  }
  return `<img class="inline-img" src="${url}" alt="${alt}">`;
}

// The hero image for an entry (top of body), or '' when unset/unresolved.
function heroImage(d) {
  if (!d.heroImage) return '';
  const url = resolvePoolImage(d.heroImage);
  if (!url) return '';
  return `<img class="entry-hero" src="${url}" alt="${escapeHtml(d.name || d.title || '')}">`;
}

// A section: heading + formatted body (or a muted placeholder when empty).
function section(title, value) {
  const body = formatInline(value) || '<p class="muted">Not specified.</p>';
  return `<h2>${escapeHtml(title)}</h2>${body}`;
}

// The metadata callout at the top of the preview, rendered from the object directly.
function metadataBox(rows) {
  const items = rows
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(
      ([k, v]) =>
        `<div class="meta-row"><span class="meta-key">${escapeHtml(k)}</span><span class="meta-val">${escapeHtml(v)}</span></div>`
    )
    .join('');
  return `<div class="metadata-box"><strong>⚙️ Metadata</strong>${items}</div>`;
}

function renderCivilization(d) {
  return `
    ${metadataBox([
      ['id', d.id],
      ['title', d.name],
      ['type', 'civilization'],
      ['primary mods', d.assignedMods],
      ['exports', d.exports],
      ['imports', d.imports],
      ['infrastructure', d.infrastructure],
    ])}
    <h1>${escapeHtml(d.name || 'Civilization Name')}</h1>
    ${heroImage(d)}
    ${section('Philosophy', d.philosophy)}
    ${section('History', d.history)}
    ${section('Geography', d.geography)}
    ${section('Architecture', d.architecture)}
    ${section('Material Palette', d.materialPalette)}
    ${section('Silhouette', d.silhouette)}
    ${section('Infrastructure', d.infrastructure)}
    ${section('Economy', d.economy)}
    <h2>Trade</h2>
    <ul>
      <li><strong>Exports:</strong> ${escapeHtml(d.exports || 'None')}</li>
      <li><strong>Imports:</strong> ${escapeHtml(d.imports || 'None')}</li>
    </ul>
    ${section('Assigned Mods', d.assignedMods)}
    ${section('Major Cities', d.majorCities)}
    ${section('Minor Settlements', d.minorSettlements)}
    ${section('Landmarks', d.landmarks)}
    ${section('Design Patterns', d.designPatterns)}
    ${section('Future Expansion', d.futureExpansion)}
  `;
}

function renderMod(d) {
  return `
    ${metadataBox([
      ['id', d.id],
      ['title', d.name],
      ['type', 'mod'],
      ['civilization', d.civilization],
      ['region placement', d.regionPlacement],
    ])}
    <h1>${escapeHtml(d.name || 'Mod Name')}</h1>
    ${heroImage(d)}
    ${section('Civilization', d.civilization)}
    ${section('Gameplay Purpose', d.gameplayPurpose)}
    ${section('Architectural Themes', d.architecturalThemes)}
    ${section('Typical Buildings', d.typicalBuildings)}
    ${section('Region Placement', d.regionPlacement)}
    ${section('Progression', d.progression)}
    ${section('Integration', d.integration)}
  `;
}

function renderRegion(d) {
  return `
    ${metadataBox([
      ['id', d.id],
      ['title', d.name],
      ['type', 'region'],
      ['dominant civilization', d.dominantCivilization],
      ['climate', d.climate],
    ])}
    <h1>${escapeHtml(d.name || 'Region Name')}</h1>
    ${heroImage(d)}
    ${section('Geography', d.geography)}
    ${section('Climate', d.climate)}
    ${section('Dominant Civilization', d.dominantCivilization)}
    ${section('Settlements', d.settlements)}
    ${section('Trade Routes', d.tradeRoutes)}
    ${section('Resources', d.resources)}
    ${section('Story Hooks', d.storyHooks)}
    ${section('Points of Interest', d.pointsOfInterest)}
  `;
}

function renderDecisionLog(d) {
  return `
    ${metadataBox([
      ['id', d.id],
      ['title', d.title],
      ['type', 'decision_log'],
      ['date', d.date],
    ])}
    <h1>${escapeHtml(d.title || 'Decision Title')}</h1>
    <p><strong>Date:</strong> ${escapeHtml(d.date || '')}</p>
    ${section('What Changed', d.whatChanged)}
    ${section('Why', d.why)}
    ${section('Alternatives Considered', d.alternativesConsidered)}
    ${section('Long-Term Implications', d.longTermImplications)}
  `;
}

/**
 * Render an entry of the given builder type straight to HTML.
 */
export function renderEntryHTML(type, data) {
  const d = data || {};
  switch (type) {
    case 'civilization':
      return renderCivilization(d);
    case 'mod':
      return renderMod(d);
    case 'region':
      return renderRegion(d);
    case 'decision':
      return renderDecisionLog(d);
    default:
      return '';
  }
}
