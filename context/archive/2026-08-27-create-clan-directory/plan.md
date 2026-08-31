# Create clan directory — Implementation Plan

## Overview

Ship north-star S-18: a verified member creates a clan (name, tag, optional profile picture) and guests browse a public directory ranked by `clans.points` (honest zeros until S-23), open details (name, tag, picture, members, points), and never see email. Picture uses a reusable Supabase Storage helper and lands on the clan row at INSERT so F-02’s no-UPDATE freeze on `points` stays intact.

## Current State Analysis

F-02 is on `main` (`supabase/migrations/20260827114633_clan_domain_schema.sql`): `clans` + `clan_members`, guest `SELECT`, verified owner `INSERT` with `points = 0`, DEFINER trigger seats the owner, unique `lower(btrim(tag))`, one clan per player (`clan_members.user_id` PK). **No** picture column, **no** `GRANT UPDATE` on `clans`, **no** app callers outside generated `src/types/database.ts`.

Verified is `profiles.is_verified` / `public_profiles.is_verified`, admin-set. Middleware locals are `{ role, isBanned, nickname }` — not `isVerified`. Create-run is the wrong gate (any signed-in member can create a **public** run). Copy friends: `requireVerifiedViewer` + RLS `clans_insert_verified_owner`.

Public list+detail to copy: `/runs` (guest directory + CTA) and `/players/{id}` (404 not 403, `PageChrome`, `dl`, `NicknameLink`). `PROTECTED_ROUTES` is prefix-based — `/clans` must stay off that list; `/clans/new` is the signed-in create page (like `/runs/new`).

Picture upload is greenfield: Storage is enabled in `supabase/config.toml`; no buckets, no R2, no `type="file"`. Ranking has no `ORDER BY points` query yet.

## Desired End State

- Local (and the next `v*` tag) has a public `clan-pictures` bucket, a nullable `clans.picture_path`, and still **no** table UPDATE privilege on `clans`.
- A verified, not-banned member with a nickname and no existing membership creates a clan via `/clans/new` (optional JPEG/PNG/WebP). Guests open `/clans` (ranked list) and `/clans/{id}` (details) without signing in.
- Unverified signed-in users see verify-copy, not Create. Already-members see a link to their clan, not the form. Tag clash and second-clan PK map to fixed `?error=` strings.
- Topbar **Clans** (guest and signed-in), Footer **Browse Clans**, Welcome **Browse clans**. No **New clan** in chrome. Email never appears on clan pages.
- `npm run lint` and `npm run build` pass; types regenerated with `npm run db:types`.

### Key Discoveries:

- F-02 INSERT already encodes FR-014 at the database: `auth.uid() = owner_id`, `is_not_banned()`, `public_profiles.is_verified`, `points = 0` (`20260827114633_clan_domain_schema.sql:100-114`). App layer must still map failures; do not invent a `create_clan` RPC.
- Filling picture **after** INSERT would need `GRANT UPDATE` — F-02 froze that so PostgREST cannot change `points`. Picture-at-INSERT (client-generated `id` + upload then insert) avoids a clans UPDATE policy entirely.
- Members must join `clan_members.user_id` → `public_profiles` (nickname only). `profiles` carries email; keep it off clan pages (roadmap S-18 risk; AGENTS.md).
- Friends copy for unverified: “Friends require a verified account. Ask an admin to verify you…” (`FriendsInbox.astro:37-40`). `/auth/verified` is email-confirm, not admin verify.
- Unique violations elsewhere map `23505` to a user string (`profile.ts`, `friends.ts`) and **never** echo PostgREST (`lessons.md`). Clan tag vs membership mapping copies `mapRunMapCategoryConstraintError` (`runs.ts`): concatenate `message`/`details`/`hint` and `includes` the index/PK names — PostgREST has no `constraint` field.
- Production schema lag: F-02 (and this migration) apply on the next `/gh-release` tag, not on merge to `main`.

## What We're NOT Doing

- Friend invites into a clan (S-19)
- Clan runs, officers appointment UI, owner/officer roles as global roles (S-21)
- Verified-finish / mutating `clans.points` (S-23) — ranking displays zeros honestly
- `GRANT UPDATE` on `clans` (including a picture-only UPDATE) — picture is INSERT-only this slice
- Cloudflare R2, data URLs, or paste-external-URL as the picture source
- Comment screenshots (S-20) — reuse the **helper**, not the public `clan-pictures` bucket (comment ACL is not world-readable)
- Prefix-protecting `/clans` or `/clans/{id}`
- Pagination, tag-slug URLs, a separate ranking page, “New clan” in Topbar/Footer
- Client INSERT/UPDATE on `clan_members`; extra DEFINER helpers; joining clan rows to `runs`

