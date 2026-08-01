# Schema-Driven Pages — Design Spec

## Goal

Generalize the app away from **hardcoded per-type templates** toward a
**schema-driven** model. Today each entry type (civilization / mod / region /
decision) is defined by hand in three places:

1. a **builder** (`render*Form` in `src/components/*Builder.js`),
2. a **render branch** (`renderEntryHTML` in `src/utils/entryRenderer.js`),
3. **glue in `main.js`** — the `civ-`/`mod-`/`region-`/`adr-` id-prefix convention
   and the tab→builder/tab→seed `switch` statements.

Adding or changing a page type means editing code in all three. After this work, a
type is described by **one JSON-able schema object**, and generic renderers consume
it. Adding a type or changing a field becomes a **schema edit, not a code change**.

This spec is the **core** of that shift. An eventual **in-app schema editor** (so a
non-dev can define types from the browser) is explicitly a **follow-up spec** built
on this foundation — the schema format and generic renderers designed here are what
that editor will produce and consume.

## Direction context (settled, do not re-litigate)

- **The web app is the product** (read + write). Deploy target is **GitHub Pages** on
  the user's personal account.
- **GitHub Pages is a static host.** The built HTML/JS/assets ship statically; the
  browser talks to **Firestore** at runtime for live/shared data. "Static site + live
  backend" — not "runs on my machine."
- **Schemas follow the same storage pattern as entries:** a **bundled seed** (always
  available offline / on a fresh clone / before a Firebase project exists) plus a
  **Firestore overlay** that wins when configured. Firestore is *layered on*, not a
  hard runtime requirement.
- **Field vocabulary is the rich set:** `text`, `prose`, `list`, `reference`, plus
  media (`hero`, `gallery`). Inline images stay inside `prose` (`![](pool:id)`).
- **Unified sections** drive both the edit form and the reading view. **No emojis** in
  section headers.

## Non-goals (out of scope for this spec)

- The **in-app schema editor** UI (schema CRUD, validation UI). Follow-up spec.
- Writing schemas **to** Firestore from the app. Phase 1 wires the Firestore *read*
  overlay only; schema authoring is dev-edits-a-bundled-file + rebuild.
- **Multi-value references** (a field holding several entry ids). Phase 1 references
  are single-value. `assignedMods`/`exports`/etc. stay `list` (plain strings).
- New field kinds beyond the six named above (no `date`, `number`, `enum/select`).
  A plain `text` field covers dates (e.g. decision `date`) for now.
- Runtime image upload, filestore, cropping — unchanged from the image-pool spec.
- A dual-path / feature-flagged migration. This is a **clean cutover** (no real users
  or persisted data yet).

## Current state (context)

- **Builders** (`src/components/*Builder.js`) return form HTML strings. Inputs use
  `id="civ-<key>"` etc.; civ/mod/region builders also append `renderMediaControls`.
- **`renderEntryHTML(type, data)`** (`src/utils/entryRenderer.js`) has a `switch` with
  one `render*` function per type. Each builds a metadata callout from a hand-picked
  subset of fields, an `<h1>`, a hero image, then an ordered flat list of
  `section(label, value)` calls (`<h2>` per field). A few composites exist: civ's
  "Trade" bullet list (exports + imports), decision's inline "Date:" line.
- **`main.js`** dispatches forms via an `if/else` on `state.currentTab`
  (`renderFormWithoutResubscribe`, ~line 260), and the input listener strips the id
  prefix with `fieldId.replace(/^(civ|mod|region|adr)-/, '')` (~line 281) to derive
  the `formData` key. Tab→seed mapping is a `switch` in `switchTab` (~line 173).
- **Entry data** is flat objects of mostly-string fields. "List-like" values
  (`exports`, `assignedMods`, `majorCities`) are **comma-joined strings** today.
- **Media** (hero / gallery / inline) is already wired generically across civ/mod/
  region from `main.js` via `mediaControls.js` — the precedent this work extends.
- **No test framework** exists; verification is headless-Chrome screenshots. Node is
  24.14.1 (has built-in `node:test` + `assert`).
- **`src/utils/githubApi.js`** is dead code (never imported).

## Schema format

One schema object per type. JSON-able (no functions) so it can later live in
Firestore and be produced by the editor.

