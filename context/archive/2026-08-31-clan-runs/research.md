---
date: 2026-08-31T14:13:21+02:00
researcher: migget
git_commit: 1e4cec79ce24e2565684a6a33f3f593377ab579b
branch: main
repository: book_your_miggets
topic: "S-21 clan-runs — run create/visibility/invites, dashboard archived-restricted load failure, clan membership vs run_invites"
tags: [research, codebase, runs, rls, visibility, dashboard, clans, clan-members, run_invites, clan_invites, s-21, fr-020, fr-028]
status: complete
last_updated: 2026-08-31
last_updated_by: migget
---

# Research: S-21 clan-runs — visibility, create/edit, dashboard load, clan membership, invites

**Date**: 2026-08-31T14:13:21+02:00
**Researcher**: migget
**Git Commit**: [1e4cec79ce24e2565684a6a33f3f593377ab579b](https://github.com/Miigget/book_your_miggets/commit/1e4cec79ce24e2565684a6a33f3f593377ab579b)
**Branch**: main
**Repository**: book_your_miggets

## Research Question

How do run create, visibility, invites, dashboard loading, and clan membership work today, such that we can add a clan-only run audience (same run entity, audience = clan members + admin, never mixed into the guest public stack) and fix Dashboard "Could not load your runs" after friends-only / invite-only runs were archived?

Crew Lead scope (locked): include the dashboard archived-restricted load failure; candidate default is a new audience on the existing run, not a second scheduler; officers appointment UI is out unless `clan_members` already has an officer role; out of slice: S-22 complete, S-23 verified-finish/points.

## Summary

A clan-only run plugs into the **same** `run_visibility` axis S-15 already shipped. Today the enum is only `public | friends_only | invite_only`. Guests never see non-public rows: anon SELECT requires `visibility = 'public'`, landing and guest `/runs` pass `publicOnly`, and `list_player_public_runs` hard-filters public. Signed-in `/runs` partitions Public / Friends / Invited / admin Restricted and never puts `friends_only` / `invite_only` into Public. Hidden runs 404 with the same copy as missing — never 403.

Create/edit is one form and one pair of APIs. Public and friends-only are a direct `runs.insert` / `updateRun`. Invite-only is a **snapshot** written only via `create_invite_only_run` / `set_run_visibility_and_invites`. There is **no clan check** on run create. A fourth audience that is “current clan members” should follow **friends-only** (live DEFINER predicate, plain insert/`updateRun`), not the invite-only RPC pair, unless product wants a frozen per-run member list.

**Officer role does not exist.** `clan_members` is `(user_id PK, clan_id, created_at)` only. Owner is `clans.owner_id`. Membership writes are trigger-only (create seat + accept DELETE). `run_invites` and `clan_invites` are different domains — do not copy either for clan-run SELECT. Closest analog for “audience = clan members + admin” is a new live helper over `clan_members`, same shape as `are_friends` / `is_run_invitee`.

Dashboard `"Could not load your runs."` is a single `try/catch` around **both** `listRunsForOrganizer` and `listRunsForParticipant`. Tabs do not skip archived queries. The list query does **not** embed `run_invites`. The statement that starts extra work once archived restricted rows exist is the per-id confirmed **head count** on `run_participants`. Likely Postgres text: `infinite recursion detected in policy for relation "run_participants"` (**42P17**) — the same INVOKER `EXISTS (SELECT … FROM runs)` graph S-07 already broke for archived run SELECT, still present on `run_participants_select_organizer`. Static reading cannot prove 42P17 still fires; it is still the only `throw` on that path.

## Detailed Findings

### 1. Run visibility enum, RLS SELECT, public list vs 404, signed-in sections

**Enum (only definition; no later `ALTER TYPE … ADD VALUE`):**

```11:14:supabase/migrations/20260824101006_restricted_run_visibility.sql
create type public.run_visibility as enum ('public', 'friends_only', 'invite_only');

alter table public.runs
  add column visibility public.run_visibility not null default 'public';
```

Generated: [`src/types/database.ts:801`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/types/database.ts#L801) and constants array [`:938`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/types/database.ts#L938). App mirror: [`src/lib/services/runs.ts:748-752`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L748-L752).

**Effective `runs` SELECT (five PERMISSIVE policies).** S-15 replaced the active-window + archived-confirmed policies. No later migration alters `runs_select_*`.

| Policy | Role | USING | Source |
| --- | --- | --- | --- |
| `runs_select_active_anon` | `anon` | window **and** `visibility = 'public'` | [`20260824101006:188-196`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L188-L196) |
| `runs_select_active_authenticated` | `authenticated` | window **and** (`public` **or** `friends_only`+`are_friends(organizer_id, uid)` **or** `invite_only`+`is_run_invitee(id)`) | [`:198-216`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L198-L216) |
| `runs_select_confirmed_participant` | `authenticated` | `is_confirmed_participant(id)` — **no** window/visibility conjunct | [`:218-222`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L218-L222) |
| `runs_select_own_organizer` | `authenticated` | `auth.uid() = organizer_id` (any archive/visibility) | [`20260729134008:204-208`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260729134008_run_domain_schema.sql#L204-L208) |
| `runs_select_admin` | `authenticated` | `is_admin()` | [`:210-214`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260729134008_run_domain_schema.sql#L210-L214) |

`are_friends(a,b)` is false when `a` is not distinct from `b` ([`20260821130000:228-245`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260821130000_friend_requests.sql#L228-L245)). Organizer of a friends-only run therefore does **not** match `runs_select_active_authenticated`; they rely on `runs_select_own_organizer` for both live and archived own restricted rows.

**Helpers vs recursion:**

| Helper | EXECUTE | Used FROM `runs` policies? |
| --- | --- | --- |
| `are_friends(a,b)` | `authenticated` only | **Yes** — `runs_select_active_authenticated` |
| `is_run_invitee(p_run_id)` | `authenticated` only | **Yes** — same policy |
| `can_view_run(p_run_id)` | `anon` + `authenticated` | **Never** (DEFINER SELECTs `runs`) |

`can_view_run` ([`20260824101006:115-175`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L115-L175)): admin → organizer → `is_confirmed_participant` → **inlined** window → public / friends+`are_friends` / invite+`is_run_invitee`. Anon: public+window only. Used on `run_participants` confirmed SELECT + pending INSERT, `auto_join_run`, and `is_run_in_active_window` (one-way: window helper → `can_view_run`, never reverse).

A fourth audience must add an OR-branch **inline** on `runs_select_active_authenticated` (and the matching `can_view_run` branch) via a **new DEFINER helper that does not SELECT `runs`**. Do not call `can_view_run` from a policy on `runs`.

**Public catalog vs signed-in sections:**

| Surface | Loader | `publicOnly`? |
| --- | --- | --- |
| Landing | `Welcome.astro` → `listActiveRuns(..., { publicOnly: true }).slice(0, 6)` | always |
| Guest `/runs` | `listActiveRuns(..., { publicOnly: true })` | always |
| Signed-in `/runs` | `listActiveRuns(...)` then `partitionActiveRuns` | never |

`publicOnly` is dual-defense SQL `.eq("visibility", "public")` ([`runs.ts:249-267`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L249-L267)). Partition ([`src/lib/run-list-sections.ts:71-109`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-list-sections.ts#L71-L109)): only `visibility === "public"` goes to Public; friends_only → Friends if organizer/live friend/confirmed; invite_only → Invited if organizer/invitee/confirmed; leftover non-public → admin Restricted. Headings in [`src/pages/runs/index.astro:50-55`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/index.astro#L50-L55). Viewer facts (`public_friendships`, `run_invites` for the viewer, confirmed seats) load only on `/runs`, not dashboard ([`run-list-sections.ts:44-54`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-list-sections.ts#L44-L54)).

**404 not 403:** [`src/pages/runs/[id].astro:57-72,103-104,136-139`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L57-L72) — `getActiveRunById` → participant archive → organizer archive → admin archive → `pageError = "missing"` → HTTP 404, copy “This run is missing or no longer active.” Middleware does **not** prefix-protect `/runs` ([`src/middleware.ts:6-7`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/middleware.ts#L6-L7)).

**Player public RPC** ([`20260825131500_player_profile_public_runs.sql`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260825131500_player_profile_public_runs.sql)): DEFINER, `visibility = 'public'` only; does not change `can_view_run` / `runs` policies. Dashboard does not call it.

**UPDATE grant:** `visibility` is already on the authenticated column grant ([`20260824101006:275-285`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L275-L285)). INSERT/UPDATE WITH CHECK: non-`public` requires organizer `public_profiles.is_verified` ([`:231-272`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L231-L272)). A new enum value needs **no** new column grant; it inherits the verified conjunct.

**Extension point for `clan_only` (or similar) without mixing into the guest public stack:**

| Layer | Keep guests on public | Add signed-in clan audience |
| --- | --- | --- |
| Enum | still exclude from `= 'public'` | `ALTER TYPE … ADD VALUE` |
| Anon SELECT | unchanged (`visibility = public`) | n/a |
| Auth active SELECT | `public` stays first | new OR: `clan_only` + `is_clan_member_of_run(id)` (DEFINER, **not** `can_view_run`) |
| `can_view_run` | anon still public+window | same clan branch for siblings / auto_join / window oracle |
| App `publicOnly` / Welcome / guest `/runs` | already `.eq("visibility","public")` | do not pass `publicOnly` on signed-in `/runs` |
| Partition | only `=== "public"` → Public | new Clan section (or Friends-style bucket); leftover → admin Restricted |
| `list_player_public_runs` | already `visibility = public` | no change |

### 2. Run create + edit + invite-only invite flow

There is **no** `createRun()` helper. One React island [`CreateRunForm.tsx`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/runs/CreateRunForm.tsx) posts to `/api/runs` or `/api/runs/{id}`.

**Pages**

- `/runs/new` — `PROTECTED_ROUTES`; banned banner; friends loaded only if verified ([`src/pages/runs/new.astro`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/new.astro)). Props: `maps`, `nickname`, `isVerified`, `friends`. No `edit` / `inviteeIds`.
- `/runs/{id}/edit` — owner + active via `getOwnedActiveRunForEdit` ([`runs.ts:328-349`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L328-L349)); else 404. `isVerified={false}` hardcoded; picker still shows because `canChooseVisibility = isEdit || isVerified` ([`CreateRunForm.tsx:70`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/runs/CreateRunForm.tsx#L70)). `joinModeLocked` = any non-organizer `run_participants` row.

**Form:** visibility `<select>` values `public | friends_only | invite_only`. Unverified create: hidden `visibility=public`. Invite checkboxes `name="invitee_ids"` only when `visibility === "invite_only"` ([`:90`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/runs/CreateRunForm.tsx#L90)). Join mode can lock; visibility does not.

**Create API** [`src/pages/api/runs/index.ts:90-194`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/api/runs/index.ts#L90-L194):

- Unverified + non-public → `RESTRICTED_VISIBILITY_UNVERIFIED` = `"Verify your account to create friends-only or invite-only runs"` ([`runs.ts:759`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L759)).
- `invite_only` → `createInviteOnlyRun` → RPC `create_invite_only_run` (run + `run_invites` in one transaction) ([`20260824101006:479-508`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L479-L508)).
- `public` / `friends_only` → direct `.insert({ …, visibility })`.

**Edit API** [`src/pages/api/runs/[id]/index.ts:85-89`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/api/runs/%5Bid%5D/index.ts#L85-L89): same unverified string; `invite_only` → `setRunVisibilityAndInvites` **instead of** `updateRun`; else `updateRun`. `updateRun` **rejects** `invite_only` ([`runs.ts:1112-1122`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L1112-L1122)).

**Clan-owner check today: none** on create/edit APIs, form, or `runs.ts` writers.

**`run_invites` snapshot (not accept/decline):** PK `(run_id, user_id)`; no status column; SELECT organizer / invitee / admin; INSERT/DELETE organizer **of an active run only**; no UPDATE grant ([`20260824101006:17-89`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L17-L89)). Comment: unfriend does not drop a row. Worker never `.from("run_invites").insert()` — RPCs replace the snapshot.

**Plug-in for a 4th visibility (no second scheduler):** stay on `CreateRunForm` + `/api/runs` + `VISIBILITIES`. If audience is live clan membership, branch next to **friends_only** (insert / `updateRun`), not the invite-only RPC pair. If product wants a picked subset of members frozen on the run, that is a new snapshot table + RPC — do not overload `run_invites` (friends graph) or `clan_invites` (membership onboarding).

### 3. Dashboard `/dashboard` load path and archived restricted failure

**User-facing string is set in one place:**

```21:28:src/pages/dashboard.astro
  try {
    [created, joined] = await Promise.all([
      listRunsForOrganizer(supabase, user.id),
      listRunsForParticipant(supabase, user.id),
    ]);
  } catch (err) {
    console.error("dashboard run lists failed", err);
    loadError = "Could not load your runs.";
  }
```

Either helper throwing blanks **Incoming and Past**. `?tab=past` is display-only ([`:10`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/dashboard.astro#L10)); archived queries always run. `/runs/history` redirects to `/dashboard?tab=past` ([`src/pages/runs/history.ts`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/history.ts)). Joined lists drop `organizerId === user.id` so auto-seated organizer rows stay under Created ([`dashboard.astro:32-35`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/dashboard.astro#L32-L35)). Dashboard does **not** call `loadRunListViewerFacts` / `list_player_public_runs`.

**Shared embed `RUN_SELECT`** ([`runs.ts:56-81`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L56-L81)): run columns including `visibility` + `map:maps(...)` + `organizer:public_profiles!runs_organizer_id_fkey(nickname)`. **No `run_invites`. No `public_friendships`.**

**Exact queries**

`listRunsForOrganizer` ([`runs.ts:356-405`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L356-L405)):

```ts
.from("runs").select(RUN_SELECT).eq("organizer_id", userId)
```

Throw wrapper: ``Failed to list organizer runs: ${error.message}``. Split in JS with `isRunActive`. Then **per archived id** (and per active id):

```ts
.from("run_participants")
  .select("id", { count: "exact", head: true })
  .eq("run_id", id)
  .eq("status", "confirmed")
```

Throw: ``Failed to count confirmed participants: ${error.message}`` ([`runs.ts:205-212`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L205-L212)). Pending counts only for **active** `approval_required` ([`:222-239,379`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L222-L239)).

`listRunsForParticipant` ([`runs.ts:412-458`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L412-L458)):

```ts
.from("run_participants").select("run_id").eq("user_id", userId).eq("status", "confirmed")
.from("runs").select(RUN_SELECT).in("id", runIds)
```

Then the **same** confirmed head-count over active+archived member ids. Organizer auto-seat ([`20260731111849`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260731111849_participant_apply_leave_and_organizer_seat.sql)) means created runs always appear in the membership query too. No `.single()` — **PGRST116 is not on this path.**

`listArchivedRunsForParticipant` is a thin wrapper over the same helper; dashboard does not call it (admin player page does).

**Why Q1 (organizer `runs` SELECT) should not 400 on archived friends_only/invite_only:** `runs_select_own_organizer` is unbounded. `RUN_SELECT` embeds world-readable `maps` and `public_profiles`. `run_invites` SELECT for organizer is also unbounded (no active-window conjunct) — and dashboard never selects that table.

**Likely failing statement** once those archived rows exist: the confirmed head-count (Q2/Q6), because Incoming is not tab-gated and counts every archived id.

Policies on that count:

- `run_participants_select_confirmed_authenticated`: `status = confirmed AND can_view_run(run_id)` ([`20260824101006:304-311`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L304-L311)). `can_view_run` is DEFINER; organizer and confirmed participant return true **before** the window ([`:143-149`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L143-L149)).
- `run_participants_select_organizer`: **INVOKER** `EXISTS (SELECT 1 FROM public.runs r WHERE r.id = run_id AND r.organizer_id = uid)` ([`20260729134008:275-286`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260729134008_run_domain_schema.sql#L275-L286)). Still present. This is the runs ↔ `run_participants` graph that produced **42P17** before `is_confirmed_participant` was made DEFINER ([`20260817125800:1-3`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql#L1-L3)).

`is_run_organizer(p_run_id)` already exists as STABLE DEFINER ([`20260820092809:7-20`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260820092809_run_comments.sql#L7-L20)) and is used from **comment** policies, not from `run_participants_select_organizer`.

**Likely exception text (if this throws):**

`infinite recursion detected in policy for relation "run_participants"` (or `"runs"`) — SQLSTATE **42P17**.

JS then throws `Failed to count confirmed participants: infinite recursion detected in policy for relation "run_participants"`, caught as `"Could not load your runs."`.

DEFINER on `can_view_run` / `is_confirmed_participant` is *supposed* to break that cycle; this research does not re-run SQL smoke. It is still the only statement that (a) runs because archived restricted rows exist, (b) walks that policy graph, (c) `throw`s into the dashboard catch-all. **Not this bug:** PGRST116; enum 400 on `.eq("visibility")` (dashboard never filters visibility); a `run_invites` embed 400.

Related: `listPlayerProfileRuns` uses the same `confirmedCountsForRuns` for organized/member rows missing from the public RPC ([`runs.ts:570-574`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L570-L574)) — same exception would 500 `/players/{id}` for an organizer with archived restricted runs. Out of this slice unless plan wants a shared count fix.

`formatVisibility` ([`runs.ts:133-145`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L133-L145)) is render-time on cards ([`DashboardRunCard.astro:64`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/runs/DashboardRunCard.astro#L64)); a new enum value without a switch case would 500 **after** a successful load, not set `loadError`.

### 4. Clan membership — tables, roles, who can create/invite, officers today

**`clans`** ([`20260827114633:7-26`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260827114633_clan_domain_schema.sql#L7-L26)): `id`, `owner_id` → `profiles` CASCADE, `name`, `tag` (unique `lower(btrim(tag))`), `points` default 0, timestamps. Later: `picture_path`; admin column UPDATE `(name, tag, picture_path, updated_at)` ([`20260831110000`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260831110000_admin_clan_update.sql)). Points / `owner_id` frozen. Guest SELECT `USING (true)`. INSERT: verified, not banned, `owner_id = uid`, `points = 0`.

**`clan_members` — quoted columns, no role:**

```37:41:supabase/migrations/20260827114633_clan_domain_schema.sql
create table public.clan_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete cascade,
  created_at timestamptz not null default now()
);
```

Types match ([`database.ts:103-108`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/types/database.ts#L103-L108)). Grants: SELECT anon+auth; **DELETE only** for auth — **no GRANT INSERT**. RLS: world SELECT; admin DELETE only.

**Officer existence: does not exist.** `src/` grep `officer` = 0. SQL comments say “No … officers” (F-02, S-19 headers). No `is_clan_owner` / `is_clan_member` / `is_clan_officer` in `public.Functions`. Owner checks are inline `clans.owner_id` ([`clans.ts:575-576`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/clans.ts#L575-L576); [`clans/[id].astro`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/clans/%5Bid%5D.astro) `user.id === clan.ownerId`). Roadmap Q1 already says owner-only fulfills “owner or officer” until appointment exists. **S-21 create gate = `clans.owner_id` (and that user is also in `clan_members`).**

**Who can create a clan:** verified INSERT (`clans_insert_verified_owner`). App `createClan` inserts the clan row only; seating is `seat_owner_on_clan_insert` DEFINER ([`20260827114633:50-58`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260827114633_clan_domain_schema.sql#L50-L58)). One clan per player: `clan_members.user_id` PK; second clan aborts the outer INSERT (no `ON CONFLICT`).

**Who can invite friends into a clan:** owner only. RLS INSERT requires `inviter_id = clans.owner_id` and `are_friends`. App `inviteFriendsToClan`; picker on `/clans/{id}` only if `isOwner` — guests/non-owners must not load `public_friendships` (AGENTS.md). Accept = invitee DELETE of pending `clan_invites`; DEFINER `clan_invites_before_delete_accept` inserts `clan_members` ([`20260831115700:171-189`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260831115700_clan_friend_invites.sql#L171-L189)). **No** `.from("clan_members").insert` in `src/`. Inbox on `/profile`, not clan or player pages.

**No `clan_id` on `runs`.** `runs` Row has no clan FK ([`database.ts` runs columns](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/types/database.ts)). F-02 / S-19 headers: do not join `runs` / `run_invites` from clan objects. A clan-run audience helper must live on the **run** side (like `are_friends` from `runs` policies), not a clan view that SELECTs `runs`.

Live membership implication: `user_id` PK ⇒ at most one current clan. A live `clan_members` predicate tracks **current** roster (leave does not exist yet; membership is sticky after accept). A snapshot would freeze invitees at write time (invite-only style). Candidate default “audience = clan members + admin” is the live graph.

### 5. `run_invites` vs `clan_invites` — do not conflate

| | `run_invites` | `clan_invites` |
| --- | --- | --- |
| Purpose | Invite-only **run visibility snapshot** | Clan **membership onboarding** |
| Status | none (row = in audience) | `pending \| declined` only (accept deletes) |
| Accept/decline | **No** | Invitee DELETE seats; UPDATE decline; owner reopen/cancel |
| Unfriend | Keeps access until organizer edits snapshot | Live `are_friends` on send/reopen/accept; stale Accept fails |
| Writers | INVOKER RPCs `create_invite_only_run` / `set_run_visibility_and_invites` | Owner INSERT/reopen; invitee UPDATE/DELETE |
| Anon SELECT | none | none |
| Join `runs`? | child of `runs` | **must not** |

S-19 plan (implemented): “`run_invites` is a visibility snapshot with **no** accept/decline — **do not copy it**.” Live SQL: F-02 “no joins to run_invites”; S-19 “Do not join runs.”

**Reuse vs fork for clan-run audience**

| Mechanism | Reuse for S-21 SELECT? |
| --- | --- |
| `run_invites` | **Fork** — wrong product (friends snapshot, not current clan). Do not add clan members as fake run invitees. |
| `clan_invites` | **Do not reuse for run SELECT** — pending join-clan ≠ can-see-run. |
| Live graph like `friends_only` | **Closest analog** — new DEFINER `is_clan_member` (or `is_clan_member_of_run`) over `clan_members`, granted like `are_friends`. Does not exist yet. |
| New snapshot like invite-only | Only if product freezes a picked subset; would need a new table/RPC, not `run_invites`. |

FR-020 “invite clan members to participate” can mean (a) they are the audience and apply/join with existing join_mode, or (b) a picker of members at create. Candidate default (roadmap + crew) is (a): same run entity, audience = clan members + admin. Join mode stays orthogonal (approval vs auto-join among people who can see the run). `auto_join_run` already calls `can_view_run` — a `can_view_run` clan branch covers guessed-UUID join.

## Code References

- `src/types/database.ts:801,938` — `run_visibility` enum
- `src/types/database.ts:103-108` — `clan_members` columns (no role)
- `src/lib/services/runs.ts:56-81` — `RUN_SELECT` (no invites embed)
- `src/lib/services/runs.ts:133-145` — `formatVisibility` (extend when adding enum value)
- `src/lib/services/runs.ts:195-217` — `confirmedCountsForRuns` (dashboard throw site)
- `src/lib/services/runs.ts:356-458` — `listRunsForOrganizer` / `listRunsForParticipant`
- `src/lib/services/runs.ts:748-770` — `VISIBILITIES`, unverified copy, `parseInviteeIds`
- `src/pages/dashboard.astro:10-28` — tabs + catch `"Could not load your runs."`
- `src/lib/run-list-sections.ts:32-109` — `/runs` facts + partition (never mix restricted into Public)
- `src/pages/runs/index.astro:30-55` — guest `publicOnly` vs signed-in sections
- `src/pages/runs/[id].astro:57-72,136-139` — loader order + 404 copy
- `src/pages/api/runs/index.ts:90-194` — verified gate; invite-only RPC vs insert
- `src/pages/api/runs/[id]/index.ts:85-89` — edit branch invite-only vs `updateRun`
- `src/components/runs/CreateRunForm.tsx:70,90` — `canChooseVisibility`, invite picker
- `src/lib/services/clans.ts:221-235,551-576` — membership lookup; owner-only invite
- `src/middleware.ts:6-7` — `/dashboard` protected; do not prefix-protect `/runs` or `/clans`
- `supabase/migrations/20260824101006_restricted_run_visibility.sql` — enum, SELECT rewrite, `can_view_run`, `run_invites`, invite RPCs
- `supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql:1-3` — 42P17 history
- `supabase/migrations/20260729134008_run_domain_schema.sql:204-214,275-286` — organizer/admin run SELECT; `run_participants_select_organizer`
- `supabase/migrations/20260827114633_clan_domain_schema.sql` — clans + clan_members, no officers, no run joins
- `supabase/migrations/20260831115700_clan_friend_invites.sql` — `clan_invites`, accept trigger, no officers
- `supabase/migrations/20260825131500_player_profile_public_runs.sql` — public-only profile RPC

## Architecture Insights

1. **Two axes, one PERMISSIVE OR matrix.** Active window is axis 1; audience (`public` / `friends_only` / `invite_only`) is axis 2. Organizer, admin, and confirmed-participant SELECT sit beside the window as extras. Clan-only is a new value on axis 2, not a new entity.
2. **Friends-only = live graph; invite-only = snapshot + RPC.** Clan-only as “current members + admin” copies friends-only (helper + insert/`updateRun`). Copying invite-only RPCs is only justified for a frozen member list.
3. **DEFINER helpers are the recursion pattern.** `is_confirmed_participant`, `are_friends`, `is_run_invitee`, `is_run_organizer`. Never call a helper from policies on the table it reads. A clan membership helper used FROM `runs` policies must DEFINER-read `clan_members` only — and clan policies must still not SELECT `runs` (FR-028).
4. **`can_view_run` is the sibling choke point.** Participant confirmed SELECT, pending INSERT, `auto_join_run`, `is_run_in_active_window`. Extending it keeps apply/join/oracles aligned with list/detail. Never use it FROM `runs` policies.
5. **Publishable key is the authz boundary.** Filtering `/runs` UI is not enough; anon PostgREST `GET /rest/v1/runs` must stay public-only. Same for a new audience.
6. **404, not 403.** Restricted non-audience looks like missing. Clan-only non-members must use the same copy.
7. **Verified is not a global role.** Restricted run create already requires verified organizer. Clan-run create additionally needs **clan owner** (no officer column). Unverified public-run create stays.
8. **Dashboard inventory is ownership + confirmed seats, then N+1 counts.** Failure is a thrown `Error` from those helpers, not RLS silently hiding rows (hide ⇒ empty list, not `loadError`). Fix the count/policy graph; do not paper over with a second query that still hits `run_participants_select_organizer`.
9. **Join mode stays orthogonal** to visibility. Auto-join among clan members is `can_view_run` + existing RPC, not a new join_mode.

## Historical Context (from prior changes)

- `context/archive/2026-08-24-restricted-run-visibility/research.md` + `plan.md` — S-15 visibility axis, 404, Friends/Invited/Restricted sections, invite snapshot RPCs, `can_view_run` recursion rules, verified restricted create. **This slice extends that axis; it does not replace it.**
- `context/archive/2026-08-18-my-runs-dashboard/plan.md` — organizer inventory by `organizer_id`; friendly load error (not `err.message`); later `57dfb56` merged History into Dashboard (`listRunsForParticipant` in the same catch).
- `context/archive/2026-08-27-clan-domain-schema/plan.md` — no officers, no run joins, no client INSERT on `clan_members`, one clan per player.
- `context/archive/2026-08-27-create-clan-directory/research.md` — verified clan create; do not prefix-protect `/clans`; restricted run create is the verified analog, not public run create.
- `context/archive/2026-08-31-clan-friend-invites/plan.md` — do not copy `run_invites`; owner-only friends picker; accept trigger seats; inbox on `/profile`.
- `context/archive/2026-08-21-add-friends/` — `are_friends` live verified graph; S-15 hook.
- `context/foundation/lessons.md` — never put PostgREST `Error.message` in `?error=` (dashboard already uses a fixed string; keep that).
- Roadmap S-21 risk: reusing run create without a new visibility value either leaks onto `/runs` or forks a second scheduler.
- Roadmap open Q1: officer appointment not blocking; owner-only fulfills FR-020 until then.

## Related Research

- `context/archive/2026-08-24-restricted-run-visibility/research.md` — visibility / leak surfaces (pre-clan; still the SELECT map)
- `context/archive/2026-08-27-create-clan-directory/research.md` — F-02 schema as of S-18 (membership writes were still freeze; S-19 added invites)
- `context/archive/2026-08-07-run-archival-lifecycle/research.md` — active window dual app+RLS
- `context/archive/2026-08-07-auto-join-mode/research.md` — `auto_join_run` DEFINER (now audience-aware via `can_view_run`)

## Open Questions

Planning inputs, not blockers for this research. Crew Lead already locked same-entity + new audience and dashboard-in-scope.

1. **Live clan membership vs picked-member snapshot.** Candidate default is live `clan_members` (friends-only analog). FR-020’s word “invite” might still want a picker of members; that would be a new snapshot, not `run_invites`. Owner-only create does not require a picker if every member can already see the run.
2. **Does a clan run need `runs.clan_id`?** Live helper can resolve clan via organizer’s `clan_members` row (one clan per player) without a column. A column snapshots which clan if the organizer could ever leave (leave is out of this slice). Plan should pick; F-02 still forbids clan policies from reading `runs`.
3. **Confirm 42P17 with SQL smoke** as organizer of archived `friends_only` and `invite_only`: the exact head-count in `confirmedCountsForRuns`. If it does **not** recurse, capture the real `error.message` from `console.error("dashboard run lists failed", err)` (Worker logs) — the catch-all hides it from the UI (lessons.md: correct).
4. **Signed-in `/runs` section name** for clan-only (e.g. **Clan**) vs stuffing into Restricted. Must not mix into Public. Admin leftover Restricted stays for friends/invite they are not in; clan-only leftovers belong there too unless the admin is a member.
5. **Verified copy** `RESTRICTED_VISIBILITY_UNVERIFIED` currently names “friends-only or invite-only”; a fourth restricted value should share the same gate string or a deliberate update.
6. **`formatVisibility` exhaustive switch** and `CreateRunForm` options must gain the new value in the same change or cards 500 after a successful dashboard load.
7. Officers appointment remains **out** — no column to hang UI on. S-22 can keep owner-only complete until a later role exists.
