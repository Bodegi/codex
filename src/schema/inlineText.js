/**
 * Codex — Inline rich-text (pure).
 *
 * The small amount of rich text that lives inside free-text field values. Pure and
 * dependency-free: pool-image resolution is passed in as `resolveImage(id) -> url`
 * so this module carries no build-tool (Vite) coupling and can be unit-tested under
 * plain Node.
 */

import { notFoundImage } from './notFoundImage.js';

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a single free-text field value to HTML.
 * Supports (on HTML-escaped text): paragraphs / line breaks, **bold**, *italic*,
 * [links](url), ![images](url), and simple "- " unordered lists. `resolveImage`
 * turns `pool:<id>` refs into URLs; without it, pool refs render a placeholder.
 */
export function formatInline(raw, resolveImage) {
  if (raw == null || String(raw).trim() === '') return '';

  const escaped = escapeHtml(raw);

  return escaped
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const isList = lines.length > 0 && lines.every((l) => /^\s*-\s+/.test(l));
      if (isList) {
        const items = lines
          .map((l) => `<li>${inlineMarks(l.replace(/^\s*-\s+/, ''), resolveImage)}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${inlineMarks(block, resolveImage).replace(/\r?\n/g, '<br>')}</p>`;
    })
    .join('');
}

// Inline-level marks applied to already-escaped text.
function inlineMarks(text, resolveImage) {
  return text
    .replace(/!\[(.*?)\]\((.*?)\)/g, (_m, alt, url) => renderImageMark(alt, url, resolveImage))
    .replace(/\[(.*?)\]\((.*?)\)/g, (_m, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// An image mark. `pool:<id>` refs resolve through the injected resolver; other URLs
// pass through. An unresolved pool ref renders the not-found placeholder, not a broken image.
function renderImageMark(alt, url, resolveImage) {
  if (url.startsWith('pool:')) {
    const id = url.slice(5);
    const resolved = resolveImage ? resolveImage(id) : null;
    if (!resolved) return notFoundImage('image-missing-inline');
    return `<img class="inline-img" src="${resolved}" alt="${alt}">`;
  }
  return `<img class="inline-img" src="${url}" alt="${alt}">`;
}
