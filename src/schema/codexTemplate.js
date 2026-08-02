/**
 * Codex — Create-from-template payload builder (pure).
 *
 * When an admin creates a codex from a template ("copy types from <existing codex>"), the new
 * codex inherits the source's **type structure only** — its schemas, never its entries. This
 * builder turns the source codex's schema docs into the docs to write under the new codex:
 * active types only, each deep-cloned, status normalized to 'active', and the source's
 * Firestore-managed `updatedAt` stripped (the new codex writes its own on save).
 */

/** Active source schemas, deep-cloned, normalized to `status: 'active'`, sans `updatedAt`. */
export function buildTemplateSchemas(sourceSchemas = []) {
  return (sourceSchemas || [])
    .filter((s) => s && s.status !== 'archived')
    .map((s) => {
      const { updatedAt: _dropped, ...rest } = structuredClone(s);
      return { ...rest, status: 'active' };
    });
}
