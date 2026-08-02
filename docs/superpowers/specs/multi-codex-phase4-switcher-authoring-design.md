# Multi-Codex Phase 4 — Switcher & Authoring

> Design spec for Phase 4 of the multi-codex rollout. Follows Phase 3 (IA rethink, `e2172f8`).
> Turns the app from "one codex (ATM10), switcher stubbed" into a real host for **multiple
> independent codices** that can be switched, created, and authored in-app. Staged into two
> shippable checkpoints, **4a** (switch) and **4b** (author). Embedded ordered TDD checklists
> stand in for a separate implementation plan.

## 1. Goal

A **real independent codex**: an admin can create a non-ATM10 codex (e.g. a D&D campaign),
give it its own types and entries, author it with **zero ATM10 content bleeding in**, and switch
between codices live. Every user sees the codices their access grants; an admin sees them all.

This is the phase where the app stops being ATM10-shaped. The switcher's *mechanics* are easy
(the Phase 1–2 seams are clean); the real work is **decoupling "bundled ATM10 data" from "the
app's global data"** so each codex reads its own types + entries from Firestore.

## 2. Settled decisions

- **Independence:** full — a second codex is genuinely independent (its own types, entries,
  references, nav), not cosmetic plumbing.
- **New-codex start:** a **template picker** on create — *blank*, or *copy the type structure of
  any existing codex* (schemas only, no entries; ATM10 is just one option among them).
- **Removal model:** **soft archive/restore** (`status: 'active' | 'archived'`) for **codices,
  types, and entries**. No hard delete, no purge in Phase 4 (a purge can come much later, or never).
- **Seed removal:** delete the bundled ATM10 seed (`seedData`/`seedSchemas` content) **and**
  `seedCodex.js` + the admin "Initialize codex" button — leftovers now that Firestore is the source
  of truth. Replace with a small **neutral demo fixture** used only by local-only mode + tests.
- **Local-only mode:** stays **single-codex** from the demo fixture — no switcher, no Firestore.
- **Staging:** split **4a** (switch between existing codices) / **4b** (author & manage codices).

## 3. Non-goals (explicitly deferred)

- Hard delete / purge of any archived codex/type/entry.
- Multi-value references (`create.civilization` stays lossy — separate backlog item).
- Map component / Atlas-as-a-type, summary-card component (component-composition umbrella).
- Firestore app-global icon overlay + admin icon management.
- GitHub Pages deploy (the phase *after* Phase 4).

## 4. Why the decoupling is the real work

Three places read **bundled ATM10 constants** instead of the current codex. All three move to
the current codex's live data. This is the crux of 4a.

1. **`schemaStore` is a global floor.** `listTypes()` returns `seedSchemas.map(...)` — the bundled
   four — for *every* codex, and the overlay + `localStorage` key are single global stores. A
   second codex would still show "Civilizations." → **`schemaStore` becomes codex-aware.**
2. **Nav entries + references are seed-only.** `SEED_BY_TYPE` / `entriesOfType` / `findSeedEntry`
   and `renderCtx.resolveRef`/`listEntries` in `main.js` resolve entirely against bundled
   `seedData`. Switching codex wouldn't change the sidebar entries. → **live Firestore entry index.**
3. **The localStorage overlay is global**, so an edited schema from one codex bleeds across a
   switch. → **per-codex overlay key.**

Removing the bundled seed (below) *simplifies* this: with no floor, `schemaStore` is purely
codex-driven, and the old "reset a type back to its bundled seed" semantics dissolve into
"archive" or "revert to last saved."

## 5. Architecture

### 5.1 Seed removal + neutral demo fixture

- **Delete:** the ATM10 content in `src/data/seedData.js` and `src/schema/seedSchemas.js`;
  `src/data/seedCodex.js` (`buildAtm10Seed`/`seedAtm10Codex`) and their tests; the admin
  "Initialize codex" button + `window.seedCodex` wiring in `main.js`. ATM10's content already lives
  in `codices/atm10/…` (seeded in Phase 1) and stays there as the source of truth. Removing the
  bundled copy also **de-publishes ATM10 lore from the public repo**.
- **Add:** `src/data/demoFixture.js` — a small, **ATM10-free** fixture: a couple of generic types
  (e.g. `note` = title + body; `person` = name + bio + a `reference` to a note + a `hero` image)
  chosen to exercise every field kind (`text`/`prose`/`list`/`reference`/`hero`/`gallery`) plus
  inline images. Used **only** by local-only mode and as unit-test fixtures. This is not "the app's
  data" — name/locate it so that's unambiguous.

### 5.2 Codex-aware `schemaStore`

The store shifts from "bundled floor + global overlay" to "**the current codex's schema set**."

- The store stays a **"current codex only"** singleton (its existing module-level shape); `main.js`
  **resets it on switch** (clear the type set + overlay) and repopulates from the new codex's
  subscription. `listTypes()` returns the current codex's types, **filtering `status === 'archived'`**,
  ordered. The `archived` filter ships in 4a (forward-compatible); the archive *actions* that write
  the flag arrive in 4b.
