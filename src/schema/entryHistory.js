/**
 * Codex — Entry-history ring (pure).
 *
 * Every entry save records the version it *writes* into a `history/{version}` subcollection, atomic
 * with the live write (see CodexScope.saveEntry). Keying the snapshot by the written version — not
 * the prior one — keeps the *live* version itself in the ring, so recovery can restore the newest
 * state even after an out-of-band corruption of the live doc, and a single-save entry still has
 * history (#44). This module owns the ring's decisions: which snapshot falls out of the last-N
 * window, and (as a model) which versions the ring retains.
 *
 * Because every version bump writes a snapshot, snapshot versions are contiguous (1, 2, …, live).
 * So pruning needs no listing: after a save that snapshotted version `snapshotVersion`, the snapshot
 * that just left the window is exactly `snapshotVersion - keep`. Deleting that single doc (best-effort,
 * outside the transaction) holds the window at `keep`. `null` means nothing to prune yet — not full.
 *
 * The panel lists whatever docs actually exist, so pruning is only housekeeping: if a best-effort delete
 * is ever missed, history grows slightly past `keep` but stays truthful.
 */

/** Default snapshot depth — how many versions to retain per entry. */
export const HISTORY_KEEP = 10;

/**
 * The history version to delete after snapshotting `snapshotVersion`, or `null` if the window isn't
 * full. `snapshotVersion` is the version just copied into history — the version this save wrote live.
 */
export function pruneTarget(snapshotVersion, keep = HISTORY_KEEP) {
  const snapped = snapshotVersion ?? 0;
  const target = snapped - keep;
  return target >= 1 ? target : null;
}

/**
 * The history versions retained for an entry after `saves` successive saves, newest first, once
 * best-effort pruning has held the window at `keep`. A save snapshots the version it writes, so the
 * ring holds the last `keep` of 1..saves — and always includes the live version `saves` itself,
 * which is what makes the newest state recoverable. A model of the ring's contents (mirrors the
 * capture in CodexScope.saveEntry + pruneTarget), not a live read.
 */
export function retainedVersions(saves, keep = HISTORY_KEEP) {
  const versions = [];
  for (let v = saves ?? 0; v >= 1 && versions.length < keep; v--) versions.push(v);
  return versions;
}
