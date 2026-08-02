/**
 * Codex — Slug derivation & uniqueness.
 *
 * Pure helpers for turning a human name into a stable, url-safe id and keeping ids unique.
 * Two consumers, two policies:
 *   - Codex ids  → `slugify(name)` then reject-with-message on collision (`isSlugTaken`).
 *     The id is the immutable Firestore key, so a collision is an author-facing error.
 *   - Entry ids  → `uniqueSlug(slugify(title), existing)` auto-assigns past collisions,
 *     so "New entry" always yields a usable id without blocking the author.
 *
 * Kebab-case, distinct from schemaEditor's camelCase `slugToCamel` (which makes field keys).
 */

/** Kebab-case an arbitrary label: lowercase, non-alphanumeric runs → single `-`, trimmed. */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Whether `slug` already appears in `existing`. */
export function isSlugTaken(slug, existing = []) {
  return existing.includes(slug);
}

/** `base` if free, else the first `base-N` (N ≥ 2) not present in `existing`. */
export function uniqueSlug(base, existing = []) {
  if (!isSlugTaken(base, existing)) return base;
  let n = 2;
  while (isSlugTaken(`${base}-${n}`, existing)) n += 1;
  return `${base}-${n}`;
}

/**
 * An entry id from its title: slugified, `'entry'` when the title has nothing sluggable, then
 * auto-suffixed to stay unique among `existingIds` within the type. Unlike codex ids (which
 * reject on collision), entry creation should never block, so this always yields a usable id.
 */
export function deriveEntryId(title, existingIds = []) {
  return uniqueSlug(slugify(title) || 'entry', existingIds);
}