- **Source of the set:**
  - *Configured mode:* the current codex's Firestore `schemas` subscription (`CodexScope.subscribeSchemas`).
  - *Local-only mode:* the demo fixture's schemas.
- **Overlay + persistence go per-codex:** the localStorage key becomes `codex_schema_overlay:{codexId}`.
  On switch, clear the in-memory set and hydrate the new codex's key before its subscription lands.
- `getSchema(type)` resolves within the active codex's set. `saveSchemaLocal`/`resetSchema` operate
  on the active codex's key. "Reset to seed" is gone; the Types editor offers **archive** and (for
  Firestore-backed types) **revert-to-last-saved** instead.

### 5.3 Live entry index

- `main.js` subscribes to the **current codex's `entries` collection** and maintains an in-memory
  index grouped by type: `{ [type]: [{ id, title, status, … }] }`.
  - *Configured mode:* a collection subscription on `codices/{id}/entries` (new `CodexScope`
    method, e.g. `subscribeEntries(callback)`).
  - *Local-only mode:* the demo fixture entries.
- Nav entries (`entriesOfType`) and `renderCtx.resolveRef` / `listEntries` read from this index
  instead of `SEED_BY_TYPE`. Archived entries are filtered from nav and from reference pickers,
  but a reference *pointing at* an archived/missing entry still resolves its label gracefully
  (`exists:false` styling, as today).
- Reference resolution is now **codex-scoped and live** — it resolves against the current codex's
  index, closing the "seed-only reference resolution" gap for the active codex.

### 5.4 Data model

- **Codex registry** = existing `codices/{codexId}` meta docs. Add `status: 'active' | 'archived'`.
  `codexId` is the **immutable** Firestore key — **slugified from the name at create**
  (`"My D&D Campaign"` → `my-d-d-campaign`, lowercased, non-alphanumerics collapsed to `-`),
  **uniqueness-checked** against existing codices. **Rename edits `name` only**; the id never moves
  (no doc-id migration).
- **Type schema doc** (`codices/{id}/schemas/{type}`) gains `status: 'active' | 'archived'`.
- **Entry doc** (`codices/{id}/entries/{type}_{id}`) gains `status: 'active' | 'archived'`.
- **Template copy** (create-with-template) reads the **source codex's schema docs** and writes them
  to the new codex with `status` reset to `'active'` and **no entries**.

### 5.5 Firestore rules changes

Two `list` additions (rules stay the source of truth in `firestore.rules`; **re-paste into the
Firebase console**, same as Phase 2). Archive/create/rename are all writes on already-admin-writable
docs — no new predicates needed.

```
match /codices/{codexId} {
  allow list: if isAdmin();                    // admin enumerates all codices
  // existing: allow read (get) if isAdmin() || hasPerm(codexId); allow write if isAdmin();
  ...
}
match /permissions/{doc} {
  allow list: if isSignedIn() && resource.data.uid == request.auth.uid;   // a user finds their own grants
  // existing: allow read (get) by id-prefix or admin; allow write if isAdmin();
  ...
}
```

Client queries: admin subscribes to the `codices` collection; a non-admin queries
`permissions where uid == myUid` then `get`s each referenced codex meta (allowed by `hasPerm`).
Mirrors the existing admin-roster subscribe-all vs. subscribe-own split.

## 6. UX

### 6.1 Switcher (sidebar)

`#codex-switcher` (currently a disabled stub) becomes a real dropdown listing **active codices the
user can access**, with the current one shown. Selecting one switches. For an admin, a **"＋ New
codex"** shortcut opens the Codices admin panel's create form. A single-access user still sees the
control (it just has nothing to switch to).

### 6.2 Codices admin panel (new — 3rd admin tab)

Beside **Access** and **Types**, a new **Codices** panel (admin-only), owning:
- **Create** — name field → derived slug id (shown, uniqueness-checked) + **template picker**
  (*blank* / *copy types from `<existing codex>`*). On submit: write meta `{status:'active'}` →
  grant the creator a permission doc → (if template) copy source schemas → **auto-switch** to it.
- **Rename** — edit display `name`.
- **Archive / restore** — flip codex `status`; archived codices move to an **Archived** grouping in
  this panel (and drop out of the switcher). Restorable.

### 6.3 Types editor (4b additions)

- **New type** — "New type" action → label / icon / starting sections+fields → existing
  `validateSchema` gate → `saveSchema` to the current codex. Appears in nav automatically.
- **Archive / restore** a type (status flip); archived types leave the nav, their entries hidden.
- **Empty state** — a codex with no active types shows "Create your first type" (admin) or "This
  codex has no content yet" (non-admin).

### 6.4 Entry authoring (4b additions)

