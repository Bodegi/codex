# Write-Path Hardening — Design

> Wave 1 of the backlog. Unifies two Open items — **field-deletion doesn't persist through the autosave
> merge** and **concurrent-edit conflict handling** — plus the remote-update slice of **toast coverage**,
> because all three live on the same `saveDoc` / `subscribeToDoc` seam. Designed together so the fix is one
> coherent model, not three patches.

## Problem

The entry write path has three intertwined weaknesses, all rooted in the same two functions:

1. **Deletion doesn't persist.** `FirebaseManager` entry saves use `setDoc(…, { merge: true })`
   (`firebase.js:246`). Firestore merge only adds/overwrites keys — it never removes them. Any key dropped
   from `formData` is restored by the next snapshot. No live caller deletes a key today (the `hero-clear`
   symptom was worked around by writing `''`), so it's a latent data-correctness trap.
2. **Writes are unthrottled and whole-doc.** `autoSaveToFirebase` fires on every `input` event
   (`main.js:1471`, `:1482`) — one merge write per keystroke.
3. **The live re-render is indiscriminate.** The open-entry subscription callback (`main.js:1435`) merges
   remote data into `state.formData` and calls `renderFormWithoutResubscribe`, which rebuilds the whole form
   DOM (`formContainer.innerHTML = …`, `:1460`). Firestore echoes the client's *own* writes back as
   snapshots, so the form rebuilds on every keystroke; there's no `hasPendingWrites` guard, no caret/focus
   preservation for text inputs, and no version guard. This is the "live merge can clobber an in-progress
   edit" risk — and it fires even single-user.

Two people editing the same entry are last-write-wins with no detection, and the self-echo makes the write
path fragile even alone.

## Decisions (locked in brainstorming, 2026-08-02)

- **Conflict ambition:** *detection + notify* — a version guard that rejects a stale write and tells the
  user, plus stopping the self-clobber. Not presence, not field-level auto-merge (over-built at 3 users).
- **Save cadence:** *explicit save only* — remove autosave entirely. Edits live in memory until Save.
- **On conflict:** *keep mine, offer a choice* — a small modal: **Overwrite with mine** / **Discard mine &
  reload theirs**; dismiss = stay editing.
- **Rules hardening:** in scope for this effort (not a fast follow).

## Core idea — one mechanism solves items 1 and 2

An entry carries a monotonic integer **`version`**. Editing is **in-memory only** until an explicit **Save**,
which runs a **Firestore transaction**: read the current doc, compare its `version` to the `baseVersion` the
edit started from.

- **Match →** a **full-doc write** (`set` without merge), `version + 1`. Full replace makes **field
  deletions persist for free** — item 1, no `deleteField` diffing.
- **Mismatch →** a typed conflict carrying the current doc — item 2 (detection). The UI keeps the user's
  edits and offers the choice above.

*Rejected alternative:* diff + `deleteField()` layered on top of merge. It works but only solves deletion and
is more code; the version-guarded full write solves deletion **and** conflict at once and is simpler.

