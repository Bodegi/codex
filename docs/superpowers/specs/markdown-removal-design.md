# Markdown Removal — Design Spec

## Goal

Remove the markdown layer from the render pipeline. It was an artifact of the first
draft (when markdown was going to be the storage format). JSON is now the source of
truth, so compiling structured `formData` into a markdown string only to regex-parse
it back into HTML is an unnecessary middleman. Replace it with **direct
structured-field → HTML rendering**, plus a **tiny inline formatter** for the small
amount of rich text that lives inside free-text fields.

This is a self-contained cleanup and is sequenced **before** the image pool, so the
image pool builds on the clean render path.

## Current state (context)

Render pipeline today (`src/main.js` + `src/utils/markdownCompiler.js`):

```
formData → compile{Type}Markdown(data) → markdown string
         → renderMarkdownToHTML(string) → previewRendered.innerHTML
```

- `compileMarkdownForCurrent()` / `compileAndRefreshMarkdown()` (main.js) drive it.
- `renderMarkdownToHTML()` is a naive regex renderer — it mangles tables and nested
  lists, and only escapes HTML inside the frontmatter block.
- `state.compiledMarkdown` is stored but **never persisted** — its only real use is a
  "is there anything to save" guard in the Save handler (`main.js` ~438). JSON
  (`currentEntryJson()`) is what actually saves, locally and to Firestore.

So nothing downstream depends on the markdown string. It is pure render scaffolding.

## Non-goals (out of scope)

- Adding new markdown features or a full markdown library.
- Changing storage, the Raw JSON tab, or the data model (unchanged — object in,
  JSON out).
- The image pool itself (separate spec). This cleanup only makes room for it.

## Design

### Replace the pipeline with direct rendering

New module **`src/utils/entryRenderer.js`** (replaces `markdownCompiler.js`):

- `renderEntryHTML(type, data)` → returns the entry page HTML directly. One function
  per entry type internally (civ / mod / region / decision), mirroring the field
  layout the `compile*Markdown` functions currently encode — but emitting
  `<h2>…</h2><p>…</p>` etc. straight, instead of `## …` markdown.
- `formatInline(text)` → the tiny inline formatter, applied to free-text field
  values (see below).

`renderMarkdownToHTML` and all four `compile*Markdown` functions are **deleted**.

### The tiny inline formatter

`formatInline(text)` supports a deliberately small subset, applied **after**
HTML-escaping the input:

- Paragraphs / line breaks (blank line → paragraph, single newline → `<br>`)
- **Bold** (`**x**`) and *italic* (`*x*`)
- Links (`[text](url)`)
- Inline images (`![alt](url)`) — the `pool:<id>` form is added when the image pool
  is built
- Simple unordered lists (`- ` lines)

Anything else renders literally. Because fields are no longer treated as full
markdown documents, the "naive renderer mangles tables / nested lists" gap simply
goes away — those constructs were never a real use case for a single prose field.

**HTML escaping is now applied to all field values** (the old renderer only escaped
the frontmatter block). Cheap correctness win for a shared tool.

### Metadata box

Keep the styled "Metadata" callout at the top of the preview (it's a nice touch),
but render it **from the entry object's key fields directly** (id, title, type, and a
couple type-specific keys) — not from a YAML string. Reuses the existing
`.frontmatter-box` styles (renamed to `.metadata-box`).

### main.js wiring

- `compileMarkdownForCurrent()` / `compileAndRefreshMarkdown()` → replaced by a
  single `refreshPreview()` that calls `renderEntryHTML(state.currentTab, state.formData)`
  and sets `previewRendered.innerHTML`.
- `state.compiledMarkdown` → **removed**. The Save-handler guard becomes an
  emptiness check on `state.formData` (e.g. has an `id` or any non-empty field).
- Update imports.

## Affected files

| File | Change |
|---|---|
| `src/utils/markdownCompiler.js` | **Deleted**, replaced by `entryRenderer.js`. |
| `src/utils/entryRenderer.js` | **New.** `renderEntryHTML(type, data)` + `formatInline(text)`. |
| `src/main.js` | Swap compile/render calls for `refreshPreview()`; remove `state.compiledMarkdown`; fix Save guard; update imports. |
| `src/styles/main.css` | Rename `.frontmatter-box` → `.metadata-box`; keep styling. |

Raw JSON tab, builders, storage, and the data model are untouched.

## Verification

No test suite exists, so verify by build + browser smoke test:

- `npm run build` clean.
- Each entry type (civ / mod / region / decision) renders in the Visual Preview
  with headings, prose, and the metadata box — matching today's look minus the
  markdown round-trip.
- Bold / italic / links / a simple list inside a prose field render correctly.
- Raw JSON tab and Save (local + "nothing to save" guard) still behave.

## Defaults locked

- Inline formatter subset: paragraphs/breaks, bold, italic, links, inline images,
  simple `- ` lists. No tables, no nested lists, no headings inside fields.
- Metadata box kept, rendered from the object directly.
- Module renamed `markdownCompiler.js` → `entryRenderer.js` (the old name is a
  misnomer once markdown is gone).
- All field values HTML-escaped before formatting.
