# CLAUDE.md — agent onboarding

Orientation for an agent working in this repo. Read the header comment of any module before
changing it — they carry the real design rationale; this file is the map, not the territory.

## What this is

Codex Studio — a browser worldbuilding codex. Admins define content **types** (a schema
builder in the app), authors write **entries** against them, and the reader view is generated
from the schema. Cloud backend is Firebase (Auth + Firestore, entries) + Supabase Storage
(image bytes). It also runs fully **local-only** off a bundled demo fixture. Vanilla JS ES
modules, no framework; Vite for dev/build; Node's built-in runner for tests.

See [README.md](README.md) for the run/build story and [docs/authoring.md](docs/authoring.md)
for the end-user flows.

## The core invariant: pure domain, impure edge

The architecture is a deliberate split, and it's the thing to preserve:

- **`src/schema/**` and much of `src/utils/**` are pure and Node-testable.** No DOM, no
  Firebase/Supabase SDK, no `window`. Every dependency is passed in. Each has a `*.test.js`
  beside it that runs under plain `node --test`. Examples: `fieldKinds.js`, `viewState.js`,
  `capabilities.js`, `schemaValidate.js`, `slug.js`, `navModel.js`, `imageIndex.js`,
  `summaryCard.js`, `searchIndex.js`, `entryHistory.js`, `referenceIndex.js`, `exportCodex.js`.
- **`src/main.js` is the one impure orchestrator** (~3k lines): it owns the Firebase/auth
  wiring, application state, and the event handlers, and it feeds the pure modules a `ctx` edge
  adapter (`resolveImage`, `listEntries`, `resolveRef`, `listImages`, …) so they never import
  the SDK.
- **`src/components/**` is DOM code** (schema editor, map, image picker, admin panels, modals).
  Some carry `*.test.js` for the parts that are DOM-light; most DOM wiring is verified in the
  browser preview, not unit tests.

**When you add logic, put the decision in a pure module with a test and let `main.js`/components
call it.** Don't grow `main.js` with logic that could be pure. Match the surrounding style: no
framework, no new dependencies without a reason, terse header comments that explain *why*.

## The component contract (`src/schema/fieldKinds.js`)

`fieldKinds.js` is **the one registry** — one entry per renderable field component a type can
compose. This is central; read its header before touching anything field-related. Each entry:

- `renderInput(field, value, ctx) -> html` — the builder control.
- `renderRead(field, value, ctx) -> html` — the read-view body.
- `layout` — `'grid'` (default cell) | `'full'` (spans the grid: prose, list) | `'break'`
  (escapes the grid as its own block: hero, gallery, map). Both walkers (`formRenderer.js`,
  `entryRenderer.js`) read `layout` — there is no hard-coded `FULL_WIDTH`/`MEDIA_KINDS` set.
- `mount(el, { field, value, onChange, ctx })` — optional imperative seam for components that
  wire events / a live canvas; `onChange(newValue)` is the single write path to
  `data[field.key]`.
- `selfRender` — optional; tells the builder not to rebuild the whole form after a commit (the
  map owns a live canvas that a teardown would reset).
- `title` / `description` / `icon` — palette metadata (human name, one-line hint, SVG glyph). The
  Structure editor's picker is a named, described component palette (`components/componentPalette.js`),
  not a raw kind key; `paletteComponents()` projects these out in registry order.

The eleven kinds: `text`, `prose`, `number`, `date`, `select`, `boolean`, `list`, `reference`,
`hero`, `gallery`, `map`. All but the media/map kinds are pure and Node-tested; the media/map kinds
need the DOM (`mount` is browser-only).

## Run modes & config

Mode is resolved once at boot in [`src/config/appConfig.js`](src/config/appConfig.js) from the
baked config + a `localStorage` override (`codex_firebase_override`):

- **Configured (cloud)** — baked Firebase config (or a dev JSON override) present → Firestore +
  Supabase, Google sign-in, roles.
- **Local-only** — override = `'local'` → bundled `demoFixture.js` codex, in-memory, no login.
  Edits reflect immediately but are **not persisted** (reset on reload).

The Firebase config and Supabase key in `appConfig.js` are **public locators, not secrets** —
do not treat them as leaked. Real authorization is [`firestore.rules`](firestore.rules) (the
SSOT) + Supabase Storage RLS. `resolveFirebaseConfig` / `resolveSupabaseConfig` are pure and
tested.

## Authorization

`src/utils/capabilities.js` (`resolveCapabilities`) is the pure UI-side mirror of the Firestore
rules, predicate-for-predicate: **admin** by baked email (`appConfig.auth.adminEmail`), else the
current codex's permission role (`editor` / `viewer` / none). **If you change who-can-do-what,
change both `firestore.rules` and `capabilities.js` together**, and keep the test in sync. Never
rely on the UI for enforcement — the rules are the gate.

## Working in this repo

- **Test:** `npm test` (`node --test` — runs every `src/**/*.test.js`). Add a test beside any
  pure module you touch. Keep the suite green before committing. (`node --test` also sweeps in
  `scripts/test-rules.mjs` via the `test-*` glob — a *live* Firestore-rules integration test that
  self-skips when no service-account key is present, so a fresh clone and CI stay green; provide
  the key to run it for real. Run it standalone with `npm run test:rules`.)
- **Dev / build:** `npm run dev` (port 5173), `npm run build`, `npm run preview`.
- **Verify DOM changes in the browser preview**, not by asserting on DOM in Node. Local-only
  mode (`codex_firebase_override='local'`) is the fastest way to exercise the UI without auth.
- **Windows machine, two shells** — the Bash tool is Git Bash (POSIX); the PowerShell tool is
  PowerShell. Don't mix their syntax.
- **Commits:** write the full message to a file and `git commit -F <file>` (inline multi-line
  messages have leaked stray characters here). Workflow is commit/push straight to `main` — no
  feature branches, no PRs. Note `main` is now **published**: every push auto-deploys to GitHub
  Pages ([bodegi.github.io/codex](https://bodegi.github.io/codex/)) via
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), gated by `npm test`. A red push
  is a broken deploy — keep the suite green. Site config lives in `vite.config.js`
  (`base: '/codex/'`); see the README's Deploying section.
