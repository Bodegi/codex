# Feedback review — pre-launch (product / UX gaps)

Features and flows we should have thought about but didn't fully — the things a first-time author,
a new invitee, or a codex owner will reach for and not find. These aren't bugs; the code does what it
says. They're gaps in *what it says*. Same severity tags as the technical file, because launch-blocking
is a filter across both, not a separate axis:

- **Blocking** — a real user hits a dead end on a core path at launch.
- **Should-fix** — noticeable rough edge or missing safety net; fix around launch.
- **Later** — genuine improvement, not launch-gating.

---

## Blocking

### F1. No "request access" loop for new users
**`src/components/awaitingAccess.js`, `src/main.js:473` `showAwaitingAccess`**

A signed-in user with no grant lands on the awaiting-access screen and can only… wait. There's no
"request access" action, and the admin gets no notification — a new user only appears as a row in the
roster if the admin happens to look. For a multi-user launch this is the first thing every invitee hits,
and it's a silent dead end on both ends.

**What to add:** a "Request access" button that flags the user (a field on their user doc / a small
requests collection), and an admin-side indicator that someone is waiting. Even a minimal version
closes the loop.

### F2. Connection loss / stale-data has no UX
Pairs with technical T3. Beyond the silent-listener bug itself, there is no *design* for "you've lost
the connection" or "your access changed — reload." The sync badge shows "Cloud sync on" statically and
never reflects a real disconnect. A worldbuilding author who keeps a tab open for hours will, at some
point, be editing against stale state with full confidence.

**What to add:** a real connection/stale state driven off the subscription error handlers — a banner,
a badge color change, and a "reload" affordance.

---

## Should-fix

### F3. No data export / backup for cloud codices
There is **no export anywhere** in the app (verified: no download/Blob path in `src/`). A codex owner
who has built hundreds of entries has no way to take a backup, snapshot, or migrate. For creative work
people are emotionally invested in, "there's no way to get my data out" is a trust problem at launch.
(Note: `appConfig.js:11` advertises local-only "manual JSON save/open" — that path doesn't appear to
exist in code, so the comment is either stale or a dropped feature. Worth reconciling.)

**What to add:** an export-codex-to-JSON action (entries + schemas). Import can come later; export is
the confidence-builder.

### F4. Archiving an entry gives no "what references this?" view
The reference handling is genuinely good — a dangling ref renders as "(unavailable)" and survives
edit→save (`fieldKinds.js`). But an author archiving an entry can't see *what points at it* first, so
they discover the breakage only later, entry by entry. A "referenced by" back-index would turn a
guessing game into an informed decision.

### F5. No entry history / recovery beyond the conflict modal
Entries carry a monotonic `version`, but there's no history, no diff, no undo. The conflict modal's
"overwrite" is a full replace with no way back — one wrong click and prior content is gone with no
recovery. The version integer is already there; even keeping the last-N snapshots would give a safety
net the current design lacks.

### F6. Accessibility gaps on core surfaces
- The **map** is a `<canvas>` with a DOM pin overlay and no keyboard/AT alternative — its content is
  invisible to screen readers and unreachable without a mouse.
- **Modals** (`confirmModal.js`, `conflictModal.js`) — confirm focus trapping, Escape-to-dismiss, and
  focus return are in place; these guard destructive actions, so they need to be right.
- Status is signaled partly by color (sync badge, archived styling) — verify a non-color cue exists.

Worth a focused a11y pass; at minimum document the known gaps so they're a decision, not a surprise.

---

## Later

### F7. Admin panels don't scale — no search/filter/pagination
`subscribeAllImages`, `subscribeUsers`, and `subscribePermissions` each load the *entire* collection
and render it. Fine at launch scale; at a few hundred images/users the Images and Users panels get
unwieldy and the reads get expensive. Add search/filter (and eventually pagination) when volume shows up.

### F8. No full-text search across entries
A codex is a reference work; the natural verb is "search." There's nav-by-type and the summary-card
index, but no way to find an entry by a word in its body. High-value for the reader experience, not a
launch blocker.

### F9. Mobile / small-screen story is unstated
The editor is a two-pane (form + live preview) desktop layout. Whether it's usable — or gracefully
degrades — on a phone/tablet is untested and unstated. Decide whether mobile is in scope for launch and
say so, rather than letting users discover the answer.

### F10. First-run guidance for the type builder
The empty-codex state has a one-line hint ("Use ＋ New type…"), which is good. But the schema/type
builder is the app's single hardest concept — defining fields, kinds, summary cards, associations — and
there's no first-run walkthrough or example. A short guided path (or a "duplicate this example type")
would flatten the steepest part of the learning curve.

---

## What's genuinely strong (keep it)

- **Honest local-only mode** — "Saved (local only — resets on reload)" and the sync badge are refreshingly
  candid; don't let a future refactor paper over that.
- **Soft-delete everywhere** (entries, types, codices, images, icons, emblems as status flips, never hard
  deletes) — a coherent, forgiving model that already prevents a whole class of data-loss regret.
- **Graceful degradation** of unresolved images/references — the reader view never shows a broken page.