```js
{
  type: 'civilization',      // stable id: matches tab key + Firestore doc prefix
  label: 'Civilization',     // nav + display name
  idField: 'id',             // which field holds the entry's stable id
  titleField: 'name',        // which field becomes the <h1> in the read view
  sections: [
    {
      title: 'Core Identity',              // plain text, no emoji
      fields: [
        { key: 'id',   label: 'Civilization ID', kind: 'text',
          placeholder: 'e.g. dwarves', showInMetadata: true },
        { key: 'name', label: 'Title / Name',    kind: 'text',
          placeholder: 'e.g. Dwarves — Masters of Industry' },
        { key: 'philosophy', label: 'Philosophy', kind: 'prose' },
        { key: 'history',    label: 'History',    kind: 'prose' },
      ],
    },
    {
      title: 'Economy & Trade',
      fields: [
        { key: 'economy', label: 'Economy', kind: 'prose' },
        { key: 'exports', label: 'Exports', kind: 'list', showInMetadata: true },
        { key: 'imports', label: 'Imports', kind: 'list', showInMetadata: true },
      ],
    },
    {
      title: 'Imagery',
      fields: [
        { key: 'heroImage', label: 'Hero Image',  kind: 'hero' },
        { key: 'gallery',   label: 'Inspiration', kind: 'gallery' },
      ],
    },
    // ...further sections...
  ],
}
```

### Field object

| key | meaning |
|---|---|
| `key` | property name on the entry object |
| `label` | shown in the form and as the read-view field heading (`<h3>`) |
| `kind` | one of `text` / `prose` / `list` / `reference` / `hero` / `gallery` |
| `placeholder` | optional input placeholder |
| `showInMetadata` | optional; include this field in the top metadata callout |
| `targetType` | **reference only**: the type this field links to (e.g. `'civilization'`) |

### Field kinds

| kind | form input | read view | stored value |
|---|---|---|---|
| `text` | `<input>` | `<h3>label</h3>` + escaped text | string |
| `prose` | `<textarea>` | `<h3>label</h3>` + `formatInline` (bold/italic/links/inline pool images) | string |
| `list` | repeatable add/remove rows | `<h3>label</h3>` + `<ul>` | string[] |
| `reference` | `<select>` of entries of `targetType` | live `<a>` navigating to that entry | entry id string |
| `hero` | reuse existing `mediaControls` | reuse existing `heroImage` | pool id string |
| `gallery` | reuse existing `mediaControls` | reuse existing `carousel` | pool id string[] |

## Architecture

### Module map

**New**

| File | Role |
|---|---|
| `src/schema/seedSchemas.js` | The 4 bundled schemas (civ/mod/region/decision) |
| `src/schema/schemaStore.js` | `getSchema(type)`, `listTypes()`; bundled seed + Firestore-overlay seam |
| `src/schema/fieldKinds.js` | Registry: `kind → { renderInput(field, value, ctx), renderRead(field, value, ctx) }` |
| `src/schema/formRenderer.js` | `renderForm(schema, data, ctx)` — walks sections/fields via the registry |

### The render context (`ctx`) — reference resolution seam

