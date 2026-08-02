# Multi-Codex Phase 3 — Navigation / IA Rethink (design)

Status: approved design, ready for implementation
Date: 2026-08-01
Series: multi-codex rollout (Phase 1 data model → Phase 2 access control → **Phase 3 IA rethink** → Phase 4 switcher wiring)

## Purpose

The UI still carries the rough-draft shape of a form-first, single-world tool. The app has since
become read-first, multi-role (admin/editor/viewer), and a host for *multiple* codices — but the
chrome doesn't reflect that. This phase re-shapes the information architecture to match what the app
actually is, and strips two cross-cutting legacies: **hardcoded emojis** and **ATM10-specific
language**. It deliberately stops short of the multi-codex *switcher wiring* (Phase 4).

### Goals

- Replace the top type-tabs **and** the "Quick Presets" chip bar with a single, coherent **left
  sidebar**: codex → type → entry.
- Make navigation **data-driven** from the current codex's `listTypes()` — no hardcoded types, no
  hardcoded special views.
- Adopt a **read-first content model**: full-width reader by default; editing swaps in a full-width
  form (the reader *is* the preview).
- Remove **all emojis** from data and code; replace with a **data-driven icon registry**.
- Remove **ATM10-specific language** — the shell is codex-agnostic; ATM10 is just a codex named
  "ATM10", its identity living in data.
- Fold in the two parked cleanups with the same root cause: **stale "Markdown" wording** and
  **per-entry Save living in the global header**.

### Non-goals (explicitly out of scope this phase)

- The multi-codex switcher **wiring** — codex registry, create/select/rename, re-scoping
  subscriptions, recomputing capabilities on switch. That is **Phase 4**. This phase builds the IA the
  switcher slots into; the codex dropdown renders the *current* codex only.
- Rebuilding Atlas or Matrix (see Parking Lot).
- Any component-composition refactor of `fieldKinds`.
- A Firestore icon collection or in-app icon management (see Parking Lot).

## Guiding principle (recorded, not built here)

**Types are compositions of reusable components.** Today's `fieldKinds` (text, prose, list,
reference, hero, gallery) are the first components. Under this lens there are *no* special non-type
views — Atlas becomes a type once a **map component** exists; Matrix's cards become a **summary-card
component + index rendering**. This phase does not implement component composition, but the IA is
designed around it: the only fixed, non-type item in the whole app is **Admin**.

## Design

### 1. Overall layout

Three regions, pure CSS, responsive, no visual library:

- **Top header** — identity only.
- **Left sidebar** — all navigation (persistent).
- **Content area** — reader-first; editing swaps in a full-width form.

The "Quick Presets" bar, the top type-tabs, and the two-panel form+preview split are all removed.

### 2. Left sidebar

Top-to-bottom:

1. **Codex switcher** — a single dropdown showing the *current* codex's name (e.g. `ATM10`). This
   phase renders the current codex only; opening/selecting/creating other codices is Phase 4. The
   control exists now so Phase 4 has its home.
2. **Data-driven type list** — rendered from the current codex's `listTypes()`. Each type row shows
   its **data-driven icon** (see §5) and label, and expands to its **entries**. New types (created by
   a future admin builder) appear here automatically — nothing hardcoded in `index.html`.
3. A divider, then **Admin** — the only fixed, non-type item; visible only when `state.caps.canAdmin`.

Matrix and Atlas do **not** appear: they are not data types. Their code remains in the repo, resurfacing
only when they become genuine types (Parking Lot).

Interaction: selecting an entry calls the existing `loadEntry`; selecting a type shows/reveals its
entries. Active type/entry get a pure-CSS active state (left-bar accent); expand/collapse chevrons are
CSS border-triangles.

### 3. Content area (read-first)

- **Read mode (default, everyone):** full-width **reader** — the published page produced by
  `renderEntryHTML`.
- **Edit mode (`state.caps.canEdit` only):** an **Edit toggle in the reader header, next to the entry
  title**, swaps the reader for a **full-width form** (`renderForm`). There is **no standing preview
  panel** — the reader is the preview. **Per-entry Save lives in the form** (not the header). Save →
  return to the updated reader.
