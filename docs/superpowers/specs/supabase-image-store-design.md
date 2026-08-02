# Supabase Image Store — Design Spec

> Runtime image upload + management for Codex Studio, on a Firebase + Supabase **hybrid**.
> Replaces the build-time image pool. Authored 2026-08-02 via brainstorm; this spec doubles as
> the implementation plan — §10 is an execution-ready, TDD-ordered checklist (no separate plan doc).

---

## 1. Goal

Let authors add and manage images **at runtime** instead of dropping files into `src/assets/pool/`
and rebuilding. Images live in a shared library, are reused across codices without duplication, and
degrade gracefully when removed. Reading and lightbox-viewing images works for everyone; uploading and
managing them is gated by role.

**The driver is billing safety, not features.** Cloud Storage for Firebase now requires the Blaze plan,
which has no hard spend cap; a runaway call could bill four figures overnight. Supabase's free tier is
hard-capped (it *pauses* instead of billing). So the bytes go to Supabase; everything else stays Firebase.

## 2. Decisions (settled in the brainstorm — do not re-litigate)

- **Hybrid, not a backend swap.** Firebase (Firestore + Auth + `firestore.rules`) stays exactly as-is.
  Supabase is added as a **byte store only**.
- **One global bucket for bytes; per-codex membership is metadata.** Bytes are not partitioned by codex.
  An image "belongs to" a codex via a `codices: []` array on its Firestore metadata record.
- **Content-hash identity → automatic dedup.** An image's id is a hash of its bytes, so identical bytes
  can never produce two records.
- **Roles.** Editors upload and remove-from-their-codex. The admin is a strict superset: sees and adjusts
  every image, owns global archive and cross-assignment.
- **Soft-delete semantics.** *Editor delete = remove the image from my codex* (drop their codex from the
  membership array; other codices are undisturbed). *Admin delete = archive the whole record* (gone
  everywhere). No hard byte deletion in the normal flow — soft delete retains the bytes.
- **Missing image = a not-found SVG**, on both read and edit sides. A delete never breaks a page.
- **Build-time pool retired.** `imagePool.js` and `src/assets/pool/` are deleted. The 3 atlas PNGs there
  are disposable upload-test fixtures, not content to migrate.
- **Rendering.** Uniform tiles via a fixed aspect-ratio box + `object-fit: cover`; the full image is one
  click away in a **lightbox**. (Revisit `cover` → `contain` later if cropping ever bothers us.)
- **Deferred to v2:** multi-file upload, drag-and-drop. v1 is single-file, click-to-choose.

## 3. Data model

**Supabase bucket `pool`** (public read). Object key **is** the content hash — `pool/{hash}`, no
extension, content-type set on upload. Because the key derives from the id alone, the public URL is fully
deterministic:

```
${SUPABASE_URL}/storage/v1/object/public/pool/{hash}
```

**Firestore `images/{hash}`** (top-level collection) — the metadata record and the source of truth for
what exists and where it belongs:

```
images/{hash} = {
  id:         <contentHash>,          // == doc id == storage key
  label:      "Dwarven Hall",         // auto from filename on upload, editable
  codices:    ["atm10", ...],         // membership; drives array-contains queries
  status:     "active" | "archived",  // global soft-delete flag (admin)
  uploadedBy: <uid>,
  createdAt,  updatedAt
}
```

**id** = SHA-256 of the bytes, first 12 hex chars. Everything about an image is reachable from its id:
bytes at `pool/{id}`, metadata at `images/{id}`. `mime`/`width`/`height`/`size` are intentionally **not**
stored — no v1 feature needs them (YAGNI); add later if one does.

An image is "in codex X" iff its record is `active` and `X ∈ codices`. Editor removal shrinks `codices`;
an image with `codices: []` is orphaned-but-retained (visible to the admin's all-images view, referenced
by nothing → not-found SVG anywhere it was used).

## 4. Architecture — ports & adapters

The upload use-case is pure orchestration over two injected ports, so its logic (dedup, the create/
resurrect/add-codex branches) is unit-testable under Node with fakes and never touches the network.