**Every entry-doc write bumps `version`** (form Save, archive, any status flip). Only the **form-Save path**
enforces the base-version guard. The **archive/status path** is a separate small transaction that reads the
current doc, flips `status` on *that fresh copy*, and writes `version + 1` — so it always applies but never
clobbers a concurrent field edit (it doesn't full-replace a possibly-stale index copy). This keeps `version`
strictly monotonic, which is what makes the form-Save conflict check correct — e.g. if an admin archives an
entry while you're editing it, your Save's base no longer matches and you're notified instead of silently
un-archiving it. The `force` flag on the form-Save write is reserved for the conflict "overwrite mine" path
only (§E), never for archive.

## Design

### A. Save model — explicit only

- **Remove `autoSaveToFirebase` and all its call sites** — the input listener (`main.js:1482`) and the media
  `onMutate` (`main.js:1500`). Edits mutate `state.formData` in memory; the live builder preview still
  updates locally (no write).
- Add a **`state.dirty`** flag: set on any form/media mutation, cleared on entry load and on successful Save.
- The existing form-header **Save** button (`saveEntry`) becomes the sole entry-write path.

### B. Edit mode has no live subscription

- **Read mode** keeps its live updates: the reader renders from `state.entryIndex`, fed by the collection
  subscription (`subscribeEntries`), so remote changes to the open entry still flow in while reading.
- **Edit mode drops the open-doc subscription.** Remove `subscribeToLiveFirestoreDoc` from the edit path and
  the live-merge-into-`formData` callback (`main.js:1435–1440`). `renderForm` collapses to
  `renderFormWithoutResubscribe`. The `state.liveDocId` / `state.activeDocUnsubscribe` edit-doc machinery and
  the `9be3a5c` re-subscribe-race guard become moot and are removed. This eliminates the self-echo re-render
  and the whole in-flight-callback-orphaning class of bug.
- The sync-status badge (`renderSyncStatus`, `main.js:1722`) no longer shows `Live sync · <id>` during edit
  (there's no per-doc subscription); it shows `Cloud sync on`. Minor, honest.

### C. Unsaved-changes guard

With no autosave, leaving edit mode while `state.dirty` prompts a confirm before discarding:

- Triggers: **Done**, navigating to another entry/type, switching codex, opening global-admin.
- Uses the existing `openConfirm({ title: 'Discard unsaved changes?', … })` (`confirmModal.js`). Confirm →
  discard and proceed; cancel → stay in edit. This is the safety net for the one downside of explicit-save.

### D. Data flow — Save

1. On entering edit: `state.baseVersion = state.formData.version ?? 0`.
2. Save → `CodexScope.saveEntry(type, id, data, baseVersion)` runs a transaction whose decision comes from a
   pure helper `resolveSave({ currentVersion, baseVersion, force })`:
   - not exists (new entry): `currentVersion` treated as `0`; base `0` matches → write `version: 1`.
   - exists & `currentVersion === baseVersion`: `set(ref, { …data, type, id, version: currentVersion + 1,
     updatedAt })` — **full replace, no merge**.
   - exists & mismatch (and not `force`): throw `{ code: 'version-conflict', current }`.
3. Success → `state.formData.version = state.baseVersion = nextVersion`; `state.dirty = false`; return to reader.
4. `version-conflict` → **conflict modal** (§E). Network/other error → toast; `dirty` stays true (nothing lost).

Existing entries have no `version` → treated as `0`, first Save writes `1`. **No migration.**

### E. Conflict UX

A small dedicated `conflictModal.js` (sibling to `lightbox.js` / `confirmModal.js`) → `Promise<'overwrite' |
'reload' | null>`:

- **Overwrite with mine** → re-run `saveEntry(…, baseVersion, { force: true })`. Force reads current and
  writes `current.version + 1` (rebased — still monotonic, so it satisfies the rules in §G). Then update
  version/baseVersion, clear dirty, return to reader.
- **Discard mine & reload theirs** → load `err.current` into the reader; `baseVersion = current.version ?? 0`;
  clear dirty.
- **Dismiss** (Esc / click-outside) → stay in edit with unsaved edits intact.

`confirmModal` is boolean-only, so this is its own component rather than a forced generalization.

### F. Image-field boundary (the upload/Save split)

Explicit-save changes **only** the entry's *references* to images. Image existence and membership keep their
own immediate lifecycle — this split already matches the code:

- **Immediate, on upload (not entry-versioned):** Supabase bytes + the top-level **`images`** doc
  (`id`, `codices[]` membership, `label`, `status`, `uploadedBy`) via `uploadImage` / `addImageToCodex` /
  `removeImageFromCodex` / `updateImageLabel` / `setImageStatus`. Unchanged.
- **Deferred to Save (entry content, version-guarded):** the entry's `heroImage` (id), `gallery` (id array),
  and inline `![](pool:id)` refs in prose. These are the *only* image-shaped fields on the entry.

Consequence to accept: upload-then-navigate-away-without-saving leaves the image in the codex library
(reusable from the picker) but attached to no entry — a harmless library orphan, not lost work.

### G. `firestore.rules` — monotonic-version backstop

On the entry docs (`codices/{codexId}/entries/{entryId}`), require version monotonicity as a data-layer
integrity guard (the Phase-2 ethos), on top of the existing admin/editor write gate:

- create: `request.resource.data.version == 1`
- update: `request.resource.data.version == (resource.data.version == null ? 0 : resource.data.version) + 1`

Both the normal and the force-overwrite writes write `current + 1`, so both pass; a stale write computes
`base + 1 != current + 1` and is rejected even if it reached the DB. The **conflict UX stays client-side**
(only the client knows `baseVersion`); the rule just guarantees no version skips or rollbacks. Needs its own
deny-case browser test.

### H. Read-mode remote-update toast (item-3 slice)

When the collection subscription delivers a change to the **currently-open, read-mode** entry that the client
didn't just cause, show a toast (e.g. `This entry was just updated`). Guard against the initial load snapshot
(only toast on subsequent changes). This is the remote-update slice of the toast-coverage item; the broader
CRUD-toast audit stays its own backlog item.

## Components & boundaries

| Unit | Kind | Responsibility |
|---|---|---|
| `src/schema/saveResolve.js` | **new, pure** | `resolveSave({ currentVersion, baseVersion, force })` → `{ action: 'write' \| 'conflict', nextVersion }`. Node-tested. |
| `src/components/conflictModal.js` | **new, DOM** | `openConflictModal()` → `Promise<'overwrite' \| 'reload' \| null>`. |
| `src/utils/firebase.js` | edit | `CodexScope.saveEntry(type, id, data, baseVersion, { force })` — versioned full-doc transaction over `resolveSave`; supersedes `saveDoc` for form saves (`force` = the overwrite-mine path). Plus `CodexScope.saveEntryStatus(type, id, status)` — a separate transaction that reads current, flips `status`, bumps `version` (archive/restore). |
| `src/main.js` | edit | Remove autosave + edit-doc subscription; `state.dirty` + `baseVersion`; conflict-modal wiring; unsaved-changes guard; read-mode remote-update toast; sync-badge tweak. |
| `firestore.rules` | edit | Monotonic-`version` on entry create/update. |

## Testing

- **Pure / `node:test`** (beside the module): `resolveSave` — new-entry write, matched-version write,
  mismatch→conflict, force→write, null/undefined-version coercion to `0`.
- **Browser-verified (live Firestore):**
  - Two tabs edit the same entry → second Save hits the conflict modal → both branches (overwrite, reload).
  - Field-deletion round-trip: drop a key, Save, reload → key stays gone.
  - Unsaved-changes guard on Done / nav / codex-switch.
  - New-entry create (version 1) and a normal single-user edit (no self-echo re-render, caret stable).
  - Rules deny-case: a hand-crafted stale/duplicate-version write is rejected.
  - Read-mode remote-update toast fires on another tab's Save, not on initial load.

## Out of scope (stays in backlog)

- Presence / "someone else is editing" indicators; field-level auto-merge.
- The broader CRUD toast-coverage audit (create/update/archive across entries/types/codices/images/
  permissions) — its own session.
- Renaming the vestigial `pool:` inline-image scheme — its own naming-cleanup item.

## Execution checklist (TDD)

1. `saveResolve.js` + test (red → green) — the pure decision core.
2. `CodexScope.saveEntry` (guarded full-doc transaction using `resolveSave`) + `CodexScope.saveEntryStatus`
   (read-current, flip status, bump version); reroute `main.js`'s archive/restore through `saveEntryStatus`;
   retire entry use of `saveDoc(merge)`.
3. `main.js`: strip `autoSaveToFirebase` + call sites; `state.dirty` + `baseVersion`; drop edit-doc
   subscription and simplify `renderForm` / `liveDocId`; sync-badge tweak.
4. `conflictModal.js` + wire the Save catch (overwrite / reload / dismiss).
5. Unsaved-changes guard on the four edit-exit paths.
6. Read-mode remote-update toast (collection-subscription diff, skip initial snapshot).
7. `firestore.rules` monotonic-version + deny-case browser test.
8. Full browser walk of the flows above; `npm test` + `npm run build` clean.
