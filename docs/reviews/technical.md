# Technical review — pre-launch (adversarial pass)

Mechanical / correctness findings from a close read of the core modules (`main.js`,
`firestore.rules`, `capabilities.js`, the write path, and every innerHTML sink). Each item is tagged:

- **Blocking** — fix before launch; a real user or a semi-trusted editor can trigger it.
- **Should-fix** — robustness/correctness gap that will bite in the field; fix before or right after launch.
- **Later** — technical debt to acknowledge, not launch-gating.

This is a living list of what's **open** — resolved items are removed as they land (git history is the
record). Item numbers are stable, so gaps (T1–T3, resolved) are intentional and keep older commit
references meaningful. Suite is green (339 tests).

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

_None open._

---

## Checked and OK (so the next reader doesn't re-audit)

- **Rules ↔ capabilities parity** — admin-by-email, per-codex editor/viewer, schemas admin-only,
  entry version+1 backstop, permissions id-prefix owner check: all mirrored correctly, and now
  guarded against drift by `capabilities.parity.test.js` (admin-email allowlist + role vocabulary
  asserted against `firestore.rules`).
- **Entry document size** — `saveEntry` pre-flights the payload (`checkEntrySize`, guard below the
  Firestore 1 MiB hard cap) and refuses over-size entries with a friendly, coded message before the
  transaction, instead of an opaque in-transaction commit failure.
- **Version-guard write path** (`saveResolve.js` + `CodexScope.saveEntry`) — conflict detection,
  force-overwrite, full-replace-so-deletions-persist, status-flip-reads-current: all sound and tested.
- **Inline rich-text rendering** — link/image schemes are allow-listed and all editor-authored text is
  `escapeHtml`/`escapeAttr`-escaped.
- **Admin glyph SVG injection** — icon/emblem markup is sanitized (`sanitizeSvg`) at the ingestion
  choke point (the icons/emblems subscriptions), stripping script/foreignObject/style, `on*` handlers,
  and javascript:/vbscript:/data: URLs before it reaches any `innerHTML` sink. Lightweight
  defense-in-depth behind the admin-only write rules; exhaustive entity evasion is accepted residual.
- **Subscription error handling** — every `onSnapshot` now carries an `onError`: content subs raise a
  recoverable connection banner, the permission sub resolves off the loading spinner, and the rest toast.
- **Boot robustness** — `localStorage` is read through `safeStorage`, and boot is wrapped in a global
  error boundary (`showError` overlay + `unhandledrejection`/`error` handlers).
- **Image upload** — `validateImageFile` gates type (`image/*`, no SVG) and size (10 MB) in the picker
  with an inline reason, backstopped in the upload path before bytes are read.