| Module | Kind | Responsibility |
|---|---|---|
| `src/schema/contentHash.js` | pure | `hashBytes(arrayBuffer) → <12-hex id>` via `crypto.subtle` (present in browser **and** Node 24). |
| `src/schema/imageIndex.js` | pure | In-memory id→record map built from a codex's image records. `listImages()` / `resolve(id) → url\|null` / `publicUrl(config, id)`. Deterministic URL construction; no SDK. |
| `src/utils/imageStore.js` | adapter (Supabase) | The **only** module importing `@supabase/supabase-js`. `uploadBytes(hash, file)` (upsert with content-type). Quarantines Supabase to byte storage, mirroring how `firebase.js` quarantines Firestore. URL construction is **not** here — it is pure (`imageIndex.publicUrl`) so sync `resolve()` needs no SDK. |
| `FirebaseManager` (in `firebase.js`) | adapter (Firestore) | New **app-level `images` metadata ops** beside `codices`/`users`/`permissions`: `createImage`, `getImage`, `subscribeImagesForCodex(codexId)` (active + `array-contains`), `subscribeAllImages()` (admin, all statuses), `addImageToCodex`, `removeImageFromCodex`, `setImageStatus`, `updateImageLabel`. |
| `src/schema/imageUpload.js` | use-case (pure-ish) | Coordinator: `hash → getImage → branch`. Injected `{ storage, meta }` ports. Returns the image id. |

**The runtime pool port (the piece the backlog under-described).** `imagePool.js` was a build-time
`import.meta.glob` — synchronous, but static. It is **deleted** and replaced by `imageIndex.js`, populated
at runtime from the current codex's `subscribeImagesForCodex` stream and held in memory. Its `resolve(id)`
stays **synchronous** (look up the in-memory map, return the deterministic URL or `null`), so nothing in
the render path becomes async. This is the exact lifecycle entries and schemas already use: subscribe on
codex-open, hold in memory, re-render on change.

- **Consumers repointed:** `imagePicker.js` and `mediaControls.js` currently `import` the pool module
  directly — they change to read from the injected index. Inline prose already resolves through
  `ctx.resolveImage`, which is wired to the index; no change there.
- **Rejected:** an async `resolve()` (Promise). It would force the picker, media controls, and the entry
  renderer all async for zero benefit — the URL is deterministic and the index is already in memory.

**Upload flow (single file):**

1. Read bytes → `hash`.
2. `getImage(hash)`, then branch:
   - **No record** → upload bytes to `pool/{hash}`, then `createImage` with `codices:[currentCodex]`,
     label from filename, `status:'active'`.
   - **Record active** → dedup hit; bytes already present → `addImageToCodex(hash, currentCodex)`
     (no-op if already a member). No re-upload.
   - **Record archived** → resurrect: `setImageStatus(hash,'active')` + ensure codex membership.
3. **Write order is bytes-first, metadata-second, deliberately.** A failure after bytes land leaves an
   orphan blob nothing references (harmless; a retry dedups onto it). The reverse order could leave a
   metadata record pointing at bytes that never uploaded → a URL that 404s. Failures surface as an error
   toast with the picker left open; over-cap uploads fail cleanly because the free tier pauses.

## 5. Access model

**Layer 1 — Supabase RLS (byte backstop).** Public read on `pool`; writes allowed only when the caller's
Firebase ID token pins to **our** project (`aud == "codex-80902"` / issuer
`https://securetoken.google.com/codex-80902`). This layer is coarse by design — it cannot see per-codex
permissions, only "a signed-in user from our Firebase project." Firebase shares one signing key across all
projects, so pinning to our project id is the security must-do. This layer also depends on the
`role:'authenticated'` custom claim on Firebase users (§8) — without it Supabase sees them as `anon` and
denies writes. An orphan blob with no Firestore record is invisible to the app regardless.

**Layer 2 — Firestore `images` rules (the real gate).** Framing that keeps this enforceable: *editors only
ever touch codex membership and their own uploads' label; everything global is admin.*

| Operation | Who | Rule basis |
|---|---|---|
| Read metadata | any signed-in user | `isSignedIn()` — metadata isn't secret; app already gates on sign-in |
| Create (upload) → `codices:[myCodex]` | editor of that codex, or admin | single codex + single `canEdit()`; validate `uploadedBy == uid`, `status=='active'` |
| Add / remove a codex from `codices[]` | must be a codex **you can edit** | `canEdit()` on the one changed element (set-diff of size ≤ 1); no array iteration needed |
| Edit label | uploader (`uploadedBy == uid`) or admin | single-field compare |
| Global archive/restore (`status`), cross-assign to a codex you can't edit, relabel others' images | **admin only** | `isAdmin()` |

`canEdit(codexId) = isAdmin() || <editor permission doc for (uid, codexId)>`, reusing the existing
`permissions` helper. Non-admins change `codices` **one codex at a time**, gated on that codex, which is
why the rules stay meaningfully strict without hitting Firestore's "can't loop an arbitrary array doing
per-element `get()`" limitation.

## 6. UI components

