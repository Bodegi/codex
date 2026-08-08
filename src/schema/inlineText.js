/**
 * Codex — Inline rich-text (pure).
 *
 * The small amount of rich text that lives inside free-text field values. Pure and
 * dependency-free: image resolution is passed in as `resolveImage(id) -> url`
 * so this module carries no build-tool (Vite) coupling and can be unit-tested under
 * plain Node.
 */

import { notFoundImage } from './notFoundImage.js';

// Escapes " but deliberately NOT ' — every attribute the inline marks below emit (href/src/alt) is
// DOUBLE-quoted, so &quot; is what closes the attribute-injection vector. This pairing is load-bearing:
// single-quoting one of those attributes, or building an attr from a raw (un-escaped) value, silently
// reopens XSS because formatInline output is inserted via innerHTML. Keep the attrs double-quoted.
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
 * turns `img:<id>` refs into URLs (the legacy `pool:<id>` prefix still resolves);
 * without it, those refs render a placeholder.
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

// URL-scheme allowlist for inline links/images. escapeHtml (run upstream) blocks attribute *breakout*,
// but NOT dangerous *schemes*: a `[x](javascript:...)` link executes on click, and prose is
// editor-authored content rendered to every reader/admin of the codex — a cross-privilege XSS. Links
// permit only http/https/mailto (or a scheme-less relative/anchor url); images permit only http/https.
// Browsers strip tab/newline/NUL from a url before resolving its scheme, so we strip those control
// chars here too before matching (defeats `java<TAB>script:` obfuscation).
const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto']);

// The url's scheme in lowercase, or null when it has none (relative / anchor / protocol-less).
function urlScheme(url) {
  const cleaned = String(url ?? '')
    .replace(/[\x00-\x20\x7f-\x9f]/g, '') // strip whitespace + control chars the browser would drop
    .toLowerCase();
  const m = /^([a-z][a-z0-9+.-]*):/.exec(cleaned);
  return m ? m[1] : null;
}

const isSafeLinkUrl = (url) => {
  const s = urlScheme(url);
  return s === null || SAFE_LINK_SCHEMES.has(s);
};
const isSafeImageUrl = (url) => {
  const s = urlScheme(url);
  return s === null || s === 'http' || s === 'https';
};

// Inline-level marks applied to already-escaped text. Attrs (href/src/alt) MUST stay double-quoted:
// escapeHtml neutralizes " but not ' (see escapeHtml), so single-quoting one reopens attribute-injection XSS.
// A link with a disallowed scheme degrades to its inert label text (never a live dangerous href).
function inlineMarks(text, resolveImage) {
  return text
    .replace(/!\[(.*?)\]\((.*?)\)/g, (_m, alt, url) => renderImageMark(alt, url, resolveImage))
    .replace(/\[(.*?)\]\((.*?)\)/g, (_m, label, url) =>
      isSafeLinkUrl(url) ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : label
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// An image mark. `img:<id>` refs (and the legacy `pool:<id>` alias) resolve through the
// injected resolver; other URLs pass through when their scheme is safe (http/https). An
// unresolved ref — or an unsafe url — renders the not-found placeholder, not a broken image.
function renderImageMark(alt, url, resolveImage) {
  const ref = /^(?:img|pool):(.*)$/.exec(url);
  if (ref) {
    const id = ref[1];
    const resolved = resolveImage ? resolveImage(id) : null;
    if (!resolved) return notFoundImage('image-missing-inline');
    return `<img class="inline-img" src="${resolved}" alt="${alt}">`;
  }
  if (!isSafeImageUrl(url)) return notFoundImage('image-missing-inline');
  return `<img class="inline-img" src="${url}" alt="${alt}">`;
}
