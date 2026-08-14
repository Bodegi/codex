# Authoring guide

How to use Codex Studio to read, write, and design a codex. For running or building the app see
[../README.md](../README.md); for the architecture see [../CLAUDE.md](../CLAUDE.md).

- **Codex** — a self-contained world/dataset. You work in one codex at a time (switch with the
  picker at the top of the sidebar).
- **Type** — a content template you design (Note, Person, Place, …): an ordered list of
  components (fields), with **Heading** components as dividers.
- **Entry** — one filled-in record of a type.

## The workspace

- **Header** — app title on the left; on the right, **Sign in with Google** or your user badge.
  Admin tools live in the user-badge menu.
- **Sidebar** — the **codex switcher** at the top, a **search box** beneath it (see
  [Search](#search)), then the **navigation**: each type with its entries beneath it. Click a type
  section to expand/collapse; click an entry to open it. Editors and viewers also see a small
  **role badge** here naming their access on this codex.
- **Editor panel** (left of the workspace) — the form you fill in when editing. Buttons: **Save**,
  **History** (see [Version history](#writing-an-entry-editors--admins)), **Archive**, **Done**.
- **Reader panel** (right) — the rendered read view. Its header carries the mode toggles
  (**Edit**, **Structure**, **Index**, **`</> Edit JSON`**), an **Export** button (see
  [Export](#export)), and a **status badge** showing *Cloud sync on* or *Local only*.

Which controls appear depends on your role: viewers read and can search/export, editors also get
**Edit** and **History**, admins also get **Structure** and **`</> Edit JSON`**.

On small screens (below 860px) the sidebar collapses into an off-canvas drawer opened from the
header, and the editor panels stack into a single column. The Structure editor still works there
but is designed for a wider screen.

## Getting access

Codex Studio (in cloud mode) is invite-only:

1. Click **Sign in with Google**.
2. If your account has no role on this codex yet, you'll see an **Awaiting Access** screen. You
   now show up in the admin's roster automatically.
3. An **admin** grants you a role from **Users & Access** (see [Admin tools](#admin-tools)):
   - **Viewer** — read entries.
   - **Editor** — read + create/edit/archive entries.
   - **Admin** (baked super-admins only) — everything, plus design types and manage the codex,
     images, icons, and access.

Reload after being granted a role. Access is per-codex — a role on one codex doesn't carry to
another.

## Reading & navigating

Pick a codex and click a type: you land on its **index** — a browsable grid of that type's
entries as summary cards. Click a card (or an entry in the sidebar) to open it. The reader
renders an entry from the schema: text and prose, lists, links to referenced entries, image
galleries with a lightbox, and interactive maps.

The **Index** toggle in the reader header switches between an open entry and the grid. Every
type has an index; a type with no **summary card** configured shows a minimal title-only card.

### Search

The **search box** at the top of the sidebar searches entry titles and bodies across the whole
codex. Start typing and the reader becomes a ranked results list with matching snippets
highlighted; click a result to open that entry. Clearing the box returns you to wherever you were
browsing — an open edit draft is left untouched.

### Export

The **Export** button in the reader header (available to anyone who can read) downloads the whole
codex — its metadata, effective type schemas (archived types included), and every entry (active
and archived) — as a versioned JSON file. Image *bytes* aren't bundled; entries keep their image
references, which re-resolve against the same deployment.

## Writing an entry (editors & admins)

1. Open an entry (or start a new one from the type's **+ New** affordance in the sidebar).
2. Click **Edit** in the reader header. The editor panel becomes a form.
3. Fill in the fields (see [Field kinds](#field-kinds)).
4. Click **Save**. Editing is **explicit-save** — nothing is written until you click Save.
5. Click **Done** to leave edit mode.

**Saving & sync.** In cloud mode each save writes to Firestore and bumps a version. If someone
else saved the same entry since you started editing, you'll get a **conflict** prompt rather
than silently overwriting their work — you can review and re-save. Other editors' changes to the
open entry stream in live while you read.

**Version history.** Every save snapshots the entry (the last several versions are kept). Click
**History** in the editor to review earlier versions and **Restore** one — restore loads it back
into the editor without discarding anything, so you still Save to commit it.

**Archive** hides an entry without deleting it (admins/editors can restore archived entries).
There is no hard delete in the authoring UI. Archiving is confirmed first, and if other entries
reference the one you're archiving, the prompt warns you which ones will be left with a broken
link.

## Field kinds

When designing a type you **add a field from the component palette** — a picker of named, described
components (＋ add field, or click a field's component chip to change it), so you choose "Paragraph"
or "Banner image" rather than an internal key. The components:

| Component | For | Notes |
| --- | --- | --- |
| **Text** | short single-line values (title, id, a label) | |
| **Paragraph** | long rich body text | supports inline **links** and **images** (see below) |
| **Number** | a numeric value (a count, a rating, a year) | |
| **Date** | a calendar date | picked from a date control |
| **Select** | one choice from a fixed list | define the options, one per line |
| **Checkbox** | a yes / no toggle | |
| **List** | a set of short values (tags, aliases) | comma-separated or one per line |
| **Reference** | a link to another entry | pick a target type; toggle **multiple** for many |
| **Heading** | a labelled divider grouping the components below it | holds no entry data — its label is the rendered text |
| **Banner image** | one hero image | full-width block |
| **Gallery** | several images | rendered as a carousel with a lightbox |
| **Map** | an interactive map | pins, roads, territories — see [Maps](#maps) |

### Prose: links and inline images

Prose fields accept lightweight markup:

- **Images** — `![](img:<imageId>)` embeds an uploaded image inline. Use the insert-image button
  on the prose field to pick one; it writes the markup for you. (Legacy `![](pool:<id>)` refs
  still render.)
- **Links** — standard `[label](target)` markup renders as a link in the read view.

## Images

- **Upload** — the image picker (from a hero/gallery field or the prose insert-image button)
  takes **multiple files** at once: choose them or **drag-and-drop** onto the modal. Uploads run
  with per-file progress and new thumbnails appear as they finish. Images are downscaled and
  converted to WebP in the browser before upload to keep files small.
- **Reuse** — every uploaded image lives in the codex's image library and can be used by any
  entry (hero, gallery, or inline in prose).
- **Where they live** — image bytes go to Supabase Storage; the metadata (id, label) to
  Firestore. Admins manage labels and archiving from the **Images** admin panel.

Images require cloud mode — in local-only mode there's no upload and image ids resolve to a
"not found" placeholder.

## Maps

The `map` field is a mini Google-Maps-style canvas on an image you supply:

- **Load a map image** for the field, then work on top of it.
- **Pins** — click to drop a waypoint. Pins are DOM markers (constant size, clickable). Dropping
  a pin opens the **inspector**, where you can name it, **link it to an entry**, and pick a
  **glyph** (an emblem/icon that renders in place of the dot).
- **Roads / territories** — draw **freehand** by dragging (the default), or switch to
  **Vertex** mode to click corner-by-corner for precise borders. Strokes are simplified on save.
- **Linking** — a field can be configured (in the Structure editor) so pins reference entries of
  a chosen type; the pin then shows that entry's title (and its emblem, if it has one) and the
  read view bakes the resolved label/glyph in.

## Designing types (admins)

Click **Structure** in the reader header while a type is selected to open the **Structure
editor**:

- **Components** — click **+ add component** and pick one from the palette (Text, Paragraph,
  Number, Date, Select, Checkbox, List, Reference, Heading, Banner image, Gallery, Map). A type is
  one flat, ordered list; a **Heading** is a divider you place where you want a titled group — it
  holds no entry data, so a simple type just flows title → fields with no header at all.
- **Reorder** — drag the `⠿` handles to reorder the list (Up/Down buttons are the precision
  fallback).
- **Per-field options** — e.g. `reference` fields choose a target type and a single/multiple
  toggle; `map` fields configure pin **association** (reference / label / both) and target type.
- **Summary card** — configure an optional card (title/subtitle field + badge/row fields) that
  drives the **Index** grid; a live preview updates as you toggle.
- **`</> Edit JSON`** — an "Advanced" disclosure to hand-edit the type's schema as raw JSON. A
  power-tool escape hatch; the visual editor is the normal path.

Schemas are data — adding or reordering fields takes effect immediately, no redeploy.

## Admin tools

From the header user-badge menu (admins only):

- **Users & Access** — the roster of everyone who's signed in; grant/revoke **Viewer** / **Editor**
  per person on the current codex. Super-admins are shown but not editable here.
- **Codices** — create, rename, and archive codices.
- **Images** — the uploaded-image gallery: relabel, cross-assign, archive/restore.
- **Icons** — create and edit the icon overlay used for type icons and map glyphs.

## Sync & local-only behavior

The reader-header **status badge** tells you which mode you're in:

- **Cloud sync on** — you're connected to Firestore. Saves persist and are shared; other editors'
  changes stream in; conflicts are guarded.
- **Local only** — no backend. The app serves the bundled **demo codex** (a Note and a Person
  type). You can explore and edit, but changes are held **in the browser session only and are not
  saved to any backend** — reloading restores the demo. There's no sign-in, no upload, and image
  ids show the not-found placeholder.

To try local-only mode without an account, set `localStorage.codex_firebase_override = 'local'`
in the browser console and reload (see the [README](../README.md#run-it)).
