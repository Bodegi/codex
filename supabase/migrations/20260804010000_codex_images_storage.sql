-- Codex image byte store — Supabase Storage bucket + RLS.
--
-- SSOT for the `codex-images` Storage config. Until now this lived ONLY in the Supabase
-- dashboard; this file brings it under version control so it deploys like firestore.rules
-- (see supabase/config.toml for the deploy recipe).
--
-- Reconciled against the LIVE project (mdvkrumxjunrpabgeamy) on 2026-08-04 via the Management
-- API (select from pg_policies / storage.buckets) — the policy names and expressions below are
-- the real ones, not a guess. The remote has no CLI migration history yet (all dashboard-made),
-- so to adopt this file as the baseline without re-running it against a project that already has
-- these objects: `supabase migration repair --status applied 20260804010000`. All DDL here is
-- idempotent regardless, so a real apply on a fresh project reproduces prod.
--
-- The two load-bearing pins, both of which fail SILENTLY if "hardened" the wrong way:
--   • Granted `to public`, NOT `to authenticated`. Storage's RLS context can't read the
--     Firebase iss/aud claims on the authenticated-role path, and we mint no per-user
--     role:'authenticated' claim — so `to authenticated` silently denies every new user's
--     first upload while looking stricter.
--   • `with check` pins iss + aud to THIS Firebase project (codex-80902). Firebase shares one
--     signing key across all its projects, so a loose "is authenticated" check would let any
--     Firebase project's token write — and the bucket is public-read, so those bytes go
--     world-visible.

-- Public-read bucket. Reads are served via the public object path
-- (/storage/v1/object/public/codex-images/<hash>, built by imageIndex.publicUrl), which
-- bypasses RLS by virtue of this `public = true` flag — so no SELECT policy is needed.
insert into storage.buckets (id, name, public)
values ('codex-images', 'codex-images', true)
on conflict (id) do update set public = excluded.public;

-- Upload path. The app is insert-only (content-hash identity ⇒ immutable bytes; a re-upload
-- 409s harmlessly — see imageStore.js uploadBytes), so this INSERT policy is the one the app
-- actually exercises.
drop policy if exists "codex-images-write" on storage.objects;
create policy "codex-images-write"
on storage.objects
for insert
to public
with check (
  bucket_id = 'codex-images'
  and (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/codex-80902'
  and (auth.jwt() ->> 'aud') = 'codex-80902'
);

-- UPDATE policy present in the live project, same iss/aud pin. The app never issues an update
-- (uploadBytes uses insert, not upsert — an upsert would exercise this path, and the comment in
-- imageStore.js explains why insert-only is the deliberate model), so this is effectively latent
-- but kept here to make the migration a faithful mirror of the live bucket.
drop policy if exists "codex-images-update" on storage.objects;
create policy "codex-images-update"
on storage.objects
for update
to public
using (
  bucket_id = 'codex-images'
  and (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/codex-80902'
  and (auth.jwt() ->> 'aud') = 'codex-80902'
)
with check (
  bucket_id = 'codex-images'
  and (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/codex-80902'
  and (auth.jwt() ->> 'aud') = 'codex-80902'
);
