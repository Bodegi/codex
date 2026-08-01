# Multi-Codex Phase 2 — Access Control (Users, Permissions, Rules, Admin) — Design

> Status: approved design (2026-08-01). Phase 2 of the multi-codex rollout. Builds directly on the
> Phase 1 data model (`multi-codex-data-model-design.md`, shipped commit `92304a8`). Supersedes the
> old "enforce rules" / baked-allowlist parking-lot items.

## 1. Context & goal

Phase 1 put content into the codex-scoped Firestore layout (`codices/{id}/{entries,schemas,atlas}`) but
left the database on **test-mode rules** — the login wall is UI-only, the DB itself is open. Phase 2
**makes the wall real at the data layer** and gives the owner a way to manage who gets in:

- Every sign-in records the person in a global `users` collection (the admin's roster).
- A decoupled `permissions` collection grants `editor` / `viewer` per codex.
- **Firestore security rules** enforce all of it server-side.
- An **admin-only section** lets the owner grant/revoke roles, initialize a codex, and edit type schemas.
- A **signed-in-but-no-access** screen handles the limbo state.

Single super-admin (the owner), recognized by a baked email literal — no backend, no custom claims.

## 2. Decisions (locked in brainstorming)

- **Rules live in the repo, deploy by console paste.** `firestore.rules` is the version-controlled source
  of truth; deployed by pasting into the Firebase console Rules editor. No Firebase CLI / extra login
  (none is installed here); it also ships with the GitHub Pages repo later.
- **Full viewer experience now.** `viewer` is a first-class role: viewers get a read-only experience,
  enforced by rules, in this phase (not deferred).
- **Read-first workspace with an Edit toggle** *(unifying decision)*. Everyone with read access lands in the
  **reading view**; an **Edit** button (shown only to editors/admins) reveals the builder. Viewer read-only
  falls out for free — a viewer is simply a user who never sees the Edit button. This replaces per-role
  render branches with one default path + one capability gate, and it relocates Save/Open into edit mode
  (partially resolving the "Save shouldn't live in the header" cleanup item).
- **Sign-in-first grant flow.** Permissions are keyed by `{uid}_{codexId}`; a `uid` exists only after a
  person signs in. So a friend signs in once (landing on awaiting-access, which creates their `users` doc),
  then the admin grants them a role from the roster. No email-keyed pre-invites / reconciliation.
- **Types/schema editing is admin-only.** Editors author *entries* against fixed schemas; they do not
  reshape schemas. The Types editor moves out of the general nav into the admin section, and `schemas`
  writes become admin-only in the rules (tighter than the Phase 1 spec's §4 matrix).
- **Admin recognition = one baked email** (`appConfig.auth.adminEmail`), mirroring the rules literal. The
  Phase 1 `appConfig.auth.allowlist` UI gate **retires** — access is now permission/admin-based.

## 3. Capabilities model

The one safety-critical fact — *who can do what* — is expressed in two places (the app UI and the Firestore
rules) that must agree. The app side is a single pure, SDK-free unit; the rules mirror its predicates.

`src/utils/capabilities.js` (parallels the existing pure `authProfile.js`):

```
resolveCapabilities({ user, permission, adminEmail }) → {
  isAuthed,   // user != null
  role,       // 'admin' | 'editor' | 'viewer' | 'none'
  canRead, canEdit, canAdmin
}
```

Resolution table:

| Condition | role | canRead | canEdit | canAdmin |
|---|---|---|---|---|
| `user == null` | — (`isAuthed:false`) | — | — | — |
| `user.email === adminEmail` | `admin` | ✓ | ✓ | ✓ |
| `permission.role === 'editor'` | `editor` | ✓ | ✓ | ✗ |
| `permission.role === 'viewer'` | `viewer` | ✓ | ✗ | ✗ |
| signed in, no permission doc | `none` | ✗ | ✗ | ✗ |

Email comparison is case-insensitive. Admin is admin regardless of any permission doc.

## 4. Data & identity

- **`users/{uid}` upsert on sign-in.** `AuthManager.onChange` fires on every sign-in; the app upserts
  `users/{uid} = { uid, email, displayName, photoURL, createdAt (first write only), lastSeenAt }`. This is
  the *only* way a person enters the admin roster (sign-in-first).
- **`permissions/{uid}_{codexId}`** — written/removed by the admin. New `FirebaseManager` methods:
  `upsertUser(uid, profile)`, `deletePermission(uid, codexId)`, `subscribePermission(uid, codexId, cb)` (a
  user watches their own grant live), `subscribeUsers(cb)` and `subscribePermissions(cb)` (admin roster).
  `savePermission` already exists from Phase 1.
- **Admin email** — `appConfig.auth.adminEmail = 'bodegigaming@gmail.com'`, the single literal both the app
  and the rules read.
- **Allowlist retires.** `appConfig.auth.allowlist` is removed from the gating path. `authProfile.js` shrinks
  to pure identity mapping (uid / email / name / avatar); the authorization decision moves entirely to
  `capabilities.js`. The old "not on the allowlist" gateway error is replaced by the awaiting-access screen.

## 5. App structure — read-first workspace, three screens

**Boot order (avoids permission-denied noise).** Once auth resolves, read only the *self-readable* docs
first — `users/{uid}` (upsert) and the user's own `permissions/{uid}_{currentCodexId}` — compute
capabilities, and **only subscribe to codex content once `canRead` is confirmed**. An awaiting-access user
never issues a denied codex read.

**Three top-level states**, all derived from the same capabilities object:

1. **Not signed in → Gateway.** Existing `authGateway.js` login wall, de-branded from allowlist wording.
2. **Signed in, `role: 'none'` → Awaiting-access screen.** New `src/components/awaitingAccess.js`:
   "Signed in as X — awaiting access; ask the admin to grant you a role." + Sign out. Their `users` doc
   already exists, so they're in the roster to grant from.
3. **Signed in with `canRead` → Workspace.**

**Workspace = read-first + Edit toggle.**

- `state.mode = 'read' | 'edit'`, default `'read'`. Read mode renders the reading view (`renderEntryHTML`
  + carousel), editor column hidden, no Open/Save.
- **Edit button** — shown only when `canEdit`. Enters edit mode: reveals the builder form, Open/Save,
  editable Raw JSON, media controls, autosave. A back/Done control returns to read mode.
- **Viewer** (`canRead`, `!canEdit`) never sees the Edit button → read-only by construction, no separate
  path.
- **Atlas** follows the same idea: read mode shows the map without drawing tools; edit mode enables them.
  **Matrix** is already read-only.
- Inside the workspace, capabilities gate exactly two affordances: the **Edit** button (`canEdit`) and the
  **Admin** tab (`canAdmin`). A transient "permission not yet loaded" state shows a neutral loader so a real
  viewer/editor never flashes awaiting-access on boot.

## 6. Admin section

- **Nav change.** Remove the standalone **Types** tab from `index.html`; add an **Admin** tab, visible only
  when `canAdmin`. Nav stays hardcoded HTML (data-driven nav is Phase 3); we only toggle Admin's visibility.
- **`src/components/adminView.js`** — three panels:
  1. **Codex status / Initialize.** Shows whether `codices/{currentCodexId}` exists; an *Initialize codex*
     button runs the idempotent Phase 1 seed (`seedAtm10Codex`), promoting the console function into the
     button the Phase 1 spec §5 anticipated.
  2. **Users & Access roster.** A table of `users` (from `subscribeUsers`) joined with their current-codex
     `permissions` (from `subscribePermissions`): each row shows name / email / last-seen and a role control
     **[No access · Viewer · Editor]** that writes (`savePermission`) or removes (`deletePermission`) the
     permission doc. The super-admin appears but is role-locked to full.
  3. **Types editor.** The existing schema editor, relocated here (admin-only).

## 7. Firestore security rules

`firestore.rules` (repo source of truth; console-pasted). Mirrors the §3 capability predicates:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn()  { return request.auth != null; }
    function isAdmin()     { return isSignedIn() && request.auth.token.email == 'bodegigaming@gmail.com'; }
    function permId(cid)   { return request.auth.uid + '_' + cid; }
    function hasPerm(cid)  { return isSignedIn() && exists(/databases/$(database)/documents/permissions/$(permId(cid))); }
    function isEditor(cid) { return hasPerm(cid) && get(/databases/$(database)/documents/permissions/$(permId(cid))).data.role == 'editor'; }

    match /users/{uid} {
      allow read, write: if isAdmin() || (isSignedIn() && request.auth.uid == uid);
    }
    match /permissions/{doc} {
      // Own doc keyed by id-prefix (NOT resource.data) so a *missing* own-permission doc reads as
      // "empty", not "denied" — an awaiting-access user must be able to discover they have no grant.
      // permId = `${uid}_${codexId}` and Auth uids contain no '_', so split('_')[0] == uid is exact.
      allow read:  if isAdmin() || (isSignedIn() && doc.split('_')[0] == request.auth.uid);
      allow write: if isAdmin();                          // nobody grants themselves access
    }
    match /codices/{cid} {
      allow read:  if isAdmin() || hasPerm(cid);
      allow write: if isAdmin();                          // codex metadata: admin only
      match /entries/{d} { allow read: if isAdmin() || hasPerm(cid); allow write: if isAdmin() || isEditor(cid); }
      match /atlas/{d}   { allow read: if isAdmin() || hasPerm(cid); allow write: if isAdmin() || isEditor(cid); }
      match /schemas/{d} { allow read: if isAdmin() || hasPerm(cid); allow write: if isAdmin(); }  // admin-only
    }
  }
}
```

**Refinements from the Phase 1 §4 matrix (both follow from §2 decisions):**

1. **`schemas` write is admin-only** — Types editing is an admin responsibility; editors author entries only.
2. **Capability-gated boot order** (see §5) keeps awaiting-access users from issuing denied reads.

**Manual rules verification** (no emulator/CLI here — documented checklist run in a real browser):

- Admin account → full read/write everywhere; Admin tab present.
- Grant a second Google account **viewer** → codex reads succeed, any entry write is **rejected**; no Edit
  button; no Admin tab.
- Change it to **editor** → entry/atlas writes succeed; schema writes still rejected (Types not shown).
- A **no-access** account → all codex reads blocked → awaiting-access screen; appears in the admin roster.
- Revoke access → the user drops back to awaiting-access on next resolve.

## 8. Testing

- **Pure unit tests** (`node:test`, extending the current 96):
  - `capabilities.test.js` — every branch of the §3 table: no user; admin email (all caps, even with no
    permission doc); editor (read+write); viewer (read-only); no perm (`none`); case-insensitive email.
  - `authProfile.test.js` — updated for the identity-only shrink (allowlist assertions removed).
  - A `users`-upsert payload-shape test (pure builder), mirroring the `seedCodex` test style.
- **Firestore rules** — the manual checklist in §7 (emulator + `@firebase/rules-unit-testing` noted as a
  future add; YAGNI now).
- **DOM / flow** — read↔edit toggle, admin roster grant/revoke, awaiting-access, viewer read-only —
  browser-verified via `npm run dev` + manual/headless, matching the project's existing verification approach.

## 9. Non-goals / YAGNI

- No multi-codex switcher UI or data-driven nav — that's Phase 3. Phase 2 stays single-codex (`atm10`),
  everything already codex-scoped from Phase 1.
- No per-codex owner-admins or roles beyond `editor` / `viewer` — one super-admin covers it.
- No email-keyed invites / pending grants — sign-in-first only.
- No serverless functions / Admin SDK / custom claims — client + rules only.
- No rules emulator harness yet — manual verification.

## 10. Implementation sequence

1. **`capabilities.js`** (pure) + tests — the resolution table in §3.
2. **`appConfig.js`** — add `auth.adminEmail`; remove `auth.allowlist`. **`authProfile.js`** — shrink to
   identity-only + update its tests.
3. **`FirebaseManager`** — add `upsertUser`, `deletePermission`, `subscribePermission`, `subscribeUsers`,
   `subscribePermissions` (+ a pure users-doc builder + test).
4. **Boot/auth wiring in `main.js`** — on sign-in: upsert user, subscribe own permission for the current
   codex, compute `state.caps`; gate the three screens; defer codex-content subscriptions until `canRead`.
5. **Awaiting-access screen** (`awaitingAccess.js`) + wire state 2.
6. **Read-first workspace** — `state.mode`; render read view by default; `canEdit` Edit toggle reveals the
   builder + Open/Save; viewer never sees it. Atlas read/edit gating.
7. **Admin section** — nav swap (remove Types, add Admin, `canAdmin`-gated); `adminView.js` with the three
   panels; relocate the Types editor; wire the roster grant/revoke and the Initialize-codex button.
8. **`firestore.rules`** — write the §7 rules into the repo; paste into the Firebase console to lock the DB.
9. **Verify** — `npm test` green; run the §7 manual rules checklist in a real browser with a second account.
10. **Commit + push** (personal PAT, HANDOFF §7).