- **Not-found SVG** — a bundled inline-SVG constant (icon-registry ethos: data-driven, no external asset),
  rendered wherever `resolve(id)` is `null`. Replaces today's bare "missing image" stub; used identically
  on read (content) and edit (picker/media thumbs).
- **Consistent tiles** — shared thumb style: fixed aspect-ratio box + `object-fit: cover`. Uniform across
  the gallery, carousel, and picker. Hero keeps its own wider ratio. Pure CSS; never touches bytes.
- **Lightbox** (`src/components/lightbox.js`) — a reusable overlay showing one image full-size on a dimmed
  backdrop; Esc / click-outside to close. Reuses the overlay idiom `imagePicker.js` established. Wired
  read-side **everywhere** — inline content images, hero, carousel items, gallery cards all become
  click-to-expand, so images render bounded and open large on demand.
- **Admin Images gallery** — a third panel in the **global-admin door** (beside Users & Access and
  Codices, reusing the sidebar-swap structure). One card per image: tile (→ lightbox), editable label,
  codex-membership chips, status, and edit / delete. Delete uses the **in-app confirm modal**, never native
  `confirm()` (native dialogs freeze the Chrome test extension).
- **Picker (editor path)** — the existing `imagePicker.js` gains an **Upload** button (adds to the current
  codex) and a small per-thumb **remove-from-this-codex** affordance shown only to editors of the current
  codex. Editors upload + pick + remove without leaving the authoring flow; no second gallery view in v1.

## 7. Config & local-only

- **`appConfig.js`** gains a `supabase: { url, anonKey, bucket: 'pool' }` block beside the Firebase config.
  These are public **locators, not secrets** (the anon key is safe to ship; RLS is the gate). A pure
  `resolveSupabaseConfig` mirrors `resolveFirebaseConfig`, returning `null` in local-only mode.
