---
date: 2026-08-27T14:43:35+02:00
researcher: migget
git_commit: a164fe036d1abc2c845e98e5cdd0d1221dc75357
branch: main
repository: book_your_miggets
topic: "S-18 create-clan-directory — F-02 clan schema/RLS, verified-member gating, public list+detail patterns, picture upload, points ranking, nav"
tags: [research, codebase, clans, rls, verified-members, public-directory, storage, s-18, f-02]
status: complete
last_updated: 2026-08-27
last_updated_by: migget
last_updated_note: "Added follow-up research for delayed Explore-agent deltas (FriendsInbox copy, no points index, admin verify surface)"
---

# Research: S-18 create-clan-directory — existing clan schema, gating, and public-directory patterns

**Date**: 2026-08-27T14:43:35+02:00
**Researcher**: migget
**Git Commit**: [a164fe036d1abc2c845e98e5cdd0d1221dc75357](https://github.com/Miigget/book_your_miggets/commit/a164fe036d1abc2c845e98e5cdd0d1221dc75357)
**Branch**: main
**Repository**: book_your_miggets

## Research Question

Map what already exists for north-star S-18 (verified member creates a clan; guests browse directory, details, and points ranking). Do not design the plan. Do not invent invites, clan runs, officer UI, or verified-finish points.

Crew Lead focus:

1. F-02 clan tables, columns, RLS (guest SELECT vs verified INSERT), generated types.
2. Verified-member gating (admin flag; how create-run or similar gates on it).
3. Public directory/detail patterns (`/players`, `/runs` list+detail, `PROTECTED_ROUTES`).
4. Existing upload/storage for pictures (avatars, maps, comments) — likely none.
5. Points column default 0 and ranking-ready queries if any.
6. Nav/layout patterns for a new public section.

## Summary

F-02 is **on `main`** (merge [PR #96](https://github.com/Miigget/book_your_miggets/pull/96) at `a164fe0`) and **not in production**: latest tag `v0.1.26` does not contain the clan migration. Local/CD will apply `clans` + `clan_members` on the next `v*` release. There is **no app surface** yet — zero `src/` callers besides generated `src/types/database.ts`.

The schema already encodes S-18’s write/read contract for name/tag/members/points:

- Guest/`anon` and signed-in `SELECT` on both tables (`USING (true)`).
- Verified, not-banned owner `INSERT` on `clans` with `points = 0`; DEFINER trigger seats the owner as the only `clan_members` row.
- **No** client `INSERT`/`UPDATE` on `clan_members`; **no** `GRANT UPDATE` on `clans` (points frozen; rename/picture-after-insert cannot happen until S-18 adds a write).
- One clan per player (`clan_members.user_id` PK). Unique `lower(btrim(tag))`. Name required, not unique. No picture column.

Verified is `profiles.is_verified`, admin-only (`POST /api/admin/users/{id}/verify`). App reads it via `getOwnProfile` / `public_profiles`, **not** middleware locals. Create-run is **not** a verified gate (any signed-in non-banned member can create a **public** run). The copy-target for “verified member can create a clan” is **friend requests** (`requireVerifiedViewer` + RLS `public_profiles.is_verified`) and the **already-shipped** `clans_insert_verified_owner` policy — not `POST /api/runs`.

Public list+detail to copy: `/runs` (guest directory + create CTA) and `/players/{id}` (404 not 403, `PageChrome`, `dl` detail, `NicknameLink` roster). There is **no** `/players` index and **no** `/clans` routes. `PROTECTED_ROUTES` is prefix-based; do **not** prefix-protect `/clans` (same AGENTS.md rule as `/runs`).

Picture upload: **none**. No Storage buckets, no R2, no `type=file`, no avatar/image columns on profiles/maps/comments. Ranking: `clans.points` defaults to 0; **no** `ORDER BY points` query exists. Closest numeric display is per-player KoG points on `/players/{id}`, unsorted.

## Detailed Findings

### 1. F-02 clan tables, columns, RLS, types

Migration: [`supabase/migrations/20260827114633_clan_domain_schema.sql`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql) (header states no picture, officers, `create_clan` RPC, or joins to run tables).

**`public.clans`** ([`:8-26`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql#L8-L26)):

| Column | Constraint |
| --- | --- |
| `id` | uuid PK `gen_random_uuid()` |
| `owner_id` | NOT NULL → `profiles(id)` ON DELETE CASCADE |
| `name` | `clans_name_nonempty_chk` (`btrim` length > 0), `clans_name_max_length_chk` (`char_length <= 100`) |
| `tag` | nonempty trimmed, `clans_tag_max_length_chk` (`<= 16`) |
| `points` | `NOT NULL DEFAULT 0`, `clans_points_nonnegative_chk` (`>= 0`) |
| `created_at` / `updated_at` | `timestamptz NOT NULL DEFAULT now()` (no bump trigger) |

Indexes: unique `clans_tag_lower_btrim_uidx` on `lower(btrim(tag))` ([`:28-29`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql#L28-L29)); `clans_owner_id_idx` (not unique). **Name is not unique.** No picture column.

**`public.clan_members`** ([`:37-43`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql#L37-L43)): `user_id` PK → `profiles` CASCADE; `clan_id` → `clans` CASCADE; `created_at`. Index `clan_members_clan_id_idx`. At most one clan per player.

**Owner seat** ([`:50-67`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql#L50-L67)): `seat_owner_on_clan_insert()` SECURITY DEFINER, `search_path = ''`, `REVOKE ALL FROM public`, **no EXECUTE grant**. Trigger `clans_seat_owner_after_insert` inserts `(NEW.owner_id, NEW.id)` with **no `ON CONFLICT`**. A second clan for the same user aborts the outer INSERT via membership PK. Function is **absent** from generated `public.Functions` (not Data-API callable).

**Grants** ([`:73-79`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql#L73-L79)):

- `clans`: SELECT to `anon, authenticated`; INSERT + DELETE to `authenticated`; **no UPDATE**.
- `clan_members`: SELECT to `anon, authenticated`; DELETE to `authenticated`; **no INSERT, no UPDATE**.

**RLS INSERT CHECK** (`clans_insert_verified_owner`, [`:100-114`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql#L100-L114)):

```sql
(select auth.uid()) = owner_id
and public.is_not_banned()
and exists (select 1 from public.public_profiles p where p.id = owner_id and p.is_verified)
and points = 0
```

SELECT policies `clans_select_anon` / `clans_select_authenticated` and `clan_members_select_*` are `USING (true)` ([`:88-98`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql#L88-L98), [`:122-132`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260827114633_clan_domain_schema.sql#L122-L132)). DELETE is admin-only on both tables (child policy required for FK CASCADE).

**Generated types** [`src/types/database.ts`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/types/database.ts): `clan_members` Row/Insert/Update [`:37-76`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/types/database.ts#L37-L76); `clans` [`:77-121`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/types/database.ts#L77-L121). Relationships: members → `clans` + `profiles`/`public_profiles`; clans.owner → `profiles`/`public_profiles` (`isOneToOne: false` on owner — uniqueness is the membership PK, not `UNIQUE(owner_id)`). No `create_clan` / `seat_owner_on_clan_insert` in `Functions` ([`:641+`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/types/database.ts#L641)).

**App callers:** grep of `src/` for `clans` / `clan_members` hits **only** `database.ts`. No `src/pages/clans/`, no `src/lib/services/clans.ts`.

S-18 implication (fact, not design): a picture column does not exist. Filling it **at INSERT** fits the current grant matrix; filling it **after** INSERT requires a new `GRANT UPDATE` plus an owner UPDATE policy that F-02 deliberately omitted.

### 2. Verified-member gating

**Flag:** `profiles.is_verified boolean not null default false` ([F-01 schema](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260729134008_run_domain_schema.sql#L19)). Guest-safe copy on view `public_profiles` (`id, nickname, is_verified, kog_points, kog_points_verified`) — [`20260820071325_user_profile_identity.sql:19-26`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260820071325_user_profile_identity.sql#L19-L26). Email is not on that view.

**Who can set it:** members cannot. `enforce_profile_privileged_columns` resets `is_verified` unless `is_admin()` ([`:109-111`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260820071325_user_profile_identity.sql#L109-L111)). Admin UI: `/admin` Verify/Unverify form → [`POST /api/admin/users/{id}/verify`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/api/admin/users/%5Bid%5D/verify.ts) → `setUserVerified` ([`src/lib/services/admin.ts:130-148`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/lib/services/admin.ts#L130-L148)).

**App read path:** `getOwnProfile` selects `is_verified` from `profiles` and maps `isVerified` ([`src/lib/services/profile.ts:93-115`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/lib/services/profile.ts#L93-L115)). `getPublicProfile` uses `public_profiles`. There is **no** shared `isVerified()` helper. Middleware locals are `{ role, isBanned, nickname }` only — **not** `isVerified` ([`src/middleware.ts:42-52`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/middleware.ts#L42-L52), [`src/env.d.ts:4`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/env.d.ts)).

**Create-run is the wrong analog for FR-014.** Any signed-in non-banned member with a nickname can create a **public** run. Verified is required only for restricted visibility:

- App: `if (!ownProfile.isVerified && visibilityRaw !== "public")` fail with `RESTRICTED_VISIBILITY_UNVERIFIED` = `"Verify your account to create friends-only or invite-only runs"` ([`src/pages/api/runs/index.ts:90-92`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/api/runs/index.ts#L90-L92), [`runs.ts:759`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/lib/services/runs.ts#L759)).
- RLS `runs_insert_own`: public always; friends/invite requires `public_profiles.is_verified` ([`20260824101006_restricted_run_visibility.sql:231-247`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260824101006_restricted_run_visibility.sql#L231-L247)).
- Form: `canChooseVisibility = isEdit || isVerified` ([`CreateRunForm.tsx:70`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/runs/CreateRunForm.tsx#L70)). `/runs/new` still renders the form for unverified members ([`runs/new.astro:17-28`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/runs/new.astro#L17-L28)).

**Copy-target verified gates (app + RLS):**

| Surface | Pattern | Citation |
| --- | --- | --- |
| Friend request INSERT | RLS both sides `public_profiles.is_verified`; app `requireVerifiedViewer` / `ONLY_VERIFIED` | [`friend_requests.sql:53-74`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/migrations/20260821130000_friend_requests.sql#L53-L74), [`friends.ts:5-6,96-101`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/lib/services/friends.ts#L5-L6) |
| Friend CTA on `/players/{id}` | Render only if `own.isVerified && profile.isVerified` | [`players/[id].astro:87-92`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/players/%5Bid%5D.astro#L87-L92) |
| Clan INSERT | RLS already (above); **no app layer yet** | F-02 policy |
| Apply to run | Nickname required; verified only locks nickname (request on `/profile`), does **not** block apply | [`RunParticipantActions.tsx:324-336`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/runs/RunParticipantActions.tsx#L324-L336) |
| Comments | No verified check | `src/lib/services/comments.ts` |

Banned: middleware redirects banned POSTs under `/api/` (except `/api/auth/`) with `"Your account is banned"` ([`middleware.ts:70-78`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/middleware.ts#L70-L78)). Create-run page shows a banned banner ([`runs/new.astro:56-59`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/runs/new.astro#L56-L59)). RLS `is_not_banned()` is a second gate.

Create-run mutation shape to reuse for **HTTP**, not authz: `export const POST`, `FormData`, `ensureOwnProfile`, `getOwnProfile`, domain `fail()` redirect with **fixed** `?error=` strings (lessons.md: never echo PostgREST), then `supabase.from("runs").insert({...}).select("id").single()` and redirect to detail ([`api/runs/index.ts:23-205`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/api/runs/index.ts#L23-L205)). Unique violations elsewhere map `23505` to a user string (`profile.ts`, `player-labels.ts`, `friends.ts`) — tag clash and second-clan PK will need that.

### 3. Public directory / detail / `PROTECTED_ROUTES`

[`src/middleware.ts:6-7,59-63`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/middleware.ts#L6-L7): `PROTECTED_ROUTES = ["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile"]` plus `/runs/{id}/edit`. Prefix `startsWith`. **Public:** `/`, `/runs`, `/runs/{id}`, `/players/{id}`, `/auth/confirm`, `/auth/verified`. AGENTS.md: do not prefix-protect `/runs`; do not add `/players/{id}` to the list. A `/clans` prefix in `PROTECTED_ROUTES` would lock the guest directory.

**No player directory.** Only [`src/pages/players/[id].astro`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/players/%5Bid%5D.astro). Guest clan **list** should follow **`/runs`**, not `/players`.

**List pattern** [`src/pages/runs/index.astro`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/runs/index.astro):

- `Layout` + `PageChrome` + SSR `createClient` + service `listActiveRuns`.
- Guest vs signed-in: `{ publicOnly: true }` vs full list ([`:30-32`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/runs/index.astro#L30-L32)).
- Header + CTA: signed-in → `/runs/new`; guest → `/auth/signin` “Sign in to create” ([`:98-114`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/runs/index.astro#L98-L114)). CTA is **not** verified-gated.
- Empty / error / filter-empty states; `?notice=` / `?error=` banners.
- Cards: Astro `ActiveRunCard` linking to `/runs/{id}`. No pagination (full active set, ordered `starts_at` asc — [`runs.ts:280`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/lib/services/runs.ts#L280)).

**Detail pattern** `/players/{id}` and `/runs/{id}`:

- Invalid/missing → `Astro.response.status = 404` and “not found” copy, **never 403** ([`players/[id].astro:99-125`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/players/%5Bid%5D.astro#L99-L125), [`runs/[id].astro:103-139`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/runs/%5Bid%5D.astro#L103-L139)). Restricted runs 404 the same way (AGENTS.md). Clan rows are world-readable, so a missing clan is a true 404; no 403 path exists for clans.
- Back link to the public list (`← Active runs`).
- Identity header + `dl` grid (nickname, verification, KoG points). Roster of other people via `NicknameLink` → `/players/{uuid}` ([`NicknameLink.astro`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/NicknameLink.astro), [`profile-href.ts`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/lib/profile-href.ts)). **Keep email off clan pages** (roadmap S-18 risk): join `clan_members.user_id` to `public_profiles`, not `profiles`.

**Create page:** [`/runs/new`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/runs/new.astro) is protected (signed-in). Astro shell + React island `CreateRunForm` `client:load`, `method=POST` to `/api/runs`.

**Return-to allowlist** [`src/lib/safe-return-to.ts`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/lib/safe-return-to.ts): `/runs/{uuid}` and `/players/{uuid}` only. A post-login bounce to `/clans/{uuid}` would need an allowlist change.

**No `/clans` routes** (glob `src/pages/clans/**` = 0).

### 4. Upload / storage for pictures — none

Confirmed by search:

- No `storage.from`, `createBucket`, `type="file"`, `accept="image`, avatar/picture URL columns in `src/`.
- `run_comments` columns are `author_id, body, created_at, id, run_id` only ([`database.ts:402-409`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/types/database.ts#L402-L409)). S-20 screenshots are future.
- `maps` has `name/points/difficulty/...`, no image ([`database.ts:178-189`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/types/database.ts#L178-L189)).
- `profiles` has no avatar.
- [`wrangler.jsonc`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/wrangler.jsonc): Worker + ASSETS only; **no R2**.
- [`supabase/config.toml:109-119`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/supabase/config.toml#L109-L119): `[storage] enabled = true`, `file_size_limit = "50MiB"`, **bucket example commented out**. No storage migrations in `supabase/migrations/`.

F-02 deferred picture to S-18 (`plan.md` What We're NOT Doing; crew `q4-columns`). Roadmap S-18 risk: “Profile picture introduces upload here (S-20 reuses it).”

### 5. Points default 0; no ranking query

- `clans.points` is `integer NOT NULL DEFAULT 0` with `>= 0`. INSERT CHECK requires `points = 0`. No UPDATE grant → PostgREST cannot increment. Ranking of zeros is still a valid `ORDER BY points DESC` (and a tie-break — none exists yet).
- **No** `from("clans")` and **no** `order("points")` in `src/`.
- Player KoG points are **not** a leaderboard: shown on `/players/{id}` as a scalar (`kogPointsLabel`, `"—"` if null) ([`players/[id].astro:108,171-177`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/pages/players/%5Bid%5D.astro#L108)). Admin user list orders by `created_at` ([`admin.ts:43-47`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/lib/services/admin.ts#L43-L47)).
- Map `points` appear on run cards as “· N pts” ([`ActiveRunCard.astro:56-58`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/runs/ActiveRunCard.astro#L56-L58)) — display only; S-23 will use map points, not S-18.

### 6. Nav / layout for a new public section

Shell: [`Layout.astro`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/layouts/Layout.astro) (document) → [`PageChrome.astro`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/PageChrome.astro) (`Topbar` + content `max-w-3xl` default + `Footer`). Detail pages often pass `contentClass="max-w-5xl"` or `"max-w-xl"`.

[`Topbar.astro`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/Topbar.astro):

- Guest: **Runs** only + Sign in/up.
- Signed-in: **Runs**, **New run**, **Dashboard**, Admin if admin. Nickname → `/players/{id}`.
- No Clans link. “New run” is not verified-gated in the nav (signed-in is enough).

[`Footer.astro:21-27`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/Footer.astro#L21-L27): Browse Runs, Create a Run (always linked; create is still protected by middleware). Landing [`Welcome.astro:46-68`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/Welcome.astro#L46-L68): Create a Run + browse `/runs`.

Services live in `src/lib/services/` (7 files today; no clans). React islands only for interactive forms/actions.

## Code References

- `supabase/migrations/20260827114633_clan_domain_schema.sql:1-138` — F-02 tables, trigger, grants, RLS
- `src/types/database.ts:37-121` — generated `clans` / `clan_members`
- `src/middleware.ts:6-7,59-63` — `PROTECTED_ROUTES` (prefix)
- `src/pages/runs/index.astro` — guest list + create CTA
- `src/pages/runs/new.astro` + `src/pages/api/runs/index.ts` — signed-in create (verified only for restricted visibility)
- `src/pages/players/[id].astro` — public detail, 404, `public_profiles`, no email
- `src/lib/services/profile.ts:93-140` — `isVerified` mapping
- `src/lib/services/friends.ts:5-6,96-101` — verified-only mutation copy
- `src/lib/services/admin.ts:130-148` — admin sets `is_verified`
- `src/components/Topbar.astro` / `Footer.astro` / `PageChrome.astro` — nav/layout
- `src/lib/safe-return-to.ts` — post-login allowlist (no `/clans`)
- `wrangler.jsonc` / `supabase/config.toml:109-119` — no R2 / no buckets
- `AGENTS.md` — do not prefix-protect `/runs`; `/players/{id}` public

## Architecture Insights

- **Publishable key is the authz boundary** (`createServerClient<Database>` in `src/lib/supabase.ts`). Guest directory must be true anon SELECT; UI filtering is not enough. F-02 already did that for clan rows without joining `runs` (FR-028).
- **Direct table INSERT under RLS** is the public-create pattern (runs, and F-02 clans). RPCs exist only when a trigger cannot seat children (`create_invite_only_run`). Clan owner seating is already a trigger — no `create_clan()` RPC.
- **Verified is not a global middleware role.** Pages that care call `getOwnProfile`. Locals stay `{ role, isBanned, nickname }`.
- **Do not copy “anyone signed-in can create a run” for FR-014.** Copy friends: app-layer verified check + user-facing string, with RLS as backstop. Unverified hitting INSERT will just look like a generic create failure unless the API maps it.
- **One clan per player** will 23505 on a second create. Tag clash is a separate unique index. Map both like nickname/label uniqueness.
- **No UPDATE on clans today.** Picture-at-create can be an INSERT column. Post-insert upload, rename, or owner edits need a new write surface (S-18 if picture requires it; not for points).
- **Astro list/detail + React island for the form** is the house style. `cn()` for classes. Uppercase `POST` API routes. Fixed `?error=` strings (lessons.md).
- **Production schema lag:** F-02 is on `main` but not tagged. Local `db reset` has clan tables; production Worker on `v0.1.26` does not until `/gh-release`.

## Historical Context (from prior changes)

- `context/archive/2026-08-27-clan-domain-schema/` — F-02. Picture deferred (`q4-columns`). Direct INSERT (`q6-insert-path`). World-readable membership (`q7`). Frozen points / no client membership writes (`q8`). No extra DEFINER helpers (`q9`). Plan-review F1: seating **without** `ON CONFLICT` so a second clan cannot commit empty. Impl-review APPROVED; types include tables; trigger not in `Functions`.
- `context/archive/2026-08-24-restricted-run-visibility/research.md` — guest vs signed-in list split; 404 not 403; verified required for friends/invite **runs**, not for public create.
- `context/archive/2026-08-20-user-profile/` — `is_verified` lock, `public_profiles`, KoG points as self-reported scalar (not a ranking).
- `context/archive/2026-08-07-admin-moderation-tools/` — admin verify/ban.
- F-02 had **no** `research.md` (crew skipped research). This document is the first clan-domain codebase map for S-18.

## Related Research

- `context/archive/2026-08-24-restricted-run-visibility/research.md` — visibility, 404, leak surfaces (clan policies must still not join `runs`)
- `context/archive/2026-08-07-admin-moderation-tools/research.md` — admin verify
- `context/archive/2026-08-07-auto-join-mode/research.md` — create-run form/API pattern
- `context/archive/2026-08-07-run-archival-lifecycle/research.md` — list/detail lifecycle (not clan)

## Open Questions

These are **plan** inputs, not unresolved facts about the current code:

1. **Picture storage (greenfield).** No in-repo pattern. Candidates: Supabase Storage bucket + public URL column; external URL string only; Cloudflare R2 (no binding today). F-02 said S-18 `ALTER`s in a picture column. S-20 is expected to reuse whatever lands.
2. **Picture write timing.** INSERT-only (nullable column on create, fits current grants) vs owner UPDATE after upload (needs `GRANT UPDATE` + tight policy; F-02 froze UPDATE to keep points at 0).
3. **Routes.** `/clans` + `/clans/{uuid}` + `/clans/new` mirrors runs; tag-slug vs uuid; whether ranking is the same list (`ORDER BY points`) or a separate page. No existing clan URLs.
4. **Create CTA gating.** `/runs` shows Create to every signed-in user. FR-014 is verified-only — list CTA / `/clans/new` / API should not copy unverified-can-create-public-run.
5. **Already a member.** Membership PK vs UX (hide create, or show unique-violation copy).
6. **`safe-return-to` / `AGENTS.md`.** Adding public `/clans` requires allowlist + “do not prefix-protect `/clans`” if create is `/clans/new`.
7. **Stale foundation baseline.** `context/foundation/roadmap.md` Baseline still says “Absent: clan tables” (written before F-02 merged). `AGENTS.md` product-scope line still points at `prd.md` not `prd-v2.md`. Lessons.md says update stale docs when found — outside this research artifact.
8. **Production apply.** Clan tables exist on `main` / local; production DB waits for a `v*` tag that includes `20260827114633_clan_domain_schema.sql`.

## Follow-up Research 2026-08-27T14:46+02:00

Delayed Explore agents ([Clan schema](b307267d-1f94-4ed7-ae30-dc45fda30825), [Verified gating](e23084c4-af52-4e47-973e-b0ce9579109c), [Public patterns](9eadc4d2-ec6b-4ab9-a4c7-5f4233f06764), [Storage/nav](cf8cb83b-b66a-4439-817d-0e85b08e076a)) confirmed the map above. Additive only:

- **Copy to reuse:** `/profile` friends empty-state — “Friends require a verified account. Ask an admin to verify you before you can send or manage friend requests.” ([`FriendsInbox.astro:37-40`](https://github.com/Miigget/book_your_miggets/blob/a164fe036d1abc2c845e98e5cdd0d1221dc75357/src/components/profile/FriendsInbox.astro#L37-L40)). `/auth/verified` is email-confirm success, not admin verify.
- **Admin verify UI** is the users **list** (`/admin` Verify/Unverify), not `/admin/users/{id}` (that page is points/nickname/labels).
- **No index on `clans.points`.** Run `min_points` is an eligibility filter (`.lte`), not a leaderboard. Ranking `ORDER BY points` would be new (optional index later if the directory grows).
- **No dedicated mobile nav** — Topbar `flex-wrap` only. Some POST APIs also speak JSON (`wantsJson`); create-run itself is form + redirect.
