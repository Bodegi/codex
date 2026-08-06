# Technical review — pre-launch (adversarial pass)

Mechanical / correctness findings from a close read of the core modules (`main.js`,
`firestore.rules`, `capabilities.js`, the write path, and every innerHTML sink). The suite is
green (305 tests). Each item is tagged:

- **Blocking** — fix before launch; a real user or a semi-trusted editor can trigger it.
- **Should-fix** — robustness/correctness gap that will bite in the field; fix before or right after launch.
- **Later** — technical debt to acknowledge, not launch-gating.

Overall the architecture holds up under pressure: the pure/impure split is real, the version-guard
write path is careful and well-tested, and `capabilities.js` mirrors `firestore.rules`
predicate-for-predicate with the rules as the true gate. The findings below are the edges.

---

## Blocking

### T1. Stored XSS: `javascript:` / `data:` scheme in inline links
**`src/schema/inlineText.js:57` (and the image mark, :56/:71)** — **✅ Fixed in `eb646b4`** (scheme allowlist; verified in-browser).

`inlineMarks` builds `<a href="${url}">` from markdown `[label](url)` after `escapeHtml`. The escape
neutralizes attribute *breakout* (`"`, `<`, `>`) — which the header comment correctly documents — but
it does **not** restrict the URL *scheme*. Prose like:

```
[read me](javascript:fetch('/steal?c='+document.cookie))
```

survives escaping untouched and renders a clickable link that executes script in the app origin. Prose
is **editor-authored content rendered to every viewer and admin of the codex**, so this is a
cross-privilege injection: an editor of one codex can plant a payload that runs in an admin's session
(which holds the Firebase auth token) the moment they read the entry. The same gap lets `![](data:...)`
and arbitrary `src` URLs through the image mark.

**Fix:** add a scheme allowlist in `inlineMarks` — permit `http:`, `https:`, `mailto:`, and
relative/anchor URLs; drop everything else to a plain span (or `#`). One pure helper, one test with
`javascript:`/`data:`/`vbscript:` cases. This is the single most important item in this file.

---

## Should-fix

### T2. App boot crashes when `localStorage` is unavailable
**`src/main.js:87`, `:91`, `:110` (top-level, module load)** — **✅ Fixed in `eb646b4`** (`src/utils/safeStorage.js`).

`resolveFirebaseConfig(appConfig.firebase, localStorage.getItem(...))` runs at module scope. In
Safari private mode, storage-partitioned iframes, or when a user has disabled site data, `localStorage`
access **throws synchronously** — which aborts the entire module before anything renders, i.e. a blank
white page with no error surface. `maybeDevSignIn` already wraps its access in try/catch; the boot path
does not.

**Fix:** a tiny `safeStorage` wrapper (get/set swallow and return null) used everywhere
`localStorage` is touched. Pure, testable, ~10 lines.

### T3. Firestore subscriptions swallow errors silently
**`src/utils/firebase.js` — all 11 `onSnapshot(...)` calls; also `subscribePermission`, `subscribeEntries`, `subscribeSchemas`** — **✅ Partially fixed in `eb646b4`**: the content subscriptions (schemas/entries/images) now forward an `onError` that surfaces a recoverable connection banner, plus a `showError()` boot overlay and global handlers. *Remaining:* `subscribePermission` and the admin-roster subscriptions still have no `onError`.

Every `onSnapshot` is called with a success callback and **no error callback**. Firestore delivers
listener failures (permission-denied, network) to the second argument only. Concretely: if an admin
revokes a viewer's access *while they're reading*, the entries/schemas listeners throw
permission-denied, the callback never fires again, and the UI sits on stale content with **zero
indication** anything broke. Same for a dropped connection.

**Fix:** pass an `onError` to each `onSnapshot`; at minimum toast + a "reconnecting/lost access"
state. Pairs with feedback item F2 (there is no connection-loss UX today).

### T4. Image upload has no type or size gate
**`src/main.js:214` `uploadImageToCurrentCodex` → `src/schema/imageUpload.js`**

The upload reads `file.arrayBuffer()` for *any* dropped/picked file — no `image/*` check, no max-size
check — hashes it, and pushes the bytes to Supabase with a passed-through `contentType`. A user can
upload a 100 MB file or a non-image; oversize/rejected uploads surface only as a cryptic downstream
error, and there's no guard against filling the bucket.

**Fix:** validate MIME (`image/*`) and a sane max size (e.g. 5–10 MB) in the picker/coordinator before
reading bytes; show an inline picker error. The validation belongs in a pure helper with a test.

---

## Later (debt to acknowledge, not launch-gating)

### T5. `main.js` is 2273 lines — the repo's own altitude rule
CLAUDE.md: *"Don't grow `main.js` with logic that could be pure."* The icons/emblems panel wiring, the
glyph-designer glue (`openGlyphFor`/`browseGlyphLibrary`/`saveGlyph`), and roster-row assembly are all
extractable into pure modules with tests. Not urgent, but it's drifting from the invariant the codebase
is proud of.

### T6. Admin SVG injected via innerHTML with only a presence check
**`src/schema/iconRegistry.js:110` `validateIcon`, consumed by `getIcon`/`resolveGlyph` → innerHTML**

Icon/emblem `svg` is inserted unescaped into the nav and map. `validateIcon` only checks that an
`<svg>` element is *present* — no sanitization. Writes are admin-only per the rules, so this is
defense-in-depth, not an open hole. But "admin-authored" isn't "safe" (an admin's account can be
phished), and the blast radius is every signed-in user. Worth a lightweight sanitizer or a documented
accepted-risk note.

### T7. No automated parity guard between `firestore.rules` and `capabilities.js`
The two are kept in lockstep by hand and by the CLAUDE.md instruction. `capabilities.test.js` tests the
JS side in isolation; nothing fails CI when the rules drift from the mirror. Consider a checklist test
or a comment-anchored diff so a future edit to one can't silently desync from the other.

### T8. Firestore 1 MB document limit is unguarded
A map field with many roads/territories/waypoints, or a very long prose entry, serializes into a single
entry doc. Approaching 1 MB, `saveEntry` fails inside the transaction with an opaque error. Low
probability at launch scale; worth a size check + friendly message eventually.

---

## Checked and OK (so the next reader doesn't re-audit)

- **Rules ↔ capabilities parity** — admin-by-email, per-codex editor/viewer, schemas admin-only,
  entry version+1 backstop, permissions id-prefix owner check: all mirrored correctly.
- **Version-guard write path** (`saveResolve.js` + `CodexScope.saveEntry`) — conflict detection,
  force-overwrite, full-replace-so-deletions-persist, status-flip-reads-current: all sound and tested.
- **Reference/image resolution** — unresolved refs and missing images degrade to "(unavailable)" /
  not-found SVG, never a broken page.
- **Entry/summary/map rendering** — `escapeHtml`/`escapeAttr` applied consistently to all
  editor-authored text; the only unescaped injections are the trusted glyph registry (T6) and the
  scheme gap (T1).
