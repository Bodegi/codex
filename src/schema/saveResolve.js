/**
 * Codex — Entry-save decision (pure).
 *
 * The version-guard decision at the heart of the write path, factored out so the
 * transaction wiring in `firebase.js` stays a thin shell and this logic is Node-testable.
 *
 * An entry carries a monotonic integer `version`. A form Save starts from the version it
 * loaded (`baseVersion`); at commit time the transaction reads the live `currentVersion`:
 *   - match           → write the full doc at `currentVersion + 1`
 *   - mismatch        → conflict (someone else saved); the caller keeps the user's edits
 *   - mismatch + force → the "overwrite mine" path: write anyway, still `currentVersion + 1`
 *
 * Missing versions (a legacy entry with no `version`, or a brand-new entry) coerce to 0,
 * so the first write lands version 1 with no migration.
 */
export function resolveSave({ currentVersion, baseVersion, force = false } = {}) {
  const current = currentVersion ?? 0;
  const base = baseVersion ?? 0;
  const nextVersion = current + 1;
  if (!force && base !== current) {
    return { action: 'conflict', nextVersion };
  }
  return { action: 'write', nextVersion };
}