## Implementation Approach

One additive migration (nullable `picture_path` + public Storage bucket + `storage.objects` RLS) → regenerate types → reusable upload helper parameterized by bucket → multipart `POST /api/clans` (verified + nickname + membership checks, then upload-if-present, then `clans` INSERT with generated `id`) → protected `/clans/new` with three non-success states → public ranked `/clans` + `/clans/{id}` → chrome + `safe-return-to` + AGENTS.md.

## Critical Implementation Details

**Picture write order.** Generate the clan UUID in the API, upload to `{auth.uid()}/{clanId}.{ext}` when a file is present, then `INSERT` into `clans` with that `id` and `picture_path`. If INSERT fails, `storage.remove` the object (needs a folder-scoped DELETE policy). Do not `GRANT UPDATE` on `clans`.

**S-20 reuse.** Extract MIME/size/path/upload/`getPublicUrl` as a bucket-parameterized helper. Comment screenshots must **not** share the public `clan-pictures` bucket — S-20 will add its own bucket with comment ACL.

**Path column, not URL.** Store the object key (`picture_path`), not `https://…` and not a data URL. A CHECK should reject anything that is not `{uuid}/{uuid}.{jpg|jpeg|png|webp}` so the column cannot become an open redirect or hotlink field.

## Phase 1: Picture column + Storage bucket

### Overview

Add the smallest schema write that can store a picture at INSERT, plus a public bucket S-20 can pattern-match, without opening `clans` UPDATE.

### Changes Required:

#### 1. Migration — `picture_path` + bucket + storage RLS

**File**: `supabase/migrations/<timestamp>_clan_picture_storage.sql` (via `npx supabase migration new clan_picture_storage`)

**Intent**: Let a verified owner persist an optional picture key on create, and let guests read the object via the public URL, without giving PostgREST a way to change `points`.

**Contract**:
- `alter table public.clans add column picture_path text null` with a CHECK: null **or** matches owner-folder object keys only. Non-obvious constraint:

```sql
constraint clans_picture_path_chk check (
  picture_path is null
  or picture_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
);
```

- **Do not** `GRANT UPDATE` on `public.clans`. **Do not** add an UPDATE policy. Confirm `has_table_privilege(..., 'UPDATE')` stays false for `anon` and `authenticated`.
- Leave `clans_insert_verified_owner` as-is (`points = 0` still required). Nullable `picture_path` is allowed on INSERT.
- Insert public bucket `clan-pictures` (`storage.buckets`): `public = true`, `file_size_limit = 1048576` (1 MiB), `allowed_mime_types = {image/jpeg,image/png,image/webp}`.
- `storage.objects` RLS (bucket_id = `clan-pictures` only):
  - SELECT to `anon` and `authenticated` (`using (true)` on that bucket) so public URLs work.
  - INSERT to `authenticated` when `(storage.foldername(name))[1] = (select auth.uid()::text)`.
  - DELETE to `authenticated` with the same folder check (orphan cleanup after a failed clan INSERT).
  - No UPDATE policy on `storage.objects` for this bucket.
- No index on `clans.points` (directory is small; zeros until S-23).

#### 2. Regenerated types

**File**: `src/types/database.ts` (only via `npm run db:types`)

**Intent**: Typed client includes `clans.picture_path` without hand-edits.

