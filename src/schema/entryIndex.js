/**
 * Codex — Live entry index.
 *
 * Pure shaping of the current codex's entries into a `{ type: Entry[] }` map, replacing the
 * old bundled `SEED_BY_TYPE`. `main.js` feeds this from the codex's Firestore `entries`
 * subscription (or the demo fixture in local-only mode); the nav and reference resolution
 * read through it. Archived entries stay in the index (so a reference to one still resolves
 * its label) but are filtered out of the nav via `activeEntries`.
 */

/** Group a flat entry array by `type`. Entries without a `type` are skipped. */
export function indexEntries(entries = []) {
  const byType = {};
  for (const e of entries) {
    if (!e || !e.type) continue;
    (byType[e.type] ||= []).push(e);
  }
  return byType;
}

/** Non-archived entries of a type (what the nav shows). Empty array for an unknown type. */
export function activeEntries(byType, type) {
  return (byType[type] || []).filter((e) => e.status !== 'archived');
}

/** Find a full entry by type + id (including archived), or null. */
export function findEntry(byType, type, id) {
  return (byType[type] || []).find((e) => e.id === id) || null;
}
