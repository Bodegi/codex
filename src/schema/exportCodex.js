/**
 * Codex — codex export (pure).
 *
 * Serializes a whole codex — its meta, type schemas, and every entry — into one versioned JSON
 * envelope a reader can download as an off-platform copy (issue #2). Pure: `main.js` gathers the
 * three pieces from live state and hands them in, so this stays SDK/DOM-free and Node-tested.
 *
 * Scope is deliberate: image *bytes* live in Supabase and their records are app-global (shared
 * across codices), so they are NOT bundled — entries keep their content-hash references, which is
 * all that's needed to re-resolve them against the same deployment. Entry docs and schemas are
 * emitted verbatim (whatever shape they carry), including archived ones, so the file is a faithful
 * snapshot, not a lossy view. In-app version history is the separate, later layer (issue #4).
 *
 * `format`/`formatVersion` make the envelope self-identifying so a future import can recognize and
 * validate it. Bump `formatVersion` only on a breaking shape change.
 */

export const EXPORT_FORMAT = 'codex-export';
export const EXPORT_FORMAT_VERSION = 1;

/**
 * Build the export envelope. `meta` is the codex's registry doc (name/description/codexId),
 * `schemas` the effective type schemas (overlay-wins, as seen on screen), `entries` the flat entry
 * docs (active + archived). `exportedAt` is an ISO string, passed in for determinism.
 */
export function buildCodexExport({ meta = {}, schemas = [], entries = [], exportedAt } = {}) {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt,
    codex: {
      codexId: meta.codexId ?? null,
      name: meta.name ?? null,
      description: meta.description ?? null,
    },
    schemas: [...schemas],
    entries: [...entries],
  };
}

/**
 * A download filename for a codex export: `${slug}-${YYYY-MM-DD}.json`. The date is the calendar
 * day of `exportedAt` in UTC (stable regardless of the downloader's timezone). Falls back to
 * `codex` when the name slugs to nothing.
 */
export function exportFilename(meta = {}, exportedAt) {
  const slug = slugify(meta.name) || 'codex';
  const day = String(exportedAt).slice(0, 10); // ISO 'YYYY-MM-DD'
  return `${slug}-${day}.json`;
}

/** Lowercase, spaces/punctuation → single hyphens, trimmed. Filename-only; not a codex id. */
function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
