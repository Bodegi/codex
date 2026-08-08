/**
 * Codex — Lightweight SVG sanitizer (pure).
 *
 * Icon/emblem markup is admin-authored and injected via `innerHTML` into the nav and map, read by
 * every signed-in user. Firestore rules already gate *writes* to admins, so this is
 * defense-in-depth, not the primary gate: "admin-authored" isn't "safe" — an
 * admin account can be phished, and the blast radius is everyone. This strips the known SVG XSS
 * vectors before the markup is ever stored in app state, so all downstream sinks render clean.
 *
 * Applied at the ingestion choke point (the icons/emblems Firestore subscriptions), so bundled
 * icons and designer output (`layersToSvg`, structured primitives only) pass through untouched —
 * the sanitizer is a no-op on clean markup and idempotent.
 *
 * Pure and Node-testable: string transforms only, no DOM. It is deliberately *lightweight* — it
 * removes the executable vectors (script/foreignObject/style elements, `on*` handlers, and
 * javascript:/vbscript:/data: URLs), not every conceivable evasion. Exhaustive entity-obfuscation
 * and external-resource fetches (`<image href="https://…">`) are out of scope and accepted as
 * residual risk for admin-only, defense-in-depth markup. Live admin *self*-previews (an admin
 * viewing their own unsaved textarea) are also out of scope — that's self-XSS, not the vector this guards.
 */

// Elements removed wholesale, content and all: they can execute script or host arbitrary HTML/CSS.
const DANGEROUS_ELEMENTS = ['script', 'foreignObject', 'style'];

// Attributes carrying a URL — scrubbed when the value resolves to an executable scheme.
const URL_ATTRS = ['href', 'xlink:href', 'src'];

// Schemes that can execute when a URL attribute is followed/loaded.
const DANGEROUS_SCHEME = /^(?:javascript|vbscript|data):/;

/** Decode numeric char refs (&#106; / &#x6a;) so `java&#115;cript:` can't slip past the scheme test. */
function decodeNumericEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

/** True when a URL-attribute value resolves to an executable scheme (whitespace/entity tolerant). */
function isDangerousUrl(value) {
  // Drop whitespace a browser ignores inside a scheme (spaces, tabs, newlines, CR) so
  // `java\tscript:` and friends can't evade the prefix test.
  const normalized = decodeNumericEntities(value).replace(/\s+/g, '').toLowerCase();
  return DANGEROUS_SCHEME.test(normalized);
}

/**
 * Sanitize a fragment of SVG markup. Returns a cleaned string (never throws). Non-string input
 * yields '' — a missing glyph, which the sinks already tolerate.
 */
export function sanitizeSvg(markup) {
  if (typeof markup !== 'string' || !markup) return '';
  let out = markup;

  // 1. Drop dangerous elements entirely, including their content (paired or self-closed).
  for (const tag of DANGEROUS_ELEMENTS) {
    out = out
      .replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '')
      .replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }

  // 2. Strip event-handler attributes (onload, onclick, onerror, …), quoted or bare.
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 3. Scrub URL attributes whose value is an executable scheme; leave safe URLs (#refs, paths).
  const urlAttr = new RegExp(`\\s(${URL_ATTRS.join('|')})\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'gi');
  out = out.replace(urlAttr, (match, _attr, rawValue) => {
    const value = rawValue.replace(/^["']|["']$/g, '');
    return isDangerousUrl(value) ? '' : match;
  });

  return out;
}
