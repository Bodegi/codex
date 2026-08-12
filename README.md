# Codex Studio

A browser-based **worldbuilding codex**: define your own content types (a schema builder,
no code), author entries against them, and read them back as richly-rendered pages. Content
lives in the cloud (Firestore for entries, Supabase Storage for images) so a small team can
edit the same codex live, but the app also runs fully **local-only** with a bundled demo — no
account, no backend — for a quick look or offline hacking.

Think of it as a lightweight, self-serve alternative to a wiki: instead of free-form pages you
compose structured **types** (Note, Person, Place, …) out of a fixed palette of field
components — text, prose, lists, cross-entry references, hero/gallery images, and an
interactive map — and the reader view is generated from the schema.

**Live:** [bodegi.github.io/codex](https://bodegi.github.io/codex/) (private — access is invite-gated).

## Highlights

- **Schema builder, in the app.** Admins design types visually in the Structure editor: add
  fields, group them into sections, drag to reorder, pick a field _kind_. No migrations, no
  redeploy — the schema is data.
- **Field components.** `text`, `prose` (inline-image + link markup), `list`, `reference`
  (single or multi-value links to other entries), `hero`, `gallery`, and `map` (drop pins,
  draw roads/territories freehand, link pins to entries).
- **Summary cards + index view.** Clicking a type lands on its index — a browsable grid of its
  entries as cards. A type can declare a `summaryCard` to enrich the card; otherwise it's a
  minimal title-only card.
- **Full-text search.** A persistent sidebar box searches entry titles and bodies across the
  whole codex, with ranked, snippet-marked results.
- **Live multi-user editing.** Explicit-save with optimistic-concurrency conflict handling;
  edits from other editors stream in. Every save snapshots a per-entry **version history** you
  can review and non-destructively restore.
- **Runtime image upload.** Multi-file drag-and-drop into Supabase Storage, downscaled to WebP
  client-side before upload; reference images inline in prose with `![](img:<id>)`.
- **Export.** Any reader can download the whole codex — schemas plus active and archived entries
  — as a versioned JSON file.
- **Role-based access.** Baked super-admins, plus per-codex `editor` / `viewer` roles granted
  from the admin roster. Enforced by Firestore security rules, mirrored in the UI.
- **Works on small screens.** Degrades gracefully below 860px — the sidebar becomes an
  off-canvas drawer and editing panels collapse to a single column.

## Run it

Requires Node 18+ (the test runner uses `node --test`).

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Then open http://localhost:5173.

Out of the box the dev server points at the configured cloud project, which requires signing
in with an authorized Google account. **To explore with no account**, force local-only mode
from the browser console (or DevTools → Application → Local Storage) and reload:

```js
localStorage.setItem('codex_firebase_override', 'local')
```

Local-only mode serves the bundled demo codex (a `Note` and a `Person` type that between them
exercise every field kind). Edits are kept **in memory only** — they reflect immediately but
reset on reload; nothing is written to a backend. Remove the key to return to cloud mode.

### Other commands

```bash
npm test         # run the unit test suite (node --test)
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

## Two run modes

The app resolves its mode once at boot from the baked config in
[`src/config/appConfig.js`](src/config/appConfig.js) and an optional
`localStorage` override (`codex_firebase_override`):

| Mode | Firebase config present | Data | Auth |
| --- | --- | --- | --- |
| **Configured (cloud)** | yes (baked, or a dev JSON override) | Firestore + Supabase | Google sign-in; roles enforced by security rules |
| **Local-only** | no (override = `local`) | bundled demo, in-memory | none — no login wall |

The Firebase web config and Supabase publishable key in `appConfig.js` are project **locators,
not secrets** — real access control lives in the Firestore security rules
([`firestore.rules`](firestore.rules)) and Supabase Storage RLS. See the file's header comment
for the dev-override recipe (point a local build at a throwaway dev Firestore project so local
work never touches deployed content).

## Authoring

See **[docs/authoring.md](docs/authoring.md)** for the author/admin guide: signing in and
getting access, building types in the Structure editor, the field kinds, working with images
and the map, and how saving / sync / local-only behave.

## Deploying

The app is a static SPA, so it deploys to **GitHub Pages** at
[bodegi.github.io/codex](https://bodegi.github.io/codex/). Every push to `main` triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which runs the test suite,
builds, and publishes `dist/` — no manual step.

Pages serves from a repo subpath, so `vite.config.js` sets `base: '/codex/'`; built asset URLs
(and `npm run dev` / `npm run preview`) are prefixed accordingly. There are **no deploy
secrets** — the baked Firebase/Supabase config are public locators, and the Firestore rules +
Storage RLS are the real gate.

Two one-time setups live outside the repo (already done for this project):

- **Pages source** is set to *GitHub Actions* (repo Settings → Pages).
- The deployed origin `bodegi.github.io` is added to Firebase Auth → *Authorized domains* so
  Google sign-in works, and the Firebase browser API key is referrer-restricted to the app's
  domains as defense-in-depth.

## Project layout

```
index.html              app shell (header, sidebar, editor + reader panels)
src/
  main.js               bootstrap + wiring — the one impure orchestrator
  config/appConfig.js   baked Firebase/Supabase locators + mode resolution
  data/demoFixture.js   the local-only demo codex (also the test fixture)
  schema/               pure, Node-testable domain modules (field kinds, view
                        state, validation, slugs, nav model, image index, …)
  components/           DOM components (schema editor, map, image picker, admin
                        panels, modals, carousel/lightbox)
  utils/                edge adapters (firebase, imageStore, auth, capabilities,
                        renderers)
  styles/main.css       all styling
firestore.rules         the authorization source of truth
```

Most of `src/schema/**` and several `src/utils/**` modules are **pure and unit-tested**
(`*.test.js` beside each). `main.js` and the `components/` DOM code are the impure edge. See
[CLAUDE.md](CLAUDE.md) for the architecture conventions.

## Tech

Vanilla JS (ES modules, no framework), [Vite](https://vitejs.dev) for dev/build, Firebase
(Auth + Firestore) and Supabase Storage for the cloud backend, and Node's built-in test runner.
No TypeScript, no bundled UI library.