- The **Raw JSON** two-way editor is **removed from the content-edit path** and relocated to the
  **admin/power-tool** side (exact placement is a Parking Lot detail; this phase just stops surfacing
  it in the normal editor).

Viewers (no `canEdit`) never see the Edit toggle → read-only by construction, consistent with Phase 2.

### 4. Header

- **Generic app name ("Codex Studio") + auth badge only.**
- **Open File / Save File are removed** — markdown-era leftovers with no purpose under Firestore +
  in-form per-entry Save. Their handlers and the fallback file input are removed too.

### 5. Icons (data-driven, this phase)

- A **bundled icon registry in code** — a new module mapping `iconKey → inline SVG markup` (our own
  markup; not a library). This is an **always-present baseline**, not merely a no-Firebase fallback.
- **Types declare an `icon` key** in their schema → icons are **data-driven per-type**. A sensible
  **default icon** renders when a type declares none or names an unknown key.
- **Merge semantics (designed now, Firestore side parked):** the effective palette is a **concat** —
  `[...bundledDefaults, ...firestoreIcons]` — *not* a per-key replace. Bundled defaults are never
  removed. Keys are unique; a future Firestore icon with a duplicate key resolves **Firestore-wins**
  for that key (lets an admin tweak a default's art). This phase implements only the bundled side plus
  the merge function (so it is unit-testable and Phase-4-ready); no Firestore collection yet.
- Nav rows and app buttons render glyphs via registry lookup. **Every hardcoded emoji is removed**
  from `index.html` and any code/data.

### 6. De-ATM10 language sweep

- App shell → **codex-agnostic** ("Codex Studio"); drop "World Design Engine & Interactive Atlas" and
  the ATM10 brand. ATM10 becomes a codex *named* "ATM10" (identity in data).
- Audit **all visible strings** — `<title>`, brand text, tooltips, toasts, button labels, the stale
  **"Markdown"** copy (`btn-open-file`/`btn-save-disk` titles, "Raw Markdown" comments), and the
  `markdown-body` class — and align them with the codex-agnostic, JSON storage reality. (Open/Save
  buttons are removed outright, resolving those two specifically.)

## Components / units touched

| Unit | Change |
|---|---|
| `src/schema/iconRegistry.js` (new) | Bundled `iconKey → svg` map; `getIcon(key)` with default fallback; `mergeIcons(bundled, extra)` concat + dedupe-by-key (extra wins). Pure, Node-tested. |
| `src/schema/seedSchemas.js` | Add an `icon` key to each of the 4 bundled type schemas. |
| `src/schema/schemaValidate.js` | Tolerate an optional `icon` field (unknown key is non-fatal → default). |
| `src/schema/navModel.js` (new) | Pure `buildNavModel(types, entriesByType)` → the sidebar tree the DOM renderer consumes. Node-tested. |
| `index.html` | Structural rewrite: header (name + auth only), sidebar skeleton, content area. Remove preset bar, top-tabs, file buttons + fallback input, all emojis. |
| `src/styles/main.css` | Sidebar layout + responsive; active states; CSS chevrons; icon sizing; rename `markdown-body`; delete dead preset/tab/file-button styles. |
| `src/main.js` | Render sidebar (current-codex dropdown shell; data-driven type list + entries; Admin gated); wire selection → `loadEntry`; Edit toggle in reader header; read/edit full-width swap; per-entry Save into the form; stop surfacing Raw JSON in the editor (relocate hook to admin); remove file-I/O handlers; string updates. |
| `src/utils/entryRenderer.js` | Reader header hosting the title + (canEdit) Edit toggle affordance, if cleaner here than in `main.js`. |

## Data flow

- Boot: `listTypes()` (bundled seed + per-codex schema overlay, unchanged) → `buildNavModel` → sidebar
  DOM. Each type's `icon` key → `getIcon` → inline SVG.
- Select entry → `loadEntry` → reader (`renderEntryHTML`).
- Edit toggle (canEdit) → `renderForm` full-width; in-form Save → persist (existing `fbManager` /
  local path) → re-render reader.
- Capability gates unchanged: `state.caps.canEdit` (Edit toggle), `state.caps.canAdmin` (Admin item).

## Error / edge handling

- **No entries for a type:** type row expands to an empty-state hint; no crash.
- **Single codex / no others accessible:** dropdown shows the current codex as a plain label (nothing
  to switch to) — no error.
- **Unknown/missing type icon:** default icon; never a broken glyph.
- **Local-only / unconfigured boot:** bundled schemas + bundled icon registry → nav renders with no
  Firebase; no Admin (no caps); reader works. Matches the Phase-2 resilient boot.
- **Viewer role:** no Edit toggle, no Admin — read-only by construction.

## Testing

- **Unit (Node, TDD):** `iconRegistry` (lookup, default fallback, `mergeIcons` concat + duplicate-key
  Firestore-wins), `navModel` (`buildNavModel` shape from types/entries, empty-type case),
  `schemaValidate` tolerating the `icon` field.
- **Browser-verified (build + preview + headless Chrome, matching existing split):** sidebar renders
  from data; type expand/collapse; entry selection loads the reader; Edit toggle appears only for
  canEdit and swaps to the form; in-form Save round-trips to the reader; Admin item only for canAdmin;
  no emojis / no ATM10 strings remain in rendered DOM.

## Parking Lot (recorded, not built this phase)

1. **Component-based type composition** — formalize `fieldKinds` as *components*; types compose them.
2. **Map component** → unlocks **Atlas as a type**.
3. **Summary-card component + index rendering** → generalizes the Matrix cards (define what a card
   shows and what "render many" means).
4. **New-type form builder in Admin** — create/delete types, not just edit the built-in 4.
5. **Firestore icon overlay + in-app admin icon management** — persist `firestoreIcons` and concat via
   `mergeIcons`. **Scope: app-global** (a single top-level `icons` collection shared across all
   codices, over the bundled baseline) — decided 2026-08-01. Duplicate-key = Firestore-wins.
6. **Raw JSON as an admin/power tool** — concrete placement in the admin section.

## Implementation checklist (ordered; doubles as the plan)

Each task is independently verifiable. TDD where a pure-logic note is given; otherwise browser-verify.

1. **Icon registry (TDD).** `iconRegistry.js`: bundled `iconKey → svg`, `getIcon(key)` (default
   fallback), `mergeIcons(bundled, extra)` (concat, dedupe-by-key with extra winning). Tests first.
   _Verify:_ `npm test` green for the new suite.
2. **Schemas declare icons.** Add `icon` keys to the 4 seed schemas; make `schemaValidate` tolerate an
   optional `icon`. _Verify:_ validate tests pass; seed-integrity tests pass.
3. **Nav model (TDD).** `navModel.js`: `buildNavModel(types, entriesByType)`; cover the empty-type
   case. _Verify:_ new suite green.
4. **HTML skeleton.** Rewrite `index.html`: header (name + auth), sidebar container, content area;
   delete preset bar, top-tabs, Open/Save buttons + fallback input, and every emoji. _Verify:_ build
   succeeds; headless-Chrome DOM dump shows no emoji and no ATM10 brand strings.
5. **CSS.** Sidebar layout + responsive; active states; CSS chevrons; icon sizing; rename
   `markdown-body`; remove dead preset/tab/file styles. _Verify:_ headless screenshot review at
   desktop + narrow widths.
6. **main.js wiring.** Render sidebar (current-codex dropdown shell; data-driven type list + entries;
   Admin gated); selection → `loadEntry`; Edit toggle in reader header; read/edit full-width swap;
   per-entry Save moved into the form; stop surfacing Raw JSON in the editor; remove file-I/O
   handlers. _Verify:_ headless smoke — nav → reader → edit (canEdit) → save → reader; Admin gating.
7. **String sweep.** Audit all visible strings (titles, tooltips, toasts, labels, Markdown-era copy);
   align to codex-agnostic + JSON reality. _Verify:_ grep for `ATM10`/`Markdown`/`World Design` across
   `index.html` + `src/` returns only intentional data references (e.g. the codex *named* ATM10 in seed).
8. **Full verification.** `npm test` (all suites), build + preview, headless smoke across roles.
   _Verify:_ evidence captured before claiming done.
