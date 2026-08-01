# Schema Editor — Design Spec (Phase 2)

> In-app editor that lets authors modify the fields and sections of the existing
> page types from the browser, instead of editing `src/schema/seedSchemas.js` in code.
> Builds directly on the phase-1 schema-driven foundation (commit `0c14fdb`).

## Goal & scope

Phase 1 made rendering schema-driven: a type is one JSON-able schema, consumed by
generic renderers. Phase 2 puts an **authoring UI** on top of that foundation so a
non-developer author (the user + a couple of friends) can shape a type from the browser.

**In scope:** editing the fields and sections of the **four existing built-in types**
(civilization, mod, region, decision) — add / edit / remove / reorder fields, and
add / remove / reorder sections.

**Out of scope (deferred, not part of this phase):**

- Creating brand-new types from scratch, and deleting types. (Only the 4 built-ins
  exist, so nav stays hardcoded in `index.html` — no `listTypes()`-driven nav needed yet.)
- Multi-value references.
- A data-migration engine for existing entry data (see the immutable-key decision below —
  the design avoids needing one).

## Key decisions

- **Editor lives on a dedicated "Types" tab**, not a modal or a mode-toggle on the
  builder. Clean separation of authoring-types from authoring-content.
- **Structured editor is the primary UI; a raw-JSON view is a secondary "Advanced"
  escape hatch.** Both are two views of one in-memory working schema. The generic
  meta-schema approach (dogfooding `formRenderer` to edit schemas) was rejected — a
  schema is nested with reordering, which the flat field kinds don't express, so it
  would add complexity to the core renderer to serve one screen (YAGNI).
- **Field `key` is immutable once created.** The `key` is the storage key entry data
  lives under; renaming it would silently orphan every existing entry's data. The key is
  auto-derived (slugified, uniqueness-enforced) from the label at field *creation* and
  read-only thereafter. Label / kind / other attributes stay freely editable.
- **Removing a field is non-destructive.** Existing entry data under that key is left
  untouched (harmless, just unrendered). No migration engine needed.
- **Three-tier persistence:** live overlay → `localStorage` → Firestore. Works fully
  local-only today (no Firebase project exists yet) and cloud-syncs later with no rework.
- **Save is gated by validation; every built-in type has a "Reset to default"** that
  clears the overlay back to the immutable bundled seed — the always-safe recovery path.

## UI shell & layout

A new `data-tab="types"` nav button ("Types") in `index.html`. Its `case 'types'` in
`switchTab` reuses the **existing two-panel builder layout** rather than inventing a new one:

- **Left panel** (`formContainer`) → the structured `schemaEditor`: a type picker for the
  4 built-ins, plus the selected type's sections and fields as editable rows with
  add / edit / remove / reorder (↑↓) controls, a per-type **Save** and **Reset to default**.
- **Right "Visual Preview"** → live-renders the *type's* form + a sample read-view as the
  author edits (driven through `setOverlaySchema` on the working schema), so editing is
  never blind.
- **Right "Raw JSON"** → shows the working schema as JSON, **editable** = the Advanced
  escape hatch, reusing the entry Raw-JSON tab pattern (valid JSON applies to the working
  schema; invalid JSON shows an inline error and leaves state untouched).

The Presets bar row stays empty for the Types tab (it is content-authoring furniture),
consistent with how the matrix/atlas tabs use the layout.

## Data model & edit semantics

The working schema is a **deep clone** of `getSchema(type)` held in editor state; nothing
is committed until Save. Schema shape is unchanged from phase 1:

```
{ type, label, idField, titleField,
  sections: [ { title, fields: [ { key, label, kind, placeholder?, showInMetadata?,
                                    targetType?, inputType? } ] } ] }
```

**Field operations:** add, edit, remove, and reorder (↑↓) **within a section**. Moving a
field between sections is out of scope for phase 2. The field editor exposes:

- `label` — free text.
- `key` — auto-derived from the label on **creation** (slugify + enforce uniqueness within
  the type), **read-only afterward**.
- `kind` — a picker enumerated from the `fieldKinds` registry (`text`, `prose`, `list`,
  `reference`) plus the media kinds (`hero`, `gallery`) from `MEDIA_KINDS`.
