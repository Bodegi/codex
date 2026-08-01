# Multi-Codex Firestore Data Model — Design

> Status: approved design (2026-08-01). Foundation for three implementation phases; image pool deferred.
> Supersedes the flat `codex_entries` / `codex_schemas` / `atlas_map` layout for a codex-scoped model.

## 1. Context & goal

The app started ATM10-specific but is now generic (schema-driven types, generic renderers, in-app schema
editor). The goal is to host **multiple codices** (ATM10, a D&D campaign, …) in one app, each with its own
type set, content, and members — while keeping the codex a pure content aggregate and access control a
separate concern.

Three related asks drove this design: get the **admin tab** up, get **content into Firestore**, and shape
the **collections** so multi-codex is future-proof. They share one keystone — the data model — so it is
designed once here and implemented in phases (§7). Building content migration or the admin tab against the
current *flat* model would be throwaway work once multi-codex lands; hence model-first.

## 2. Decisions (locked in brainstorming)

- **Different members per codex.** The D&D crew need not be the Minecraft crew. Users are global;
  membership attaches per codex.
- **The codex is unaware of access control.** Content belongs to the codex; *membership* lives in a
  separate `permissions` collection that references codices by id. Codex content never embeds members.
- **Roles: editor vs. viewer.** A viewer gets a read-only view of a codex; an editor can also write.
- **A single super-admin (the owner), for now.** Recognized by a baked email literal in the rules — no
  backend, no custom claims. Sole creator of codices and grantor of access. Extensible later to an
  `isAdmin` flag on user docs (a one-field change) if a co-admin is ever wanted.
- **Content structure: subcollections under each codex** (not flat + `codexId` field, not name-prefixed
  collections). Idiomatic Firestore multi-tenancy; clean per-codex rules; scoped queries with no composite
  indexes; data-driven nav falls out. The only thing given up — cross-codex "everything" queries — this app
  never does.

## 3. Collections & document shapes

```
users/{uid}
  → { uid, email, displayName, photoURL, createdAt, lastSeenAt }
    Upserted by the app on every sign-in (uid = Firebase Auth uid). The global identity record and the
    roster the admin grants access from — a person appears here after first login.

permissions/{uid}_{codexId}
  → { uid, codexId, role: 'editor' | 'viewer', grantedBy, grantedAt }
    Deterministic id → rules gate codex content with one exists()/get(). Doc present = access; absent =
    none. The super-admin needs no permission doc (rules recognize the owner directly).

codices/{codexId}
  → { codexId, name, description?, createdBy, createdAt }
    codexId is a slug ('atm10', 'dnd-campaign'). Metadata only — no member list.

codices/{codexId}/entries/{entryId}
  → { type, id, ...fields, updatedAt }     entryId keeps the `${type}_${id}` convention.

codices/{codexId}/schemas/{type}
  → { type, label, idField, titleField, sections, updatedAt }
    Each codex owns its type set → this drives the (data-driven) nav.

codices/{codexId}/atlas/{docId}
  → docId = 'world_vector_data' today; room for more.
```

Notes:

- **Schemas move from code to per-codex Firestore.** The bundled `seedSchemas.js` stay in code as the
  **seed template** (used to initialize a codex) and as the **local-only fallback** when Firebase is
  unconfigured. Firestore holds each codex's live schemas.
- **`users` is app-written, not admin-only** — the sign-in upsert is what populates the roster.

## 4. Security rules

Enforce: the super-admin can do anything; editors write within their codices; viewers read only.

Helpers:

```
isAdmin()         → request.auth.token.email == 'bodegigaming@gmail.com'   // baked literal; mirrors appConfig.auth
hasPerm(codexId)  → exists(/databases/$(db)/documents/permissions/$(request.auth.uid + '_' + codexId))
isEditor(codexId) → hasPerm(codexId) && get(/…/permissions/$(uid + '_' + codexId)).data.role == 'editor'
```

Access matrix:

| Path | Read | Write |
|---|---|---|
| `users/{uid}` | own doc, or admin | own doc (sign-in upsert), or admin |
| `permissions/{id}` | own (`resource.data.uid == uid`), or admin | **admin only** |
| `codices/{codexId}` | `hasPerm` or admin | **admin only** (metadata) |
| `codices/{codexId}/entries \| schemas \| atlas` | `hasPerm` or admin | `isEditor` or admin |

Mechanics:

- **Super-admin = baked email literal.** No backend/custom claims. (Owner `uid` is an alternative — stable
  if the email ever changes; email is more readable. Default: email.)
- **Permissions are admin-write-only** — nobody grants themselves access. This is what makes the wall real
  at the data layer, not just the UI.
- **Editor vs. viewer** = one `get()` on the permission doc at write time; viewers pass reads, fail writes.
- **No-access user** fails every codex read (no permission doc) → the app shows the awaiting-access screen.
- Rule `exists()`/`get()` calls are billed as document reads (against the Spark free daily quota — no
  monetary cost on Spark; trivial at this scale).

## 5. Content migration (ATM10 → `codices/atm10/…`)

An **in-app, idempotent seed action**, run while signed in as super-admin (admin write-rules permit it).
Reuses the app's Firebase connection + auth — **no service account, no separate script env** (we have no
backend by design). Starts as a dev/console-invokable function in Phase 1; later becomes an "Initialize
codex" button in the admin tab.

It writes: the `codices/atm10` metadata doc; the 4 schemas → `schemas/{type}`; the seed entries →
`entries/{type}_{id}`; the atlas doc; and grants the owner `permissions/{ownerUid}_atm10 = editor`.
Idempotent — guards on "does `codices/atm10` exist?" and uses deterministic ids + merge writes, so
re-running cannot duplicate or clobber.

`seedData.js` / `seedSchemas.js` remain in code (seed template + local-only fallback). The old flat
collections (`codex_entries`, `codex_schemas`, `atlas_map`) go orphaned and are deleted post-migration once
the app reads the new paths.

## 6. App "current codex" context

- **`state.currentCodexId`**, default `'atm10'` (persisted in localStorage). Phase 1 has one codex and no
  switcher, but everything is scoped from day one so Phase 3 only adds the picker.
- **`FirebaseManager` becomes codex-agnostic** — a scoped accessor `fbManager.codex(codexId)` (explicit,
  hard to misuse) whose methods operate under `codices/${codexId}/…` instead of hardcoded `codex_entries`
  / `atlas_map`.
- **`schemaStore` loads the current codex's schemas** from `codices/${codexId}/schemas` (bundled
  `seedSchemas` as template/fallback) → nav renders from the current codex's `listTypes()`.
- **Switcher (Phase 3)** sets `currentCodexId` → re-scopes subscriptions, reloads nav + entries. Lists all
  codices for the admin; for a normal user, the codices their `permissions` grant.
- **Local-only mode** (no Firebase) has no codex concept — bundled seed as a single implicit codex.

## 7. Phased rollout

1. **Data model + content migration** — codex-scoped collections; `fbManager.codex(id)`; `currentCodexId`
   default `'atm10'`; per-codex schema load; the idempotent ATM10 seed; delete old flat collections. No
   switcher UI, no permissions enforcement yet (still test-mode rules). Content now lives in Firestore in
   the future-proof shape.
2. **Users + permissions + rules + admin tab** — sign-in `users` upsert; `permissions` collection; the
   security rules above (locks the DB); the admin tab (list users, grant/revoke editor/viewer per codex);
   the signed-in-but-no-access screen.
3. **Multi-codex UI** — the switcher/registry, create/select/rename codices, data-driven nav from the
   current codex's schemas.

Deferred (parking lot): runtime image upload; multi-value references; create/delete *types* (bundles with
data-driven nav); concept-art import; app documentation.

## 8. Non-goals / YAGNI

- No per-codex "owner-admins" (single super-admin covers it; editor/viewer is the whole role set).
- No cross-codex queries or aggregation.
- No serverless functions / Admin SDK / Blaze — the model runs entirely on the client + rules.
- No schema-migration engine for entries when a schema field is removed (unchanged from today).