- **＋ New entry** per type → a blank form built from the type's schema → id assignment
  (slug from the title field, uniqueness-checked within the type) → save.
- **Archive / restore** an entry (status flip); archived entries leave the nav, restorable from an
  admin/archived affordance.

## 7. Re-scope choreography (on codex switch)

1. Persist `currentCodexId` (localStorage `codex_current_id`), set `state.currentCodexId`.
2. Tear down current subscriptions: schema overlay, active doc, **entry index**, (leave the
   admin roster subs — they're app-global, not codex-scoped).
3. Reset `schemaStore` (clear the active codex's type set + in-memory overlay) and the entry index.
4. Re-subscribe for the new codex: `watchOwnPermission()` (→ `recomputeCaps` for this codex),
   schema subscription, entry-index subscription; hydrate the per-codex localStorage overlay.
5. Rebuild nav (`renderTypeNav()` once types arrive); reset `state.formData` to the first active
   entry of the first active type (or an empty state); `applyMode()`.
6. `renderCodexSwitcher()` + `renderSyncStatus()`.

Capabilities are **per-codex** — you may be editor on one codex and viewer on another;
`capabilities.js` already resolves from the current codex's permission, so this is just a re-run.
An admin (by email) stays admin across all codices.

## 8. Testing strategy

Pure-logic-first (`node:test`), matching the existing suite. DOM wiring stays headless-Chrome
smoke-verified in local-only mode (which is why the demo fixture must exist).

- **New pure units:** slug derivation + uniqueness; template-copy payload builder (source schemas →
  new-codex schema docs, statuses reset, no entries); entry-id assignment; `status` filters
  (types + entries + codices); codex-aware `schemaStore` (set replacement, per-codex overlay key);
  the registry list-shaping (admin-all vs. user-own).
- **Update/remove:** delete `seedData`/`seedCodex` tests; swap seed imports in
  `entryRenderer`/`formRenderer`/etc. tests for small inline fixtures or the demo fixture;
  add demo-fixture integrity tests.
- Keep every `CodexScope`/Firestore call behind the pure builders so the new subscriptions stay
  thin adapters over tested logic.

## 9. Staged implementation checklists (TDD-first, in dependency order)

Each item: **write the failing test → implement → green**. This is the executable plan.

### 4a — Switch between existing codices

1. **Demo fixture** — `demoFixture.js` (types + entries exercising all field kinds); integrity test.
2. **Remove seed** — delete ATM10 `seedData`/`seedSchemas` content, `seedCodex.js`, Initialize
   button + `window.seedCodex`; repoint or remove affected tests to the demo fixture.
3. **Codex-aware `schemaStore`** — active-codex type set, `archived` filter, per-codex overlay key,
   reset-on-switch; drop the bundled floor + reset-to-seed. Tests first.
4. **Live entry index** — `CodexScope.subscribeEntries`; in-memory index in `main.js`; repoint
   `entriesOfType` + `renderCtx.resolveRef`/`listEntries`; `archived` filter. Pure index-shaping tested.
5. **Rules** — add the two `list` rules to `firestore.rules`; re-paste to console; document.
6. **Registry read** — admin `codices` subscription; non-admin own-`permissions` query → meta gets;
   pure list-shaping (active-only, sorted) tested.
7. **Switcher + re-scope** — real dropdown; the §7 choreography; persist + restore current codex.
8. **Smoke-verify** (headless, local-only): read/nav still work single-codex; (configured, if
   available) switch atm10 ↔ a manually-created second codex shows distinct types/entries.

### 4b — Author & manage codices in-app

1. **Slug + uniqueness** helper; tests.
2. **Codices admin panel** — create (name→slug, template picker, grant + auto-switch), rename,
   archive/restore + Archived grouping. Template-copy payload builder tested first.
3. **New-type builder** — Types editor "New type" (validate gate) + type archive/restore + empty
   states.
4. **New-entry flow** — "＋ New entry" per type (blank-from-schema, id assignment) + entry
   archive/restore.
5. **Smoke-verify** (headless + a real second codex): create a blank codex → add a type → add an
   entry → reference it → archive/restore each level → rename the codex.

## 10. Risks & notes

- **Rules re-paste is manual** — the app can't enforce the new `list` rules until the console is
  updated; 4a's registry read fails closed (empty list) until then. Call it out at ship.
- **First-render before subscriptions land** — configured mode has no bundled content to show
  pre-subscription; render an explicit loading/empty state, don't flash stale data.
- **Slug collisions** — deterministic slug + uniqueness check; on collision, suffix (`-2`) or reject
  with a message (decide in 4b; reject-with-message is simpler and clearer).
- **Archived-then-referenced entries** — a reference to an archived entry still renders its label
  (graceful), it's just not offered in the picker. Consistent with the existing `exists:false` path.
- **Scope creep guard** — entry/type/codex archive is a *status flag + filter*, not a lifecycle
  engine. Resist adding trash-retention, cascade rules, or bulk ops this phase.