- **New runtime dependency:** `@supabase/supabase-js` (the app's second, after `firebase`). Needed for its
  supported third-party-auth path (feeding the Firebase JWT to Supabase); hand-rolling that over the REST
  API would be more fragile.
- **Local-only / demo mode:** the image store is coupled to Firebase (metadata is Firestore), so when
  Firebase is off, the store is off too — empty pool index, an "images unavailable in local-only mode"
  note in the picker, `resolve()` → not-found SVG. The demo fixture is text-only, so nothing dangles.
  **Consequence:** the image feature is exercisable only in configured mode, like the multi-codex features.

## 8. Supabase setup (user prerequisite, one-time)

Verified 2026-08 against the Supabase Firebase-auth guide (`supabase.com/docs/guides/auth/third-party/firebase-auth`).
Exact dashboard labels may shift; verify at setup.

1. **Bucket `pool`** — make it a **public bucket** (public read serves the deterministic URLs with no auth,
   so RLS only has to gate writes).
2. **Add the Firebase Third-Party Auth integration** — Dashboard → Authentication → **Third-Party Auth** →
   add Firebase with our Firebase **Project ID `codex-80902`**. Supabase then trusts Firebase-issued JWTs;
   no separate Supabase login.
3. **Set the `role: 'authenticated'` custom claim on Firebase users — the key gotcha.** Firebase ID tokens
   carry **no `role` claim**, so without this Supabase treats the user as `anon` and every `to authenticated`
   write policy denies them. To stay off serverless/Blaze, set it with a **one-time local `firebase-admin`
   script** (`setCustomUserClaims(uid, { role: 'authenticated' })`) run against the 2–3 user UIDs with a
   downloaded service-account key; re-run when a user is added. This is a one-off admin task, **not a runtime
   broker** — the runtime stays broker-free. Users re-fetch their token (`getIdToken(true)`) once after.
4. **RLS on `storage.objects`** — a **restrictive** policy pinning to our project, plus a permissive write
   policy (public read comes from the public bucket, so no SELECT policy):

   ```sql
   create policy "pin-firebase-codex-80902" on storage.objects
     as restrictive to authenticated
     using (
       auth.jwt()->>'iss' = 'https://securetoken.google.com/codex-80902'
       and auth.jwt()->>'aud' = 'codex-80902'
     );
   create policy "pool-write"  on storage.objects for insert to authenticated with check (bucket_id = 'pool');
   create policy "pool-update" on storage.objects for update to authenticated using (bucket_id = 'pool');
   ```

   Validate these **deny** a foreign/anonymous write during Phase C.
5. Provide the project **URL + anon (publishable) key** for `appConfig.js`.
6. Confirm the **free-tier cap = pause (not bill)** behavior in the dashboard.

## 9. Testing strategy

- **`node:test` (pure, no network):** `contentHash`; `imageIndex` (`listImages`/`resolve`/`publicUrl` off
  an in-memory map); `imageUpload` coordinator driven by **fake byte + metadata ports** — every branch
  (new / dedup-active / resurrect-archived / add-a-codex-you-can-edit); `resolveSupabaseConfig`.
- **Browser-verified (Chrome extension / headless), configured mode:** upload round-trip, dedup on
  re-upload, picker upload + remove-from-codex, admin gallery edit/delete/cross-assign, lightbox,
  not-found fallback.
- **`firestore.rules`:** authored in-repo as source of truth, pasted to the console, and **manually
  verified with editor + admin accounts** — deliberately including the **deny** cases (an editor trying to
  touch a codex they can't edit). A `@firebase/rules-unit-testing` harness is the rigorous route but is a
  new dep + emulator; **out of v1 scope** unless we choose otherwise.

## 10. Implementation checklist (TDD, ordered — the plan)

Each phase ends at a **gate**. Pure modules are written **test-first** (red → green). Nothing in a later
phase starts until the prior gate is green.

**Phase A — pure foundations (all `node:test`, no network):**
1. `contentHash.js` + test — hashing is stable and 12-hex.
2. `imageIndex.js` + test — build map from records; `listImages` sorted; `resolve` returns deterministic
   URL or `null`; `publicUrl(config, id)` pure.
3. `imageUpload.js` + test — coordinator over injected `{ storage, meta }` fakes; assert each branch and
   the bytes-first ordering.
4. `resolveSupabaseConfig` in `appConfig.js` + test — baked config, `null` in local-only.
   **Gate:** full `node:test` suite green.

**Phase B — adapters (integration, configured mode):**
5. `imageStore.js` — Supabase adapter (`uploadBytes` upsert with content-type), wired to the SDK's
   third-party-auth `accessToken` (Firebase `getIdToken`). (URL construction stays in `imageIndex`, Phase A.)
6. `FirebaseManager` image metadata ops (`createImage`, `getImage`, `subscribeImagesForCodex`,
   `subscribeAllImages`, `addImageToCodex`, `removeImageFromCodex`, `setImageStatus`, `updateImageLabel`).
7. `appConfig.js` `supabase` block; add `@supabase/supabase-js`.
   **Gate:** a manual upload round-trip writes a blob + a record and reads the URL back.

**Phase C — rules:**
8. `firestore.rules` `images` collection per §5; manual **deny-case** verification with editor + admin
   accounts; paste to console.
   **Gate:** editor can create/remove in own codex and is denied on a foreign codex; admin can do all.

**Phase D — wiring & pool retirement:**
9. `main.js`: subscribe images on codex-open and in `switchCodex`; build the `imageIndex`; point
   `ctx.resolveImage` at it; refresh on change.
10. Delete `imagePool.js` and `src/assets/pool/*`; repoint `imagePicker.js` + `mediaControls.js` off the
    deleted module onto the injected index.
11. Not-found SVG constant; apply on read + edit sides.
    **Gate:** `vite build` clean; a configured build renders existing image refs from Firestore/Supabase,
    and a bogus id shows the not-found SVG.

**Phase E — UI:**
12. `lightbox.js` + wire read-side (inline / hero / carousel / gallery cards).
13. Picker **Upload** button + editor **remove-from-codex** affordance (gated to editors of the codex).
14. Admin **Images** gallery panel in the global-admin door: cards, label edit, cross-assign, archive/
    restore, delete via the confirm modal.
15. CSS: tiles (`cover` + aspect-ratio boxes), lightbox, gallery cards.
    **Gate:** browser walk-through of every UI path in configured mode.

**Phase F — verify & smoke:**
16. Full `node:test` green; `vite build` clean.
17. Browser-verify configured mode end to end (§9 list), including rules deny cases.
18. Upload the 3 disposable atlas PNGs to smoke the Supabase round-trip; they carry no content weight
    afterward.

## 11. Out of scope / deferred

- **v2 features:** multi-file upload, drag-and-drop (own backlog item).
- **Summary-card generalization:** the admin gallery is built focused; it becomes the first consumer when
  the summary-card component is extracted later (separate backlog item).
- **`@firebase/rules-unit-testing` harness** — manual deny-case verification for v1.
- **Hard byte purge** — bytes are retained on soft delete; no purge flow in v1.
- **`mime`/`width`/`height`/`size` metadata** — add only when a feature needs it.
- **Toast coverage review** — tracked as its own backlog item, its own session.
