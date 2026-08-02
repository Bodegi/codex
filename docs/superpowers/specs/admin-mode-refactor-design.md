# Admin as a First-Class Form State — Mode Refactor

> Design spec. Makes **admin-edit a real mode** in the same read/edit state machine, killing the
> bolted-on admin panel and the `switchCodex`/Types-refresh choreography bugs it caused.
> Follows the multi-codex phases (1–4b, all shipped). Precedes the first GitHub Pages deploy.

## 1. Problem

Today the app has **two tangled view-state axes** in `main.js`:

- `state.currentTab` — `'' | <typeKey> | 'admin'`. It conflates *what content* (a type) with *what
  surface* (the admin panel).
- `state.mode` — `'read' | 'edit'`, meaningful **only** when `currentTab` is a type.

Admin is not a real mode. It lives on its own `renderAdminPanel()` path mounted into the same
`#form-container`, re-rendered ad hoc, and it fights the codex-switch choreography. The Phase-4b
`switchCodex` admin-preservation hack (`currentTab='admin'` had to be manually kept) and the
Types-panel-refresh guard were both **symptoms of admin not being a real mode**. There is no single
owner of "what am I looking at," so the two axes drift out of sync and produce bugs.

## 2. Goal & non-goals

**Primary goal (chosen):** *kill the bolted-on seam.* Unify the state machine so admin-edit is a
first-class mode with a single, testable source of truth. The `switchCodex`/content-refresh bug class
disappears because both paths reduce to "re-normalize, then render."

**Non-goals (explicitly ruled out):**

- **No URL / query-param routing.** The app has never used URL state; adding a `popstate` listener,
  boot-time hydration, and `pushState`-on-every-nav would *introduce* new convention, not honor the
  existing one (in-memory state + `localStorage` for the codex id). The backlog's "ideally
  query-param-driven" was a suggested *mechanism*, not the goal. The clean single-source-of-truth
  `state.view` we build here makes adding a URL layer trivial **later** if ever wanted — so we lose
  nothing by deferring it.
- **No deep per-entry linking.** Which specific entry is open stays in-memory (`state.formData`).
- **No redesign of the admin panels themselves.** Users & Access and Codices panels are unchanged;
  we only relocate the controls from the dissolved Types panel.

## 3. The model — per-thing modes

The three modes are **per-type form states of the thing you're looking at**: read the entry → edit the
entry → admin-edit *its type's schema*. Global admin (Users & Access, Codices) is a **separate door**,
not part of the per-type triad.

Replace the two tangled fields with **one discriminated union** — exactly one valid shape at a time:

```
view =
  | { kind: 'type',  type: <typeKey> | null, mode: 'read' | 'edit' | 'admin' }
  | { kind: 'global-admin', panel: 'access' | 'codices' }
```

`type` is `null` **only** in the empty-content case (a codex with no types — see `normalize` in §4);
otherwise it is a real type key.

- `kind: 'type'` is the **content surface**. `mode: 'admin'` means "edit *this type's* schema" — the
  per-thing form state. (Named `mode: 'admin'` internally to match the mental model; the UI labels the
  control **"Structure"**.)
- `kind: 'global-admin'` is the **separate door**. **Types is gone from this subnav** — it dissolved
  into the per-type `admin` mode. Only two panels remain: `access`, `codices`.

Everything else in `state` is unchanged: `formData` (which entry is open), `entryIndex`, `caps`,
`currentCodexId` (still `localStorage['codex_current_id']`), and the schema-editor working state
(`workingSchema`, `editorErrors`). Entry selection stays in-memory.

## 4. Architecture — pure `viewState` module + imperative shell

Matches the codebase's established convention: pure logic in `src/schema/` tested with `node:test`;
`main.js` is the edge adapter that applies it to the DOM.

### `src/schema/viewState.js` (new, pure, node-tested)

**Transitions** (view → view):

| fn | result |
|---|---|
| `selectType(view, type)` | `{ kind:'type', type, mode:'read' }` — selecting a type always lands in read |
| `toRead(view)` | mode → `'read'` (type surface) |
| `toEdit(view)` | mode → `'edit'` (type surface) |
| `toSchemaAdmin(view)` | mode → `'admin'` (type surface) |
| `openGlobalAdmin(view, panel='access')` | `{ kind:'global-admin', panel }` |
| `selectAdminPanel(view, panel)` | set `panel` (global-admin surface) |
| `closeGlobalAdmin(view, fallbackType)` | `{ kind:'type', type:fallbackType, mode:'read' }` |