**Contract**: `clans.Row` / `Insert` gain `picture_path: string | null` (Insert optional). Do not hand-edit this file.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` exits 0 (new migration applies after F-02)
- `npm run db:types` — `clans` includes `picture_path`; file is not hand-edited
- SQL smoke (local JWT `anon` / `authenticated`, same style as F-02 Phase 2): bucket row exists and is public; `authenticated` has INSERT+DELETE but not UPDATE on `clans`; verified INSERT with `picture_path` set and `points` omitted succeeds; `UPDATE clans SET picture_path = …` and `UPDATE clans SET points = 1` both fail; unverified INSERT still fails; anon SELECT of `picture_path` succeeds
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification:

- Local Studio: `clans.picture_path` nullable; `storage.buckets` shows `clan-pictures` with 1 MiB + jpeg/png/webp

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Create clan (verified write path)

### Overview

Signed-in verified members create a clan via a protected page and multipart POST. Guests never hit this page (middleware). Unverified and already-members never see a doomed form.

### Changes Required:

#### 1. Reusable storage helper

**File**: `src/lib/storage.ts` (new)

**Intent**: One upload/public-URL helper S-20 can call with a different bucket, without coupling comment screenshots to a public clan bucket.

**Contract**: Export bucket constant `clan-pictures`, allowed MIME set (`image/jpeg`, `image/png`, `image/webp`), 1 MiB max, object-path builder `{ownerId}/{clanId}.{ext}`, `uploadPublicImage(supabase, { bucket, path, bytes, mime })`, `publicObjectUrl(supabase, bucket, path)` via `storage.from(bucket).getPublicUrl`, and `removeObject` for rollback. Reject wrong MIME/size in-process before calling Storage. Map in-process rejects **and** bucket-limit failures to the same fixed string: “Picture must be a JPEG, PNG, or WebP under 1 MB.” Never forward Storage/`error.message` into `?error=`.

#### 2. Clan service

**File**: `src/lib/services/clans.ts` (new)

**Intent**: All clan reads/writes go through one service so list, detail, create, and already-member checks share DTOs and error strings.

**Contract**:
- `ClanError` with **fixed** messages only (log PostgREST server-side). Suggested strings: verified-only copy (FriendsInbox spirit: clans require a verified account / ask an admin); “You already belong to a clan.”; “That clan tag is already taken.”; “Verified nicknames are locked. Request a change on your profile.”; “Picture must be a JPEG, PNG, or WebP under 1 MB.”; generic “Could not create clan” / “Could not load clans”.
- `requireVerifiedViewer` pattern copied from `friends.ts` (lookup `public_profiles.is_verified`) — do not throw `FriendsError`.
- `getClanMembershipForUser(userId)` → `{ clanId } | null` from `clan_members`.
- `createClan({ ownerId, name, tag, pictureFile? })`: trim name/tag against existing CHECKs (name ≤ 100, tag ≤ 16, nonempty); generate `clanId`; optional upload; `insert` into `clans` with `id`, `owner_id`, `name`, `tag`, `picture_path`, omit `points` (default 0); on `23505` copy `mapRunMapCategoryConstraintError` (`src/lib/services/runs.ts`): concatenate `error.message` / `error.details` / `error.hint` and match with `includes` — blob includes `clans_tag_lower_btrim_uidx` → “That clan tag is already taken.”; blob includes `clan_members_pkey` → “You already belong to a clan.” There is no `error.constraint` field. Log the raw error; never put `error.message` in the redirect. On insert failure after upload, remove the object.
- `listClans()` / `getClanById(id)` may land here in this phase even if pages wait for Phase 3 — membership lookup is required for `/clans/new`. Join members via `public_profiles` (`id`, `nickname` only — never `profiles.email`). Rank: `points` DESC, then `name` ASC, then `id` ASC.

#### 3. Create API

**File**: `src/pages/api/clans/index.ts` (new)

**Intent**: Form POST + redirect, same HTTP shape as `POST /api/runs`, with friends-style verified gate.

**Contract**: `export const POST`. Read `FormData` (`name`, `tag`, optional `picture` file). Unauthenticated → `/auth/signin`. `ensureOwnProfile` / `getOwnProfile`; banned is already middleware-gated on `/api/*`. Unverified → `fail` with the verified-only string. If `isVerified && !nickname` → `fail` with create-run’s locked copy (“Verified nicknames are locked. Request a change on your profile.”) — clan create is verified-only, so this is the only no-nickname path; do **not** add a nickname field on `CreateClanForm`. Success → redirect `/clans/{id}`. Fail → `/clans/new?error=` with **fixed** strings only (`lessons.md`).

#### 4. Create page + form island

**Files**: `src/pages/clans/new.astro` (new); `src/components/clans/CreateClanForm.tsx` (new)

**Intent**: Protected create UI that does not render the form when it cannot succeed.

**Contract**:
- Add `"/clans/new"` to `PROTECTED_ROUTES` in `src/middleware.ts` (exact prefix like `/runs/new`). Do **not** add `"/clans"`.
- Page branches: banned banner (copy `runs/new.astro`); unverified → FriendsInbox-style paragraph, no form; already a member → explanation + link to `/clans/{id}`; else React island `client:load`, `method=POST` `action="/api/clans"`, `encType="multipart/form-data"`, fields name/tag/optional file (`accept` jpeg/png/webp). No nickname field. Optional picture — no client-only required-file gate.
- `?error=` via existing `ServerError` / banner pattern.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0
- `npm run build` exits 0
- `PROTECTED_ROUTES` contains `/clans/new` and does not contain `/clans`

#### Manual Verification:

- Guest hitting `/clans/new` redirects to sign-in
- Signed-in unverified: verify-copy, no form; POST (if forced) redirects with verified-only string, not a PostgREST blob
- Already-member: no form; link to their clan; POST maps 23505 to “You already belong to a clan.”
- Verified with nickname, unique tag, no file: clan created, owner seated, `picture_path` null, redirect to detail (page may 404 until Phase 3 — then confirm via Studio / SQL)
- Same with a valid <1 MiB PNG/JPEG/WebP: object in `{uid}/{clanId}.ext`, `picture_path` set
- Duplicate tag: “That clan tag is already taken.”
- Oversized or wrong MIME: “Picture must be a JPEG, PNG, or WebP under 1 MB.”; no clan row

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Public directory, details, and nav

### Overview

Guests browse every clan ranked by points, open details, and find Clans from chrome — without a Create shortcut that skips the verified gate.

### Changes Required:

#### 1. Ranked directory

**Files**: `src/pages/clans/index.astro` (new); `src/components/clans/ClanCard.astro` (new)

**Intent**: Guest-readable ranking + directory in one page (`/clans` is both).

**Contract**: `Layout` + `PageChrome` + SSR `listClans()`. Cards: name, tag, points, picture or placeholder (tag initials / empty avatar — no extra asset required). Link to `/clans/{id}`. Empty and load-error states. CTA: guest → `/auth/signin` “Sign in to create”; signed-in unverified → verify-copy, no Create button; verified with no membership → `/clans/new`; already-member → no Create (optional text link to their clan). `?error=` / `?notice=` banners like `/runs`. No pagination. Do not section by visibility — clans are world-readable (FR-028 is “do not leak runs,” already true because clan queries must not join `runs`).

#### 2. Clan details

**File**: `src/pages/clans/[id].astro` (new)

**Intent**: Guest detail page matching `/players/{id}` tone: identity header, `dl` fields, member roster, true 404.

**Contract**: Invalid/missing id → `Astro.response.status = 404` and not-found copy, **never 403**. Back link `← Clans`. Show name, tag, picture or placeholder, points, members as `NicknameLink` → `/players/{uuid}` from `public_profiles.nickname` only. No email, no `profiles` select. Owner may appear in the same roster (they are a `clan_members` row).

#### 3. Chrome, return-to, AGENTS.md, stale baseline

**Files**: `src/components/Topbar.astro`; `src/components/Footer.astro`; `src/components/Welcome.astro`; `src/lib/safe-return-to.ts`; `AGENTS.md`; `context/foundation/roadmap.md` (Baseline line only if still stale)

**Intent**: Guests can find the directory the same way they find `/runs`, without a global Create that bypasses verification. Docs match the new public prefix.

**Contract**:
- Topbar: **Clans** → `/clans` for guests and signed-in (next to Runs). Do **not** add New clan.
- Footer: **Browse Clans** → `/clans`. Do **not** add Create a Clan.
- Welcome: secondary **Browse clans** → `/clans` (keep Create a Run as the primary).
- `safeAuthReturnTo`: also allow `/clans/{uuid}` (same uuid regex as runs/players). Exact `/clans` optional; guest CTA may omit `returnTo` (matches `/runs`).
- AGENTS.md Hard Rules: list `/clans/new` among protected routes; add “do not prefix-protect `/clans` — the public list and `/clans/{id}` stay open”; note clan members render from `public_profiles` (no email on clan pages).
- Roadmap `## Baseline` Data line still said “Absent: clan tables” after F-02 — rewrite to present (F-02 clan tables) / absent screenshots only, if that sentence is still stale when this phase runs.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0
- `npm run build` exits 0
- `AGENTS.md` states not to prefix-protect `/clans`; `middleware.ts` `PROTECTED_ROUTES` has `/clans/new` and not `/clans`

#### Manual Verification:

- Guest (no cookies): `/clans` lists clans by points DESC (ties by name, then id); zeros are visible and honest; cards link to details; CTA is Sign in to create; Topbar/Footer/Welcome Clans links work
- Guest `/clans/{id}`: name, tag, picture or placeholder, points, member nicknames linking to `/players/{id}`; no email in HTML
- Guest `/clans/{missing-uuid}`: 404 copy, status 404
- Signed-in unverified on `/clans`: verify-copy, no Create
- Verified non-member: Create → `/clans/new` → success lands on detail with picture (or placeholder)
- Restricted runs still 404 for outsiders; clan pages do not list runs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- No test runner in `package.json` — do not add Vitest for this slice.

### Integration Tests:

- Phase 1 SQL smoke (JWT impersonation) is the schema/RLS stand-in, matching F-02.
- `npm run lint` + `npm run build` on every phase.

### Manual Testing Steps:

1. `npx supabase start` if needed, then `db reset`, `npm run dev` — open [http://localhost:4321/clans](http://localhost:4321/clans).
2. As guest: directory, detail, 404, chrome links, no email.
3. As signed-in unverified: verify-copy on `/clans` and `/clans/new`.
4. As verified: create without picture, with picture, duplicate tag, second clan blocked.
5. Confirm Studio: `clans` has no UPDATE privilege; `points` stays 0; object lives under `{uid}/{clanId}.ext`.

## Performance Considerations

Full-table `ORDER BY points DESC, name ASC, id ASC` is enough while points are all zero and clan count is small. Skip a `points` index until S-23 or the directory grows. Public Storage URLs are CDN-style; do not proxy images through the Worker.

## Migration Notes

Additive only: new column (null for any F-02 rows created in local/dev), new bucket, new policies. No backfill. Rollback locally is `db reset` to F-02. Production ships on the next `v*` tag (`cd_trigger: tag`) together with F-02 if that tag is the first to include `20260827114633_clan_domain_schema.sql`. Do not `db push` to the linked remote from this change.

## References

- Related research: `context/changes/create-clan-directory/research.md`
- F-02 schema: `supabase/migrations/20260827114633_clan_domain_schema.sql`
- Verified mutation copy: `src/lib/services/friends.ts` (`requireVerifiedViewer`); `src/components/profile/FriendsInbox.astro`
- Create HTTP shape: `src/pages/api/runs/index.ts`; `src/pages/runs/new.astro`
- Unique-violation blob parse: `mapRunMapCategoryConstraintError` in `src/lib/services/runs.ts` (no `error.constraint`; match `clans_tag_lower_btrim_uidx` / `clan_members_pkey`)
- Guest list: `src/pages/runs/index.astro`
- Public detail / 404 / nicknames: `src/pages/players/[id].astro`; `src/components/NicknameLink.astro`
- Storage docs (Context7 `/supabase/supabase`): `insert into storage.buckets`; folder-scoped `storage.objects` INSERT; public bucket MIME/size limits
- Lessons: never echo PostgREST into `?error=`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Picture column + Storage bucket

#### Automated

- [x] 1.1 npx supabase db reset exits 0 (new migration applies after F-02) — 456f414
- [x] 1.2 npm run db:types — clans includes picture_path; file is not hand-edited — 456f414
- [x] 1.3 SQL smoke: public clan-pictures bucket; no clans UPDATE grant; verified INSERT with picture_path; UPDATE picture_path and points denied; unverified INSERT fails; anon SELECT picture_path — 456f414
- [x] 1.4 npm run lint exits 0 — 456f414
- [x] 1.5 npm run build exits 0 — 456f414

#### Manual

- [ ] 1.6 Local Studio: clans.picture_path nullable; storage.buckets shows clan-pictures with 1 MiB + jpeg/png/webp

### Phase 2: Create clan (verified write path)

#### Automated

- [x] 2.1 npm run lint exits 0 — 67cd0b6
- [x] 2.2 npm run build exits 0 — 67cd0b6
- [x] 2.3 PROTECTED_ROUTES contains /clans/new and does not contain /clans — 67cd0b6

#### Manual

- [ ] 2.4 Guest hitting /clans/new redirects to sign-in
- [ ] 2.5 Signed-in unverified: verify-copy, no form; forced POST uses verified-only string
- [ ] 2.6 Already-member: no form; link to their clan; POST maps 23505
- [ ] 2.7 Verified create without file: owner seated, picture_path null
- [ ] 2.8 Verified create with valid image: object at {uid}/{clanId}.ext
- [ ] 2.9 Duplicate tag: That clan tag is already taken
- [ ] 2.10 Oversized or wrong MIME: user-facing picture error; no clan row

### Phase 3: Public directory, details, and nav

#### Automated

- [x] 3.1 npm run lint exits 0 — 7eb291b
- [x] 3.2 npm run build exits 0 — 7eb291b
- [x] 3.3 AGENTS.md states not to prefix-protect /clans; middleware PROTECTED_ROUTES has /clans/new and not /clans — 7eb291b

#### Manual

- [ ] 3.4 Guest directory ranked by points; chrome Clans links; Sign in to create CTA
- [ ] 3.5 Guest detail: name, tag, picture or placeholder, points, nicknames; no email
- [ ] 3.6 Guest missing clan: 404 copy and status
- [ ] 3.7 Signed-in unverified on /clans: verify-copy, no Create
- [ ] 3.8 Verified non-member create lands on detail
- [ ] 3.9 Restricted runs still 404 for outsiders; clan pages do not list runs
