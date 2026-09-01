---
date: 2026-09-01T12:10:00+02:00
researcher: migget
git_commit: 3d2301e32678f37a755d363dd66163d9fcdb20f4
branch: main
repository: book_your_miggets
topic: "S-23 admin verified-finish + clan-points award without scraping /teamrank or awarding on Complete"
tags: [research, codebase, clans, points, verified-finish, complete-clan-run, comment-screenshots, admin, maps, rls, s-23]
status: complete
last_updated: 2026-09-01
last_updated_by: migget
last_updated_note: "Added follow-up research for clan-delete vs leftover run seats and screenshot mint for unseated organizer"
---

# Research: S-23 admin verified-finish + clan-points award without scraping /teamrank or awarding on Complete

**Date**: 2026-09-01T12:10:00+02:00
**Researcher**: migget
**Git Commit**: [3d2301e32678f37a755d363dd66163d9fcdb20f4](https://github.com/Miigget/book_your_miggets/commit/3d2301e32678f37a755d363dd66163d9fcdb20f4)
**Branch**: main
**Repository**: book_your_miggets

## Research Question

Map the live codebase so `/10x-plan` can design admin verified-finish + clan-points award without scraping `/teamrank` and without awarding points on Complete.

Cover: (1) S-22 Complete freeze vs archive vs 5-cap vs comments; (2) `clans.points` RLS and `/clans` ranking; (3) map points and how a run stores maps; (4) admin surfaces to copy; (5) declared participants + `clan_only`; (6) S-20 screenshot proof ACL for completed vs archived; (7) archive constraints that bind S-23.

Plan against **`prd-v2.md`** FR-019 / FR-022 / FR-023 / FR-018 / FR-030 / US-02. v1 `prd.md` reuses those FR numbers for friends / labels / organizer-edit — they are a different product.

## Summary

S-22 already shipped the filterable stamp S-23 needs: nullable `runs.completed_at`, written only by DEFINER `complete_clan_run`, never folded into audience-active. Complete freezes roster/edit/extend, does **not** archive, does **not** free the 5-cap, and does **not** touch `clans.points`. Comments (including screenshots) stay writable until Archive because INSERT still keys off `is_run_in_active_window` / `is_run_active_row`, which ignore `completed_at`.

Clan points are still honest zeros. `clans.points` defaults to 0, INSERT requires `points = 0`, column GRANT UPDATE on `clans` is only `(name, tag, picture_path, updated_at)`, and trigger `clans_freeze_points_and_owner` copies `old.points` on every UPDATE. `/clans` already `ORDER BY points DESC, name, id` — ranking will move as soon as a writer exists; no list-query change is required. There is **no** `verified_finish` / `verified_at` column and **no** points-award RPC.

A run stores **at most one** `map_id` (plus optional `map_category`). Map catalog `maps.points` is the delta source. S-27 multi-map is not shipped (`run_maps` does not exist). Category-only or map-less runs have no map row to sum. There is **no** `runs.clan_id`; the award target is the clan whose `owner_id` equals `runs.organizer_id` (owner_id is also frozen by the same trigger).

Admin already opens any run (`runs_select_admin` / `can_view_run` short-circuit), reads comments (`run_comments_select_admin`), and mints screenshot signed URLs (`comment_screenshots_select_authenticated` includes `is_admin()`). Closest UI copy is `AdminRunControls` on `/runs/{id}` + `POST /api/admin/runs/{id}/archive`. Closest product analog for “checked in-game by hand” is `POST /api/admin/users/{id}/points-verified`. There is **no** admin verify queue (S-22 explicitly deferred it).

Declared participants = confirmed roster (`run_participants.status = 'confirmed'`). No per-player finish flag. Membership is UNIQUE (`clan_members.user_id` PK); officers do not exist; members cannot self-leave (DELETE is admin-only). After Complete the roster cannot change, so the freeze is the snapshot S-23 needs.

**Hard planning constraint:** a naive `UPDATE clans SET points = points + n` — even from a SECURITY DEFINER RPC — is currently a no-op because `clans_freeze_points_and_owner` always assigns `new.points := old.points`. S-23 must change that trigger (or equivalent GUC/bypass) as part of the only points writer. Do not GRANT UPDATE on `points` to PostgREST; keep the writer DEFINER-only like `completed_at` / `archived_at`.

## Detailed Findings

### 1. S-22 Complete — `completed_at`, DEFINER RPCs, freeze, comments, 5-cap

**Column.** Added in [`supabase/migrations/20260901083008_complete_clan_run.sql`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L10-L14): nullable `timestamptz`, no default, no backfill. Comment text: *“Clan-run complete stamp for later admin verify (S-23). Not archive. Not points.”*

**Must not fold into audience-active.** Header of the same migration ([`:1-4`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L1-L4)) forbids putting `completed_at` on `is_run_active_row` / `is_run_in_active_window`. Audience-active remains:

```27:37:supabase/migrations/20260831131219_manual_archive_and_extend.sql
create or replace function public.is_run_active_row(
  p_archived_at timestamptz,
  p_extended_until timestamptz
)
returns boolean
language sql
stable
as $$
  select p_archived_at is null
    and (p_extended_until is null or p_extended_until > now());
$$;
```

App mirror: [`src/lib/run-lifecycle.ts:24-37`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/run-lifecycle.ts#L24-L37) (`isRunActive` ignores `completed_at`). Comment writes use `is_run_in_active_window` ([`20260831131219:214-228`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831131219_manual_archive_and_extend.sql#L214-L228)) = `is_run_active_row` ∧ `can_view_run`. Completing therefore leaves comments and screenshots open.

**Roster-open helper** ([`20260901083008:20-31`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L20-L31)): `is_run_active_row(...) AND p_completed_at IS NULL`. Used only on roster/edit/extend — not on comments, lists, or the 5-cap.

**DEFINER `complete_clan_run`** ([`:308-373`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L308-L373)):

| Soft code | Meaning |
| --- | --- |
| `not_authenticated` / `not_found` / `banned` | Same leak family as `archive_run` — non-organizer (including admin who is not organizer) → `not_found` |
| `not_clan_only` | `visibility <> clan_only` |
| `not_owner` | no `clans.owner_id = caller` |
| `not_active` | not audience-active |
| `not_in_progress` | `now() < starts_at` |
| `already_completed` | stamp already set |
| `completed` | `SET completed_at = now()` where still null |

Does **not** `UPDATE clans`, does **not** call `archive_run`, does **not** write `archived_at` / `extended_until`. `REVOKE ALL` from `public, anon`; `GRANT EXECUTE` to `authenticated` only ([`:372-373`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L372-L373)).

**Column GRANT closed** ([`:379-389`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L379-L389)): authenticated UPDATE is `(title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility)` only — **not** `completed_at`, `archived_at`, `extended_until`, `organizer_id`. Copy this list (plus any new verified stamp) rather than widening it.

**Freeze after complete (SQL):**

- Edit: `runs_update_own` USING/WITH CHECK requires `is_run_roster_open_row` ([`:42-72`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L42-L72)).
- Apply: `run_participants_insert_self_pending` ([`:230-245`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L230-L245)).
- Decide / kick: `run_participants_update_organizer` ([`:247-270`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L247-L270)) — kick is an UPDATE to `denied`, not a DELETE.
- Withdraw / leave: `run_participants_delete_own_pending` / `_confirmed` ([`:272-302`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L272-L302)).
- Auto-join: completed looks like `not_active` ([`:105-111`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L105-L111)).
- Extend: `already_completed` before stamping `extended_until` ([`:204-206`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083008_complete_clan_run.sql#L204-L206)).

**Freeze after complete (app):** `loadActiveRunForMutation` throws `CLAN_RUN_COMPLETED_FROZEN` when `completed_at` is set ([`src/lib/services/participants.ts:32,170-185`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/services/participants.ts#L32)). Edit loader returns null ([`src/lib/services/runs.ts:364`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/services/runs.ts#L364)). `requireActiveRun` in comments does **not** select `completed_at` ([`src/lib/services/comments.ts:77-92`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/services/comments.ts#L77-L92)).

**Still allowed after complete:** `archive_run` (organizer or admin; completed is still audience-active). Comment INSERT/likes while audience-active. Admin delete.

**5-cap still occupied.** Trigger `enforce_organizer_active_run_cap` counts `is_run_active_row` only ([`20260831131219:406-426`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831131219_manual_archive_and_extend.sql#L406-L426)). App `countAudienceActiveRunsForOrganizer` likewise ignores `completed_at` ([`src/lib/services/runs.ts:1134-1149`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/services/runs.ts#L1134-L1149)).

**HTTP.** Owner Complete is `POST /api/runs/{id}/complete` ([`src/pages/api/runs/[id]/complete.ts`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/api/runs/%5Bid%5D/complete.ts)) — cookie session, no pre-check of `userOwnsClan` (avoids leaking restricted runs), maps RPC via `completeClanRun` ([`src/lib/services/runs.ts:1178-1206`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/services/runs.ts#L1178-L1206)), domain `RunError` into `?error=` / JSON, raw PostgREST logged not forwarded.

**UI.** Complete lives on organizer lifecycle, not admin: `showComplete` = organizer ∧ `clan_only` ∧ in-progress ∧ not completed ∧ `ownsClan` ([`src/pages/runs/[id].astro:122-131`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/runs/%5Bid%5D.astro#L122-L131)). Confirm copy: *does not archive and does not award clan points* ([`OrganizerRunLifecycleControls.tsx:56-59`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/components/runs/OrganizerRunLifecycleControls.tsx#L56-L59)). Completed chip for anyone who can view, until Archive wins ([`[id].astro:123,175-177`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/runs/%5Bid%5D.astro#L123)).

**No verified-finish code today.** Repo-wide search for `verified_finish` / `verified_at` / `clan_points` award is empty.

### 2. Clan points — column, who can UPDATE, ranking, zeros, RLS

**Schema** ([`supabase/migrations/20260827114633_clan_domain_schema.sql:7-26`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260827114633_clan_domain_schema.sql#L7-L26)): `points integer NOT NULL DEFAULT 0` + `clans_points_nonnegative_chk (points >= 0)`. INSERT policy requires `points = 0` ([`:113`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260827114633_clan_domain_schema.sql#L113)).

**SELECT is world-readable.** `GRANT SELECT` to `anon, authenticated`; policies `clans_select_anon` / `clans_select_authenticated` `USING (true)` ([`:73-98`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260827114633_clan_domain_schema.sql#L73-L98)). Guests already see the number; it is just always 0.

**UPDATE path is frozen in two layers:**

1. Column GRANT ([`20260831110000_admin_clan_update.sql:8`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831110000_admin_clan_update.sql#L8)): `GRANT UPDATE (name, tag, picture_path, updated_at)` — **not** `points`, **not** `owner_id`. Header: *“Points and owner_id stay frozen (S-23 owns points).”*
2. Trigger `clans_freeze_points_and_owner` BEFORE UPDATE ([`:17-36`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831110000_admin_clan_update.sql#L17-L36)): `new.points := old.points; new.owner_id := old.owner_id; new.created_at := old.created_at`. Even a DEFINER RPC that `UPDATE`s `points` currently cannot change the value unless this trigger is replaced or given a bypass.

RLS `clans_update_admin` is `is_admin()` ([`:10-15`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831110000_admin_clan_update.sql#L10-L15)). Combined with (1), admin can rename a clan from the app but cannot PostgREST-write points. F-02 plan already named S-23 as the only points writer ([`context/archive/2026-08-27-clan-domain-schema/plan.md:199`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/context/archive/2026-08-27-clan-domain-schema/plan.md) — “likely GRANT UPDATE plus a tight policy/trigger”). Prefer DEFINER-only (no `points` on the GRANT list) so `runs_update_admin`-style open admin UPDATE cannot set points from the client.

**Ranking already exists.** [`listClans`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/services/clans.ts#L252-L258):

```252:258:src/lib/services/clans.ts
export async function listClans(supabase: AppSupabaseClient): Promise<ClanListItem[]> {
  const { data, error } = await supabase
    .from("clans")
    .select("id, name, tag, points, picture_path")
    .order("points", { ascending: false })
    .order("name", { ascending: true })
    .order("id", { ascending: true });
```

`/clans` copy: “Browse clans ranked by points” ([`src/pages/clans/index.astro:81`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/clans/index.astro#L81)). Detail shows `clan.points` ([`src/pages/clans/[id].astro:128`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/clans/%5Bid%5D.astro#L128)); cards too ([`ClanCard.astro:40`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/components/clans/ClanCard.astro#L40)). No index on `clans.points` (accepted at S-18; table is small). Tie-break is name then id — all zeros currently sort alphabetically.

**Do not confuse with player KoG points.** `profiles.kog_points` / `kog_points_verified` are a different scalar (admin in-game check pattern to copy, not the clan leaderboard).

### 3. Map points — catalog, how a run stores maps, delta

**Catalog.** [`supabase/migrations/20260729163802_maps_catalog_and_run_title.sql:6-18`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260729163802_maps_catalog_and_run_title.sql#L6-L18): `maps.points integer NOT NULL CHECK (points >= 0)`. SELECT world-readable; no INSERT/UPDATE/DELETE for anon|authenticated. Seed [`supabase/seed-data/kog-maps.sql`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/seed-data/kog-maps.sql) (~1094 rows, e.g. `'001'` → 6 pts, `'012'` → 32 pts). Displayed on run cards as `· {map.points} pts`.

**Run storage is single-map.** `runs` has `map_id uuid null` + `map_category text null` ([generated `src/types/database.ts:617-618`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/types/database.ts#L617-L618)). XOR constraint was **dropped** ([`20260821120100_drop_runs_map_or_category_required.sql`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260821120100_drop_runs_map_or_category_required.sql)): a run may have a map, a category only, both, or neither. No `run_maps` join table; S-27 `multi-map-runs` is still `ready` on the roadmap, not shipped.

**Delta for S-23 (live, not future multi-map):** `SELECT m.points FROM maps m WHERE m.id = runs.map_id`. If `map_id` is null (category-only or map-less), there is no catalog points row — plan must choose reject vs award 0. Do not use `runs.min_points` (eligibility floor) or `profiles.kog_points`. After Complete, edit is frozen so `map_id` is stable for verify.

### 4. Admin surfaces — `is_admin()`, pages, `POST /api/admin/*`

**SQL `is_admin()`** ([`20260729134008_run_domain_schema.sql:57-70`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260729134008_run_domain_schema.sql#L57-L70)): DEFINER, `profiles.role = 'admin'`, EXECUTE to `authenticated` only. App check is `context.locals.profile?.role !== "admin"` (middleware + API routes). Middleware 404s `/admin*` pages for non-admins ([`src/middleware.ts:65-68`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/middleware.ts#L65-L68)); `/api/admin/*` is **not** under that prefix and must check role itself.

**Admin pages (only three):**

| Page | Role |
| --- | --- |
| `/admin` | user list (ban/verify); copy points to clan/run detail for mutate-in-place |
| `/admin/users/{id}` | nickname, KoG points, points-verified, labels, archived run history |
| `/admin/labels` | label dictionary |

Index copy already says mutate clans/runs on their **detail** pages, not on `/admin` ([`src/pages/admin/index.astro:56-58`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/admin/index.astro#L56-L58)).

**Copy-worthy HTTP patterns:**

| Route | Pattern | Notes |
| --- | --- | --- |
| [`POST /api/admin/runs/{id}/archive`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/api/admin/runs/%5Bid%5D/archive.ts) | cookie + `role !== admin` → JSON 403 or redirect `/`; `archiveRun` RPC; domain error vs `console.error` + generic fail | Best copy for verified-finish on a run. `archive_run` allows organizer **or** admin ([`20260831131219:462-464`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831131219_manual_archive_and_extend.sql#L462-L464)); a verify RPC should be **admin-only** (do not copy `complete_clan_run`’s organizer-only `not_found`). |
| [`AdminRunControls`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/components/runs/AdminRunControls.tsx) | island on `/runs/{id}` when `isAdmin`; Archive vs Delete; confirm dialog | Natural home for “Mark verified-finish”. |
| [`POST /api/admin/users/{id}/points-verified`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/api/admin/users/%5Bid%5D/points-verified.ts) | form `value=true\|false`; redirect `?notice=` / `?error=`; non-admin → `/` | Product analog: admin checked in-game by hand. Non-admins hitting API get `/` not 404. |
| [`POST /api/admin/users/{id}/labels`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/api/admin/users/%5Bid%5D/labels.ts) | same redirect style | Dictionary mutations stay on `/admin/labels`. |
| [`POST /api/admin/clans/{id}`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/api/admin/clans/%5Bid%5D.ts) | JSON 403 vs redirect `/`; lives on public `/clans/{id}` | Direct table UPDATE of granted columns (not points). |
| [`POST /api/admin/runs/{id}/comments/{commentId}/delete`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/api/admin/runs/%5Bid%5D/comments/%5BcommentId%5D/delete.ts) | admin can delete proof comments | Do not auto-delete screenshots as part of verify. |

**Admin can already see clan_only completed runs.** `runs_select_admin` `USING (is_admin())` ([`20260729134008:210-214`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260729134008_run_domain_schema.sql#L210-L214)) — no visibility/window conjunct. `can_view_run` returns true for admin before any window check ([`20260901083000:36-38`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260901083000_clan_only_on_is_run_active_row.sql#L36-L38)). Archived loader `getArchivedRunForAdmin` is used on `/runs/{id}` ([`[id].astro:71-73`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/runs/%5Bid%5D.astro#L71-L73)). Signed-in `/runs` already partitions a Clan section ([`src/pages/runs/index.astro:23,51`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/runs/index.astro#L23)).

**No verify queue.** `/admin` lists users, not completed clan runs. S-22 crew chose stamp-only and left the queue to S-23 (`q4-admin-queue`). PRD v2 FR-021 accepted junk in that queue. Plan should decide: (A) button only on `/runs/{id}` that admin already opened; (B) also list `completed_at IS NOT NULL` ∧ not-yet-verified ∧ `clan_only` on `/admin`.

### 5. Declared participants — roster, clan membership, `clan_only`

**Confirmed roster.** `participant_status` = `pending | confirmed | denied` ([`database.ts:833`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/types/database.ts#L833)). `listConfirmedParticipants` filters `status = 'confirmed'` ([`src/lib/services/participants.ts:58-77`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/services/participants.ts#L58-L77)). Helper `is_confirmed_participant` is DEFINER EXISTS on that status ([`20260817125800:7-21`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql#L7-L21)). There is **no** finish / `/teamrank` column. “Declared participants finished” is an admin judgment over this frozen confirmed list, not a per-row stamp. Verify should mark the **run**, not each player (matches FR-022 wording).

**UNIQUE membership, no officers.** `clan_members.user_id` is the PK ([`20260827114633:37-41`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260827114633_clan_domain_schema.sql#L37-L41)) — at most one clan per player. Columns are only `user_id, clan_id, created_at` ([`database.ts:103-108`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/types/database.ts#L103-L108)). Owner is `clans.owner_id`, seated by trigger. No officer role in SQL or `src/lib/services/clans.ts`. DELETE policy on members is admin-only (`clan_members_delete_admin`); there is no member-leave API. After Complete, roster freeze plus no self-leave means the confirmed set and clan seat are both stable.

**No `runs.clan_id`.** Generated `runs` Row has no clan FK ([`database.ts:609-626`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/types/database.ts#L609-L626)). Audience is live `is_same_clan(organizer_id, uid)` ([`20260831123822:10-26,94-95`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831123822_clan_only_run_rls.sql#L10-L26)). Create/complete require current `clans.owner_id = organizer`. Award target for S-23: `SELECT id FROM clans WHERE owner_id = runs.organizer_id`. `owner_id` cannot change (freeze trigger). Do not invent `runs.clan_id` in this slice unless plan explicitly reopens S-21’s out-of-scope.

**Who can see clan_only:** guests 404 (anon SELECT is public-only). Members via `is_same_clan` on audience-active. Confirmed participants and organizer via privilege policies even after archive. Admin always. Restricted runs still 404-not-403 for everyone else.

### 6. S-20 screenshot proof — comments on completed vs archived

**Attachment.** Nullable `run_comments.screenshot_path` (object key, not URL) with path CHECKs `{author_id}/{run_id}/{comment_id}.{jpg|jpeg|png|webp}` ([`20260831130723:10-23`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831130723_comment_screenshots.sql#L10-L23)). Screenshot-only comments allowed (`run_comments_body_or_screenshot_chk`). One screenshot per comment; `/teamrank` + finish-line = two comments. Do not reuse public `clan-pictures`.

**Private bucket** `comment-screenshots`, 5 MiB, jpeg/png/webp, `public = false` ([`:56-63`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831130723_comment_screenshots.sql#L56-L63)). App constants [`src/lib/storage.ts:5-11`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/storage.ts#L5-L11). Signed URLs 1h via `createSignedUrl` / `createSignedUrls` ([`storage.ts:112-123`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/storage.ts#L112-L123); [`comments.ts:94-125,167-168`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/lib/services/comments.ts#L94-L125)). Island never uses `getPublicUrl` for screenshots.

**Comment SELECT (unchanged ACL — FR-027):** confirmed participant **or** organizer **or** admin ([`20260820092809:89-105`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260820092809_run_comments.sql#L89-L105)). No guest, no pending applicant. Storage SELECT mirrors that set, including `is_admin()` ([`20260831130723:73-84`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831130723_comment_screenshots.sql#L73-L84)). Admin can therefore list comments and mint signed URLs on clan_only completed **and** archived runs.

**INSERT / likes require audience-active** (`is_run_in_active_window`) + confirmed ([`20260820092809:107-116`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260820092809_run_comments.sql#L107-L116)). UI: `canPostOrLike = confirmed && !isArchived && !isBanned` ([`[id].astro:120`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/src/pages/runs/%5Bid%5D.astro#L120)) — **does not** key off `completedAt`.

| State | Comments writable | Screenshots readable by admin | Roster mutable |
| --- | --- | --- | --- |
| In-progress `clan_only` | yes (confirmed) | yes | yes |
| Completed, still audience-active | **yes** (proof window) | yes | **no** |
| Archived (with or without complete) | **no** | **yes** (SELECT + signed URL still work) | no |

S-23 admin does **not** need an ACL widen to see `/teamrank` + finish-line proof. If verify is allowed after Archive, proof is still there; new screenshots cannot be added. Completing-then-archiving-before-verify is allowed by current SQL; plan should say whether that is in-scope.

Do not add a separate screenshot type (US-02 / FR-001). Do not require screenshots as a SQL gate unless plan explicitly wants it — PRD says admin checks **in-game** `/teamrank`; screenshots are the in-app proof thread, not a scraper substitute.

### 7. Historical decisions that constrain S-23

| Constraint | Source | Implication |
| --- | --- | --- |
| Points frozen until S-23; Complete must not award | Roadmap S-22 risk; S-18 outcome; `complete_clan_run` header; Complete confirm copy | New writer only; do not hook points into `complete_clan_run` |
| No admin verify queue in S-22 | complete-clan-run crew `q4-admin-queue` | Queue (if any) is this slice |
| Complete ≠ archive; comments writable after complete | crew `q2-complete-vs-archive` | Verify must not call `archive_run`; must not fold a new stamp into `is_run_active_row` |
| No officer UI | S-21 / S-22 notes; `clan_members` has no role | Actor is **admin**, not officer; do not invent officer Complete/verify |
| UNIQUE membership | F-02 `user_id` PK; seating without ON CONFLICT | One clan per player; award one clan |
| No `runs.clan_id`; live `is_same_clan` | S-21 research + plan out-of-scope | Resolve clan via `clans.owner_id = organizer_id` |
| Ranking honest zeros | S-18; `listClans` already sorts by points | No ranking-query rewrite; just write points |
| Screenshots: no ACL widen, private bucket, no `clan-pictures` | S-20 plan-brief; AGENTS.md | Reuse existing thread; mint signed URLs as today |
| `/teamrank` scrape parked | roadmap Non-Goals; prd-v2 Non-Goals | Manual admin mark only |
| Junk in verify queue accepted | prd-v2 FR-021 Socrates | Optional list of completed-unverified clan runs is in product scope |
| Plan against **prd-v2.md** | complete-clan-run crew obvious | v1 `prd.md` FR-019 = friends, FR-022 = category-only, FR-023 = nickname lock, FR-018 = public profile, FR-030 = labels |
| F-02 predicted S-23 points writer | clan-domain-schema `plan.md` Migration Notes | Change freeze trigger; do not pre-granted UPDATE on points (still true today) |
| `runs_update_admin` is unbounded on granted columns | `20260729134008:238-243` | Keep `points` / new verify stamp **off** column GRANT |

## Code References

- `supabase/migrations/20260901083008_complete_clan_run.sql:1-389` — `completed_at`, roster-open, freeze policies, `complete_clan_run`, GRANT closed
- `supabase/migrations/20260831131219_manual_archive_and_extend.sql:27-37,214-228,406-433,439-464` — audience-active, comment window, 5-cap, `archive_run` admin path
- `supabase/migrations/20260901083000_clan_only_on_is_run_active_row.sql:12-76` — latest `can_view_run` (admin first, then `clan_only` + `is_same_clan`)
- `supabase/migrations/20260831123822_clan_only_run_rls.sql:10-30` — `is_same_clan` (no `runs.clan_id`)
- `supabase/migrations/20260827114633_clan_domain_schema.sql:7-138` — clans/members, frozen INSERT points=0, UNIQUE membership
- `supabase/migrations/20260831110000_admin_clan_update.sql:1-36` — admin clan UPDATE GRANT + freeze trigger
- `supabase/migrations/20260729163802_maps_catalog_and_run_title.sql:6-18` — `maps.points`
- `supabase/migrations/20260821120100_drop_runs_map_or_category_required.sql` — map-less runs allowed
- `supabase/migrations/20260831130723_comment_screenshots.sql` — private bucket, path CHECKs, storage RLS
- `supabase/migrations/20260820092809_run_comments.sql:89-122` — comment SELECT/INSERT ACL
- `supabase/migrations/20260729134008_run_domain_schema.sql:57-70,210-243` — `is_admin()`, `runs_select_admin`, `runs_update_admin`
- `src/pages/api/runs/[id]/complete.ts` — owner Complete HTTP
- `src/pages/api/admin/runs/[id]/archive.ts` — admin Archive HTTP to copy
- `src/pages/api/admin/users/[id]/points-verified.ts` — in-game-check analog
- `src/components/runs/AdminRunControls.tsx` — admin island on run detail
- `src/components/runs/OrganizerRunLifecycleControls.tsx:56-59` — Complete copy (not points)
- `src/lib/services/clans.ts:252-258` — ranking query
- `src/lib/services/comments.ts:77-92,128-177` — comments ignore `completed_at`; signed URLs
- `src/lib/services/participants.ts:32,58-77,170-185` — confirmed roster + freeze
- `src/middleware.ts:6,65-68` — `/admin` 404
- `AGENTS.md` Hard Rules — Complete ≠ archive; points frozen until S-23; no officer Complete; no admin verify queue (until this slice)

## Architecture Insights

- **DEFINER + closed column GRANT is the house stamp pattern** (`archive_run`, `extend_run`, `complete_clan_run`). S-23 should add `verify_clan_run_finish` (name TBD) in that family: `SECURITY DEFINER`, `search_path = ''`, soft codes, EXECUTE `authenticated` only, admin-only (unlike Complete’s organizer-only), one-shot, never `UPDATE` via PostgREST.
- **Audience-active is a different predicate from roster-open.** New verify stamp must stay off `is_run_active_row` the same way `completed_at` does, or comments/5-cap/lists will break.
- **The freeze trigger is the real points lock**, not RLS. Plan Phase 1 SQL must replace or bypass `clans_freeze_points_and_owner` for the RPC path (GUC like `app.clan_delete_teardown`, or “if `new.points` is distinct then require `is_admin()` inside the RPC only” is insufficient for a trigger that always overwrites). Suggested shape: trigger keeps freezing PostgREST updates; DEFINER function runs as owner and either (a) sets a GUC the trigger honors, or (b) the trigger is rewritten to `new.points := old.points` unless `current_setting(...)` is the verify RPC.
- **Idempotency needs a run-level stamp** (`verified_at` / `verified_finish_at`, GRANT closed). Awarding `clans.points += maps.points` without a one-shot flag double-counts on retry. `already_verified` should not add points again.
- **Resolve clan from organizer, not live membership at verify time.** Organizer + owner_id are both frozen. Confirmed roster is frozen after Complete. Live `is_same_clan` is for *seeing* the run, not for *who scored*.
- **Admin proof path is already sufficient.** Do not widen comment ACL. Put the mark control where admin already reads the thread (`/runs/{id}` Admin section). A queue is a convenience filter, not an ACL requirement.
- **Delta is one `maps.points` until S-27.** Do not design a join-table sum in this slice; if multi-map lands later, it can change the RPC’s SELECT. Category-only is the live edge case.
- **Lessons.md** still applies: no raw PostgREST in `?error=`; default branch is `main`.

## Historical Context (from prior changes)

- [`context/archive/2026-09-01-complete-clan-run/plan.md`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/context/archive/2026-09-01-complete-clan-run/plan.md) — S-22 contract: distinct `completed_at`, freeze roster/edit/extend, comments until Archive, no points, no verify queue, no officers, GRANT closed. Desired end state explicitly “No admin queue.”
- [`context/archive/2026-09-01-complete-clan-run/crew-decisions.md`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/context/archive/2026-09-01-complete-clan-run/crew-decisions.md) — Critical: complete vs archive; no admin queue; freeze set. Plan against prd-v2 FR-021.
- [`context/archive/2026-08-31-comment-screenshots/plan-brief.md`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/context/archive/2026-08-31-comment-screenshots/plan-brief.md) — private bucket + signed URLs; ACL unchanged; screenshot-only allowed for S-23 proof; out of scope: S-23 verify/points.
- [`context/archive/2026-08-27-create-clan-directory/research.md`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/context/archive/2026-08-27-create-clan-directory/research.md) — predicted `ORDER BY points DESC`; zeros valid; map points on cards are display-only until S-23; no points index.
- [`context/archive/2026-08-31-clan-runs/research.md`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/context/archive/2026-08-31-clan-runs/research.md) — same run entity + `clan_only`; live membership not invite snapshot; officers do not exist; no `runs.clan_id`.
- [`context/archive/2026-08-27-clan-domain-schema/plan.md`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/context/archive/2026-08-27-clan-domain-schema/plan.md) — F-02 freeze; S-23 named as the only points writer.

## Related Research

- `context/archive/2026-08-27-create-clan-directory/research.md` — public directory + ranking zeros
- `context/archive/2026-08-31-clan-runs/research.md` — clan_only audience, no clan_id
- `context/archive/2026-08-31-comment-screenshots/` — no standalone research.md; use plan-brief + plan
- `context/archive/2026-09-01-complete-clan-run/` — no standalone research.md; use plan + crew-decisions (research was skipped)

## Open Questions

These are for `/10x-plan` (not blocking this research artifact):

1. **Queue vs detail-only.** Add an `/admin` (or `/admin/runs`) list of completed-unverified `clan_only` runs, or only a button on `/runs/{id}` next to Archive/Delete? PRD accepts junk in a queue; S-22 left it here. ⭐ likely: button on detail (copy `AdminRunControls`) plus a small completed-unverified list so admin is not hunting Clan cards.
2. **Eligibility after Archive.** Allow verify while `completed_at` set regardless of `archived_at`, or only while still audience-active? Proof remains readable either way; comments stop after archive.
3. **Null `map_id`.** Reject verify (`no_map`) vs award 0. Category-only and map-less are legal today.
4. **Screenshot gate.** Require at least one screenshot comment, or leave proof as a human check (matches “admin still checks in-game by hand”)? ⭐ likely: no SQL gate.
5. **Trigger bypass.** GUC (like clan-delete teardown) vs rewrite `clans_freeze_points_and_owner` to allow DEFINER verify RPC only. Do not GRANT `points` to authenticated.
6. **Un-verify / revoke.** Out of slice unless plan says otherwise — Complete is already one-shot with no undo.
7. **Admin-as-organizer.** `complete_clan_run` treats admin-non-organizer as `not_found`. Verify must invert that: admin who is not the owner still marks finish. Copy `archive_run`’s admin branch, not Complete’s.
8. **Clan deleted before verify.** Admin clan delete CASCADEs members/invites only (`clans_before_delete_teardown` GUC; no FK from `runs`). A completed `clan_only` run can remain with `organizer_id` pointing at a player who no longer owns a clan. RPC should `not_found` / `no_clan` rather than insert a new clan. Out of slice unless plan wants `runs.clan_id` snapshot.

## Follow-up Research 2026-09-01T12:05+02:00

Parallel codebase maps corroborated the main findings (freeze trigger as the real points lock; no `verified_at`; admin already reads screenshot proof; declared = confirmed roster). Two edges to carry into `/10x-plan`:

- **Clan delete does not touch runs.** `clans_before_delete_teardown` only sets `app.clan_delete_teardown` so invite CASCADE is not treated as Accept ([`20260831115700_clan_friend_invites.sql:146-163`](https://github.com/Miigget/book_your_miggets/blob/3d2301e32678f37a755d363dd66163d9fcdb20f4/supabase/migrations/20260831115700_clan_friend_invites.sql#L146-L163)). `run_participants` has no clan FK. Verify that resolves `clans.owner_id = organizer_id` must fail closed if that clan row is gone.
- **Unseated organizer can mint screenshot signed URLs** (`is_run_organizer` on storage SELECT) but cannot INSERT comments (not confirmed). Admin still uses `is_admin()` — no ACL widen needed. Queue input for a list UI is `completed_at IS NOT NULL` (S-22 plan-brief); no extra queue table exists.