**`normalize(view, { caps, types })`** — the single clamp that folds in today's scattered guard logic
(the old `ensureTypeSelection` + `applyMode`'s force-to-read):

- `kind:'type'` whose `type` is not in `types` → retarget to the first available type (mode → `read`).
- No `types` at all → an **empty-content** view (a distinct shape, e.g. `{ kind:'type', type:null,
  mode:'read' }`, rendered by the existing empty-codex state).
- `!caps.canEdit` and mode is `edit` or `admin` → mode → `read`.
- `!caps.canAdmin` and `mode:'admin'` → mode → `read`; and `kind:'global-admin'` → fall back to a
  content view (first type, read).
- `kind:'global-admin'` with `caps.canAdmin` → **preserved as-is** (this is the seam-killer: a codex
  switch keeps you in global-admin with no special-case code).

`normalize` is pure and total — given any view + context it returns a valid, permitted view. It is the
only place caps/existence clamping happens.

### `main.js` (the shell)

- Holds `state.view` (the union). Drops `currentTab` and the `'admin'`-in-tab overload; `state.mode`
  and `state.adminPanel` are subsumed by `view`. `state.editingType` becomes derived from
  `view.type` when `mode:'admin'`.
- **`renderView(state.view)`** — the *single* function that applies `view` to the DOM. Replaces the
  scatter of `applyMode` / `switchTab` / `enterAdminTab` / admin-dispatch. Every user action becomes:
  *dispatch a transition → `normalize` → assign `state.view` → `renderView()`.*

## 5. Render & UI wiring

**One flat CSS class** on `#main-workspace` (retiring the error-prone product-of-two-axes
`tab-{builder|admin} × mode-{read|edit}`). `renderView` sets exactly one:

| view | class | layout |
|---|---|---|
| type · read | `view-content-read` | full-width reader (reader IS the preview) |
| type · edit | `view-content-edit` | full-width form; editor-header shown |
| type · admin | `view-content-admin` | schema editor (left) + entry preview (right) — reuses today's `tab-admin` 2-col grid |
| global-admin | `view-global-admin` | panel (left) + blurb/preview (right) — 2-col |

`index.html`'s hardcoded initial `class="app-workspace tab-builder mode-read"` becomes
`class="app-workspace view-content-read"`.

**Header-button visibility** (owned by `renderView`, replacing `applyMode`'s `hidden` toggles):

- `[Edit]` — shown when `kind:'type' && mode:'read' && caps.canEdit`.
- `[Structure]` — **new** control in the reader header next to Edit; shown when `kind:'type' &&
  mode:'read' && caps.canAdmin`. Enters `toSchemaAdmin`.
- `[Save]` / `[Done]` — shown in `mode:'edit'` (content form). The schema editor keeps its own
  Save/Done affordances in `mode:'admin'`.
- `[Archive entry]` — shown in `mode:'edit'` when `formData.id` exists (unchanged rule).

**Entering surfaces:**

- Reader header → `[Edit]` (`toEdit`) and `[Structure]` (`toSchemaAdmin`).
- Header user-menu **Admin** item → `openGlobalAdmin('access')`.
- Codex switcher **＋ New codex** → `openGlobalAdmin('codices')` (same behavior, new plumbing).

**Relocating the dissolved Types toolbar** (in-scope because that panel goes away — move the existing
controls, do **not** redesign them):

- **＋ New type** → sidebar nav, `canAdmin`-gated, symmetric with the per-type **＋ New entry**.
  Creating one lands in that new type's `mode:'admin'` (schema editor).
- **Archive type** → already inside the schema editor (its `archive` intent); it comes along into the
  per-type `admin` surface for free.
- **Rename type** → *net-new, minimal*: the schema editor never edited the type's `label`. Add one
  `label` input to the editor head (one `edit-label` intent) so the Structure surface can rename — the
  smallest control that makes the per-type admin surface coherent, not a redesign.
- **Archived-types restore** → an "Archived" affordance in the nav, mirroring archived entries.

`adminView.js` shrinks: `renderAccessPanel` / `renderCodicesPanel` unchanged; `renderAdminSubnav` and
`renderTypesToolbar` are retired (see §5.1). The schema editor now mounts directly into `#form-container`
under the `view-content-admin` layout.

### 5.1 Refinements landed during implementation

Two UX gaps surfaced in browser verification and were folded in:

- **Structure is a toggle, not a dead end.** The reader-header **Structure** button reads "Structure"
  while reading a type and flips to **"Done"** in schema mode, returning to reading — so you never have
  to click the sidebar to leave. Symmetric with Edit/Done; the schema editor stays free of nav concerns.
- **The sidebar swaps with the surface.** In the global-admin door the sidebar no longer shows the
  content type list; it renders the *admin* nav — **‹ Back to codex** + **Users & Access** + **Codices**
  — via a `renderNav()` dispatcher (`renderTypeNav` for content, `renderAdminNav` for admin). Panel
  switching moves to the sidebar, so the in-panel `renderAdminSubnav` is removed. **‹ Back to codex**
  (`closeGlobalAdmin`) returns to the entry you were reading.

## 6. Data flow — the seam-killer

Both trouble spots collapse into **"re-normalize, then render":**

- **`switchCodex`** — after re-scoping subscriptions, call `normalize(state.view, { caps, types })`.
  Global-admin is preserved automatically; a now-missing type retargets to the first. The Phase-4b
  manual admin-preservation hack and the `liveDocId` reset move into this one path.
- **`onCodexContentChanged`** (schemas arrive) — re-normalize + `renderView`, keeping the existing
  guard that an in-progress `workingSchema` edit is not clobbered when the current type is still valid.

Every other action (nav click, Edit, Structure, Admin menu, New type/entry) is the same
dispatch→normalize→render pipeline.

## 7. Edge cases

All handled by `normalize` (no scattered guards):

- No types in codex → empty-content view (existing empty-codex render).
- Viewer (`!canEdit`) → mode clamped to `read`; `[Edit]`/`[Structure]` hidden.
- Non-admin → cannot reach schema `admin` mode or `global-admin`.
- Zero-access codex → existing gateway / awaiting-access screens, upstream of `view` (unchanged).
- Transient `permission-denied` snapshot error at create→switch — pre-existing, non-recurring, left
  as-is (out of scope).

## 8. Testing

- **New `src/schema/viewState.test.js`** (`node:test`): every transition + `normalize` — caps
  clamping (viewer→read, non-admin→no schema/global-admin), missing-type fallback, **global-admin
  surviving a codex switch**, empty-types → empty-content.
- **Existing 168 tests stay green.** Fix the few referencing the retired `currentTab==='admin'` /
  `adminPanel==='types'`.
- **DOM wiring stays browser-verified** (Chrome extension when connected, else headless
  `google-chrome`): the four render states, `[Structure]` entry into schema mode, global-admin door,
  a live codex switch preserving global-admin, and new-type/archive relocations. Verify against the
  live `atm10` codex; ATM10 data untouched.

## 9. Implementation checklist (ordered, TDD)

Each numbered item is a red→green→refactor step. Run `npm test` after each; browser-verify at the end.

1. **`viewState.js` + tests, pure.** Write `viewState.test.js` first (transitions + `normalize`,
   incl. global-admin-survives-switch and caps clamping), then implement `src/schema/viewState.js` to
   green. No `main.js` changes yet.
2. **Introduce `state.view`; add `renderView`.** Add `state.view` (seeded via `normalize` at boot from
   the current type list + caps). Write `renderView(view)` to set the one flat `view-*` class and the
   header-button `hidden` flags. Do **not** delete the old paths yet — call `renderView` alongside
   `applyMode` and diff behavior.
3. **CSS: flat `view-*` classes.** Add `.view-content-read|edit|admin` + `.view-global-admin` rules
   (porting the current `tab-*`/`mode-*` effects), update `index.html`'s initial class. Remove the old
   `tab-*`/`mode-*` selectors once `renderView` is the sole writer.
4. **Route content actions through transitions.** Nav type-click → `selectType`; Edit → `toEdit`;
   Done → `toRead`; add the **`[Structure]`** button → `toSchemaAdmin`. Delete `switchTab` /
   `applyMode` / `ensureTypeSelection`, replacing call sites with dispatch→normalize→`renderView`.
5. **Route global admin through the door.** Header **Admin** → `openGlobalAdmin('access')`; switcher
   ＋New codex → `openGlobalAdmin('codices')`; subnav buttons → `selectAdminPanel`. Delete
   `enterAdmin`/`enterAdminTab`; shrink `renderAdminSubnav` to two tabs.
6. **Dissolve the Types panel; relocate controls.** Move ＋New type + archived-types into the nav;
   move archive/rename type into the `admin`-mode header; mount the `schemaEditor` under
   `view-content-admin`. Remove Types from the admin subnav path.
7. **Seam-killer.** Rewrite `switchCodex` and `onCodexContentChanged` to the re-normalize→`renderView`
   pipeline; delete the manual admin-preservation hack (keep the `liveDocId` reset and the
   in-progress-edit guard).
8. **Green the suite.** Fix tests referencing retired fields; confirm 168+ pass (new `viewState`
   suite added).
9. **Browser-verify** (§8) against live `atm10`; confirm ATM10 data untouched.
