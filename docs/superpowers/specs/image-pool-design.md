# Image Pool — Design Spec

## Goal

Give the Codex a **build-time image pool**: a directory of images committed to the
repo that becomes a selectable set inside the app. Users pick images from the pool
to use as Atlas map backgrounds, per-entry hero images, per-entry carousels, and
inline images in body text. Updating the pool means dropping files in a directory
and rebuilding — no upload, no filestore, no auth.

This is deliberately the "next best thing" to runtime uploads. The architecture
leaves a clean seam to add real uploads later without touching the consumers.

> **Sequencing:** this feature is built **after** the Markdown Removal cleanup
> (`markdown-removal-design.md`). It assumes the post-cleanup render path:
> `renderEntryHTML(type, data)` renders structured fields directly, and
> `formatInline(text)` handles inline rich text. There is no markdown compiler to
> route images through.

## Current state (context)

- Images in the app today are **only** the Atlas background maps, hardcoded to
  `public/`-relative paths (`/atm10worldguide.png`, `/atm10.png`, `/city waterway.png`)
  in `src/components/atlasView.js`, baked in at build time.
- Civilizations, mods, and regions are **text-only** — no image fields.
- After the Markdown Removal cleanup, rendering lives in `src/utils/entryRenderer.js`
  (`renderEntryHTML` + `formatInline`). `formatInline` handles inline images
  (`![alt](url)`) but has no concept of the pool yet.
- The three Atlas map PNGs currently live in the `atm10` parent folder, **outside
  the app**, which is why the Atlas background does not load.

## Non-goals (out of scope)

- Runtime image **upload**.
- Delete / rename images from the UI.
- Cropping / resizing / transformations.
- Carousel **autoplay** (manual navigation only).
- Fixing the markdown renderer's table / nested-list handling. Only image support
  is added.
- Click-to-enlarge / lightbox.

## Architecture

### Two shared units, built once and reused everywhere

**`src/utils/imagePool.js`** — single source of truth for the pool.
- Auto-discovers every image in `src/assets/pool/` via Vite `import.meta.glob`
  (eager, `query: '?url'`), so no manifest is hand-maintained.
- `listImages()` → `[{ id, label, url }]` for the picker.
- `resolve(id)` → the current build URL for a stored id, or `null` if the id is no
  longer in the pool.
- `id` = the original filename (e.g. `dwarven-hall.png`). `label` = filename
  prettified (`dwarven-hall.png` → "Dwarven Hall"), overridable via an optional
  `src/assets/pool/labels.json` map (`{ "<id>": "<label>" }`), never required.

**`src/components/imagePicker.js`** — reusable modal.
- Renders the pool as a thumbnail grid.
- On click, returns the selected **id** to the caller and closes.
- Used by all consumers below. No consumer talks to the pool directly for
  selection UI.

### The stable-id invariant

Entries store the **stable id** (original filename), **never** the built URL. Vite
hashes asset URLs on every build (`dwarven-hall.a1b2c3.png`), so a stored URL would
rot across rebuilds. Storing the id and resolving id→URL at render time keeps saved
data (local JSON and Firestore) valid across every rebuild. This invariant is the
core reason the "rebuild to update the pool" workflow is safe.

### Renderer change

`formatInline` (in `entryRenderer.js`) extends its existing image rule to resolve
pool refs:

- `![alt](pool:<id>)` → look up `resolve(id)` → `<img src="<url>" alt="<alt>">`.
- Plain `![alt](<url>)` (external URLs) continues to pass through to a normal `<img>`.
- An unresolved `pool:<id>` (image removed from the pool) renders a small inline
  placeholder rather than a broken image.

This one addition powers **inline** images. The **hero** image renders directly from
the `heroImage` field in `renderEntryHTML` (no `pool:` string needed — it calls
`resolve(id)` itself). The **carousel** is composed separately (see Carousel). None
of these route through markdown — there is no markdown.

## Data model changes

Added to civilization / mod / region `formData`:

| Field | Type | Meaning |
|---|---|---|
| `heroImage` | `string` (pool id) or empty | Single cover image, rendered at top of body under the title. |
| `gallery` | `string[]` (pool ids) | Ordered set rendered as the carousel. Empty = no carousel. |

Decision Logs are **not** given image fields.

Atlas map selection stores a pool id in the existing atlas map-data doc
(`atlas_map/world_vector_data`) instead of a hardcoded path.

## Consumers

