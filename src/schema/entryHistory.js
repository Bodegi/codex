/**
 * Codex — Entry-history ring (pure).
 *
 * Every entry save snapshots the *prior* version into a `history/{version}` subcollection before the
 * live doc is overwritten (see CodexScope.saveEntry). This module owns the ring's one decision: which
 * old snapshot, if any, falls out of the last-N window on each save.
 *
 * Because every version bump writes a snapshot, snapshot versions are contiguous (1, 2, …, live-1).
 * So pruning needs no listing: after a save that snapshotted version `prevVersion`, the snapshot that
 * just left the window is exactly `prevVersion - keep`. Deleting that single doc (best-effort, outside
 * the transaction) holds the window at `keep`. `null` means nothing to prune yet — the window isn't full.
 *
 * The panel lists whatever docs actually exist, so pruning is only housekeeping: if a best-effort delete
 * is ever missed, history grows slightly past `keep` but stays truthful.
 */

/** Default snapshot depth — how many prior versions to retain per entry. */
export const HISTORY_KEEP = 10;

/**
 * The history version to delete after snapshotting `prevVersion`, or `null` if the window isn't full.
 * `prevVersion` is the version just copied into history (the live doc's version before this save's bump).
 */
export function pruneTarget(prevVersion, keep = HISTORY_KEEP) {
  const prev = prevVersion ?? 0;
  const target = prev - keep;
  return target >= 1 ? target : null;
}