- `placeholder` — free text.
- `showInMetadata` — boolean (drives the metadata callout).
- `targetType` — shown **only** when `kind === 'reference'`; picker over the known types.
- `inputType` — shown **only** when `kind === 'text'` (e.g. `text`, `number`, `date`).

**Section operations:** add (with a title), remove, reorder (↑↓), rename title.

**Removing a field or section is non-destructive** to entry data — orphaned values remain
in stored entries and are simply not rendered.

## Persistence & precedence

- **Save** (per type, after validation passes):
  1. `schemaStore.setOverlaySchema(type, schema)` — live render updates immediately.
  2. Persist the overlay to `localStorage['codex_schema_overlay']` as a `{ [type]: schema }` map.
  3. `fbManager?.saveSchema(type, schema)` — cloud write when Firebase is configured; a
     no-op otherwise.
- **Boot / hydrate:** `schemaStore` loads the overlay from `localStorage` first (so local
  edits survive reload today). The Firestore `subscribeSchemas` subscription then wins if
  present — last-writer, acceptable for a 3-person tool.
- **Reset to default** (per type):
  1. `schemaStore.setOverlaySchema(type, null)` (falls back to bundled seed).
  2. Delete that type's entry from the `localStorage` overlay map.
  3. `fbManager?.deleteSchema(type)` when configured.

Precedence at read time is unchanged from phase 1: `getSchema` returns overlay-if-present
else bundled seed. The bundled seed is immutable and always the ultimate fallback.

## Validation (gate on Save)

`validateSchema(schema) → { ok, errors[] }`, a **pure** function. Save is blocked and the
errors shown inline when any of these fail:

- Field `key`s are unique within the type.
- Every field `kind` is known: in the `fieldKinds` registry **or** `MEDIA_KINDS`.
- Every `reference` field has a non-empty `targetType`.
- The schema still has an `idField` and a `titleField`, and each names an existing field.
- Every section has a non-empty `title`.

The raw-JSON Advanced view additionally requires the text to `JSON.parse` before it can be
applied to the working schema; a parse error is inline and non-destructive.

## Components / file map

| File | Change |
|---|---|
| `src/components/schemaEditor.js` | **New.** Builds the structured editor DOM and exports pure working-schema mutation helpers (add/remove/reorder field & section, `deriveKey(label, existingKeys)`). Kind list sourced from `fieldKinds` + `MEDIA_KINDS`. |
| `src/schema/schemaValidate.js` | **New, pure.** `validateSchema(schema) → { ok, errors[] }`. Node-testable, no DOM/Vite coupling. |
| `src/schema/schemaStore.js` | Add `localStorage` hydrate + persist for the overlay; add `resetSchema(type)`. `getSchema`/`listTypes`/`setOverlaySchema` unchanged in signature. |
| `src/utils/firebase.js` | Add `saveSchema(type, schema)` and `deleteSchema(type)`, mirroring `saveDoc` / `saveMapData` against the `codex_schemas` collection (doc id = `type`). |
| `src/main.js` | `case 'types'` in `switchTab`; wire editor events → working-schema mutations → live preview via overlay; raw-JSON apply; Save (validate → persist three tiers) and Reset. |
| `index.html` | Add the "Types" nav button. |
| `src/styles/main.css` | Editor row / control styling. |

## Testing

Consistent with the phase-1 split — pure logic gets `node:test` suites; DOM wiring stays
headless-screenshot verified.

- `src/schema/schemaValidate.test.js` — each rule (duplicate key, unknown kind, reference
  without target, missing/dangling idField/titleField, empty section title) + a happy path.
- `src/schema/schemaStore.test.js` (extend) — overlay hydrate/persist/reset and
  overlay-wins-over-seed precedence. localStorage is stubbed for Node.
- `src/components/schemaEditor.test.js` — the exported pure mutation helpers: add / remove /
  reorder field & section, and `deriveKey` (slugify + uniqueness).
- DOM wiring (row buttons, live preview through the overlay, raw-JSON apply, Save/Reset)
  is verified via the existing headless-Chrome screenshot smoke flow.

## Out-of-scope follow-ups (parking lot)

- Creating and deleting **types** (would introduce `listTypes()`-driven nav — §6 of HANDOFF).
- Multi-value references.
- Moving a field between sections.
- Firestore security rules / the Discord→Firebase custom-token bridge (the client-side
  allowlist does not protect schema writes any more than it protects entry writes).