| Surface | Behavior | Stored as |
|---|---|---|
| **Atlas maps** | The map dropdown in `atlasView.js` is populated from `listImages()` instead of hardcoded `<option>`s. Selecting sets the Atlas background. | pool id in atlas map-data doc |
| **Hero image** | A "Pick image" button in each builder opens the picker and sets `heroImage`. `renderEntryHTML` renders it directly as an `<img>` at the top of the entry body via `resolve(id)`. | `heroImage: "<id>"` |
| **Carousel** | A builder widget manages the `gallery` array: add (via picker), remove, reorder. Rendered as an "Inspiration" carousel section at the bottom of the entry. | `gallery: ["<id>", …]` |
| **Inline** | An "Insert image" button on the multi-line prose fields opens the picker and inserts `![caption](pool:<id>)` at the cursor. | `pool:<id>` ref inline in the text |

## Carousel

- **CSS scroll-snap**: a horizontal flex row, `overflow-x: auto`,
  `scroll-snap-type: x mandatory`, each slide `scroll-snap-align: center`. Swipe /
  trackpad / drag scrolling snaps to each image. Pure CSS.
- **Prev/next arrows**: small JS using `scrollBy` on the container. No library.
- **No autoplay** in v1.
- **Render path:** the carousel is rendered by a dedicated helper and composed into
  the preview as an "Inspiration" section **appended after** the entry HTML from
  `renderEntryHTML`.
- New styles live in `src/styles/main.css`.

## File placement, formats, labels

- Pool images live in **`src/assets/pool/`** (inside the repo, processed by Vite).
  `import.meta.glob` sees `src/` but not `public/`, which is what enables
  manifest-free auto-discovery.
- Workflow to add images: drop file(s) in `src/assets/pool/` → `npm run build` →
  they appear in the pool.
- Supported formats: **png, jpg, jpeg, webp, gif**.
- The three existing Atlas PNGs **move** from the `atm10` parent into
  `src/assets/pool/`, which also closes the "Atlas background doesn't load" gap.

## Future-proofing seam

The picker and every consumer depend only on `imagePool`'s interface
(`listImages` / `resolve`). Adding real uploads later means swapping the internals
of `imagePool.js` (static glob → filestore-backed) with no changes to the picker or
consumers.

## Affected files

| File | Change |
|---|---|
| `src/utils/imagePool.js` | **New.** Glob-based pool: `listImages()`, `resolve(id)`, labels. |
| `src/components/imagePicker.js` | **New.** Reusable thumbnail-grid picker modal. |
| `src/assets/pool/` | **New dir.** Pool images (incl. migrated Atlas PNGs) + optional `labels.json`. |
| `src/utils/entryRenderer.js` | Extend `formatInline`'s image rule to resolve `pool:<id>`; render `heroImage` directly in `renderEntryHTML` for civ/mod/region. |
| `src/components/civilizationBuilder.js` | Hero "Pick image", carousel manager, inline "Insert image" on prose fields. |
| `src/components/modBuilder.js` | Same builder additions. |
| `src/components/regionBuilder.js` | Same builder additions. |
| `src/components/atlasView.js` | Source map dropdown from the pool; store map as pool id. |
| `src/main.js` | Wire `heroImage`/`gallery` into formData; compose carousel into the preview after `renderEntryHTML`. |
| `src/styles/main.css` | Picker grid, hero image, carousel scroll-snap styles. |
| Atlas PNGs (in `atm10` parent) | **Move** into `src/assets/pool/`. |

## Build order

Sequenced so each step is independently verifiable (build + browser smoke test):

1. **Pool dir + module** — create `src/assets/pool/`, migrate the 3 Atlas PNGs into
   it, write `imagePool.js` (`listImages`, `resolve`, labels).
2. **Picker** — `imagePicker.js` modal + grid styles; verify it lists the pool.
3. **Renderer rule** — extend `formatInline` to resolve `pool:<id>`.
4. **Atlas consumer** — source the map dropdown from the pool (also fixes the
   broken Atlas background). Lowest-risk consumer, done first.
5. **Hero image** — `heroImage` field + builder button + `renderEntryHTML` render.
6. **Inline images** — "Insert image" button on prose fields.
7. **Carousel** — `gallery` array management in builders + scroll-snap render +
   CSS.

## Defaults locked

- Hero + carousel apply to civilizations, mods, regions — not Decision Logs.
- Formats: png, jpg, jpeg, webp, gif.
- Labels derived from filename; optional `labels.json` override.
- Atlas's three PNGs move into the pool dir.
- Carousel navigation is manual (swipe + arrows), no autoplay.