`reference` fields are the one kind that needs data beyond the current entry: the
form `<select>` needs the list of target-type entries, and a read-view anchor needs
to know whether its target exists. Rather than reach into global state (which would
break the renderers' testability), both renderers take an optional **`ctx`** —
dependency injection at the edge:

- `ctx.listEntries(type)` → `[{ id, label }]` for a reference `<select>`.
- `ctx.resolveRef(type, id)` → `{ label, exists }` for a read-view anchor.

`ctx` is **optional**. When absent (or the kind isn't `reference`), the renderers are
pure functions of `(schema/field, data)`: a reference input falls back to a disabled
select, and a reference read falls back to a link labeled by its raw id. `main.js`
supplies the real `ctx` from seed + Firestore entry state; unit tests pass a stub.
This keeps every renderer a pure function of its inputs.

**Reworked** — `src/utils/entryRenderer.js`: `renderEntryHTML(type, data)` looks up
the schema and renders generically. Keeps `formatInline`, `escapeHtml`, `heroImage`.

**Deleted** — `src/components/{civilization,mod,region,decisionLog}Builder.js`, and
the dead `src/utils/githubApi.js`.

**Touched** — `main.js` (form dispatch, input handling, reference nav, nav tabs),
`src/data/seedData.js` (list fields → arrays, reference ids), `index.html` (nav tabs
become schema-driven).

### Field-kind registry (the dispatch mechanism)

`fieldKinds.js` exports a map from `kind` to `{ renderInput, renderRead }`. Both the
form renderer and the read renderer look each field's kind up here. **Adding a new
kind = adding one registry entry** (both halves in one place) — this removes the
"two-places" problem at the field level, not just the type level. Chosen over a
`switch` in each renderer (recreates the smell) and a class-per-kind hierarchy
(inheritance where a lookup table suffices).

### Generic form renderer

`renderForm(schema, data, ctx)` emits, per section: a section header (plain text) and
each field via `registry[field.kind].renderInput(field, data[field.key], ctx)`. Every
input carries **`data-field-key="<key>"`** and **`data-field-kind="<kind>"`** —
replacing the `civ-`/`mod-`/`adr-` id-prefix convention entirely.

`main.js` changes:
- `renderFormWithoutResubscribe` collapses to
  `renderForm(getSchema(state.currentTab), state.formData)`.
- The input listener reads `e.target.dataset.fieldKey` (no regex strip) and
  dispatches to the kind's **value reader**: text/prose → string; list → collect row
  values into an array; reference → selected `<option>` id.

### Generic read renderer

`renderEntryHTML(type, data, ctx)`:
1. **Metadata callout** — every field flagged `showInMetadata`, in schema order,
   `key → value` (arrays joined for display).
2. `<h1>` ← `data[schema.titleField]`.
3. Per section: `<h2>section.title</h2>`, then each field via
   `registry[kind].renderRead`. Field label renders as `<h3>` (two-level structure:
   section `<h2>` → field `<h3>`, replacing today's flat h2-per-field list).

`reference.renderRead` emits
`<a data-ref-type="<targetType>" data-ref-id="<id>">…</a>` using
`ctx.resolveRef(targetType, id)` for the label; when `exists` is false it emits a
muted non-link span instead. `hero`/`gallery` delegate to the existing `heroImage` /
`renderCarousel`.

### Schema store

`schemaStore.getSchema(type)` returns the bundled seed schema, overlaid by a Firestore
schema doc if one is present. `listTypes()` returns the ordered type list. Phase 1
wires the **read** overlay only: `fbManager` gains a `subscribeSchemas` method
mirroring its entry subscription; when Firebase is unconfigured the overlay is empty
and bundled seed is the whole story. Schema **writes** are the follow-up editor's job.

### Reference navigation

One delegated click listener on the preview container intercepts clicks on
`[data-ref-type]` and calls a new `loadEntry(type, id)` helper (switch tab + load the
target entry from seed or Firestore). A reference whose target entry is missing
renders as a **muted non-link span**, not a dead anchor.

### Nav tabs from the registry

The entry-type nav buttons (today hardcoded in `index.html`) render from
`listTypes()`, so a new type appears in the nav automatically. `matrix` and `atlas`
remain static special-view tabs (they are views, not entry types).

## Data flow (unchanged in shape)

```
form inputs (data-field-key) → formData → renderEntryHTML(schema) → HTML (Visual Preview)
                             ↘ formData → pretty JSON (Raw JSON tab)
```

The schema is the new input to both render steps; `formData` remains a plain object.

## Seed-data migration

In-place edit of `seedData.js`:
- `list`-kind fields (`exports`, `imports`, `assignedMods`, `majorCities`,
  `minorSettlements`, `landmarks`, …) become **arrays** (split today's comma strings).
- The three `reference` fields become the **target entry's id**:
  `mod.civilization → civ id`, `mod.regionPlacement → region id`,
  `region.dominantCivilization → civ id`.

A unit test asserts every `list` field is an array and every `reference` resolves to
an existing seed entry id.

## Error handling

- **Unknown field kind** → visible `⚠ unknown field kind: <kind>` placeholder in both
  form and read view (never a silent drop).
- **Unknown type** (`getSchema` miss) → empty render + `console.warn` (today's
  behavior).
- **Malformed section** (missing `fields`) → skipped with a `console.warn`.
- **Broken reference** (target id not found) → muted span, not a dead link.

## Testing

`node:test` + `assert` (built into Node 24, **zero new dependencies**). The three
renderers are pure string-returning functions.

- `formRenderer` — schema → expected inputs; `data-field-key`/`data-field-kind`
  present; list rows render; section headers present.
- `entryRenderer` — entry → metadata rows, `<h2>`/`<h3>` structure, reference anchor
  markup, missing-reference muted span.
- `fieldKinds` — each kind's `renderInput` / `renderRead` in isolation, including the
  unknown-kind placeholder.
- `formatInline` — lock in current behavior as a regression guard for the rework.
- Seed migration — every `list` field is an array; every `reference` id resolves.

DOM-dependent wiring (input listeners, reference-click navigation, media controls)
stays browser-verified via headless-Chrome screenshots, as today.

## Out-of-band cleanup folded in

- Delete dead `src/utils/githubApi.js` (never imported).

## What this unlocks (follow-up specs)

- **In-app schema editor** — CRUD over schemas, stored in Firestore (the overlay seam
  and the `subscribeSchemas` read path already exist).
- **Multi-value references** — a field holding several entry ids (extends the
  `reference` kind).

## Implementation checklist

Ordering principle: **steps 1–4 are additive and dormant** — new modules exist but
nothing imports them yet, so `npm run build` stays green and the running app is
unchanged. **Step 5 is the single coordinated activation**: main.js switches to the
generic path, seed data is migrated, and the four old builders are deleted *together*,
so the app never sits half-migrated. Verify each step with
`source ~/.nvm/nvm.sh && nvm use 24.14.1 --silent && npm run build` (and
`node --test` once tests exist); the running app is smoke-checked via headless Chrome
after step 5.

1. **Schema store + seed schemas (dormant).** Add `src/schema/seedSchemas.js` (the 4
   schemas) and `src/schema/schemaStore.js` (`getSchema`, `listTypes`; bundled only,
   Firestore overlay stubbed to empty). No imports yet. Test: `getSchema`/`listTypes`
   return the expected shapes.

2. **Field-kind registry (dormant).** Add `src/schema/fieldKinds.js` — all six kinds'
   `renderInput`/`renderRead` plus the unknown-kind placeholder. Pure; no consumers.
   Test each kind in isolation, including the unknown-kind placeholder and the
   no-`ctx` reference fallbacks.

3. **Generic form renderer (dormant).** Add `src/schema/formRenderer.js`
   (`renderForm(schema, data, ctx)`). Test: schema → inputs carrying
   `data-field-key`/`data-field-kind`; list rows and section headers present.

4. **Generic read renderer.** Rework `entryRenderer.js` so `renderEntryHTML(type,
   data, ctx)` is schema-driven (via `schemaStore` + registry), deleting the four
   per-type `render*` functions. Signature stays call-compatible with today, so the
   build stays green. Fold a **list-normalization** helper into the `list` kind
   (`Array.isArray(v) ? v : String(v).split(',').map(trim)`) so both arrays and legacy
   comma-strings render — this also de-risks step 5. Keep `formatInline`, `escapeHtml`,
   `heroImage`. Test: metadata rows, `<h2>`/`<h3>` structure, reference anchor vs.
   missing-ref muted span.

5. **Activation (one coordinated change).** In `main.js`: replace the form `if/else`
   with `renderForm(getSchema(currentTab), formData, ctx)`; switch the input listener
   to `dataset.fieldKey` + per-kind value readers; add the delegated reference-click
   handler + `loadEntry(type, id)`; render entry-type nav from `listTypes()`. Migrate
   `seedData.js` (list fields → arrays, the three references → target ids). **Delete**
   the four `*Builder.js`. Build, then headless-Chrome smoke-test each tab (form
   render, live preview, a reference click, media controls). Test: seed migration
   (every `list` field is an array; every `reference` id resolves).

6. **Firestore schema overlay (seam).** Wire `schemaStore`'s read overlay to a new
   `fbManager.subscribeSchemas`, mirroring the entry subscription. No-op when Firebase
   is unconfigured. (No schema-write UI — that's the follow-up editor.)

7. **Cleanup.** Delete dead `src/utils/githubApi.js`. Full `node --test` pass + a final
   headless-Chrome smoke pass across all tabs.
