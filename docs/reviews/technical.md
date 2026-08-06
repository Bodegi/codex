# Technical review — pre-launch (adversarial pass)

Mechanical / correctness findings from a close read of the core modules (`main.js`,
`firestore.rules`, `capabilities.js`, the write path, and every innerHTML sink). Each item is tagged:

- **Blocking** — fix before launch; a real user or a semi-trusted editor can trigger it.
- **Should-fix** — robustness/correctness gap that will bite in the field; fix before or right after launch.
- **Later** — technical debt to acknowledge, not launch-gating.

This is a living list of what's **open** — resolved items are removed as they land (git history is the
record). Item numbers are stable, so gaps (T1–T3, resolved) are intentional and keep older commit
references meaningful. Suite is green (314 tests).

Overall the architecture holds up under pressure: the pure/impure split is real, the version-guard write
path is careful and well-tested, and `capabilities.js` mirrors `firestore.rules` predicate-for-predicate
with the rules as the true gate. The findings below are the edges.

---

## Blocking

_None open._

---

## Should-fix

_None open._

---

## Later (debt to acknowledge, not launch-gating)

### T5. `main.js` is ~2300 lines — the repo's own altitude rule
CLAUDE.md: *"Don't grow `main.js` with logic that could be pure."* The icons/emblems panel wiring, the
glyph-designer glue (`openGlyphFor`/`browseGlyphLibrary`/`saveGlyph`), and roster-row assembly are all
extractable into pure modules with tests. Not urgent, but it's drifting from the invariant the codebase
is proud of.

### T6. Admin SVG injected via innerHTML with only a presence check
**`src/schema/iconRegistry.js` `validateIcon`, consumed by `getIcon`/`resolveGlyph` → innerHTML**

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
- **Inline rich-text rendering** — link/image schemes are allow-listed and all editor-authored text is
  `escapeHtml`/`escapeAttr`-escaped; the only unescaped injection left is the trusted glyph registry (T6).
- **Subscription error handling** — every `onSnapshot` now carries an `onError`: content subs raise a
  recoverable connection banner, the permission sub resolves off the loading spinner, and the rest toast.
- **Boot robustness** — `localStorage` is read through `safeStorage`, and boot is wrapped in a global
  error boundary (`showError` overlay + `unhandledrejection`/`error` handlers).
- **Image upload** — `validateImageFile` gates type (`image/*`, no SVG) and size (10 MB) in the picker
  with an inline reason, backstopped in the upload path before bytes are read.
