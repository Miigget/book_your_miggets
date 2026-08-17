# Admin player archive view Implementation Plan

## Overview

Ship S-09 / FR-016: an admin can open a player's profile at `/admin/users/{id}` and see that player's confirmed archived runs (same membership rule as S-07, but for the **target** player). From those cards, canonical `/runs/{id}` loads read-only archived detail even if the admin never had a seat. Guests and members keep the S-07 404. No public profile, no S-08 organizer inventory, no new RLS.

## Current State Analysis

S-07 already encodes participant archive: `listArchivedRunsForParticipant` / `getArchivedRunForParticipant` start from confirmed `run_participants` rows, then keep `!isRunActive`. `/runs/[id].astro` tries active first, then the participant archive loader; an admin without a confirmed seat still gets HTTP 404. `AdminRunControls` already renders whenever `isAdmin` and the page loaded — it simply never appears on archived runs the admin did not play.

Admin RLS already returns the rows FR-016 needs: `runs_select_admin` (all runs) and `run_participants_select_admin` (all participation rows). `listArchivedRunsForParticipant(supabase, playerId)` is therefore RLS-safe on an **admin** cookie client. The same call on a member client is **not** the target's full archive (`is_confirmed_participant` uses the viewer's `auth.uid()`). The page must stay behind the existing `/admin` 404 gate.

There is no player-profile URL. `/admin` lists nickname and id as plain text. Rosters and organizer names are not links. `public_profiles` exposes `id` + `nickname` to anon, but this slice does not add a public profile.

Middleware `pathname.startsWith("/admin")` already covers `/admin/users/{id}` (auth → sign-in, non-admin → 404). No `PROTECTED_ROUTES` change.

## Desired End State

An admin on `/admin` clicks a user's nickname, lands on `/admin/users/{id}`, and sees nickname, user id, and that player's confirmed archived runs (newest `starts_at` first). Unknown or invalid ids 404. A known player with no archived confirmed runs shows an empty “no past runs” state (including banned users). Clicking a card opens `/runs/{id}` read-only (map, time, confirmed roster, Archived label, Delete run). Members and guests still 404 on archived detail without a confirmed seat. `/runs/history` is unchanged.

### Key Discoveries:

- `listArchivedRunsForParticipant` already takes arbitrary `userId` (`src/lib/services/runs.ts:260-296`); admin RLS makes reuse correct; member clients must never hit this with another player's id on a public page
- `getArchivedRunForParticipant` still requires a confirmed seat for the given userId (`src/lib/services/runs.ts:298-321`) — do not weaken that function; add an admin-only loader
- `runs_select_own_organizer` still returns past-grace rows — an ungated “archived by id” helper would leak S-08 to organizers
- `/admin` prefix 404 (`src/middleware.ts:52-55`) covers nested `/admin/users/{id}` with no new route list entry
- `mapRunRow` still returns null for archived (`src/lib/services/runs.ts:143-148`); archive paths must keep using `mapArchivedRunRow`
- No player-profile pages exist; only `src/pages/admin/index.astro`

## What We're NOT Doing

- Public or member-visible player profiles (`/players/{id}`, roster/organizer links)
- S-08 my-runs dashboard or listing runs the player **organized** after leave-team
- Changing S-07 `/runs/history` or `getArchivedRunForParticipant` membership rules for non-admins
- Pending/denied rows in the admin archive list
- Ban/verify forms or role/verified/banned chips on the profile (those stay on `/admin`)
- New migration, SECURITY DEFINER read RPC, or `service_role` on the Worker
- History search/filter/pagination
- Guest SELECT of archived runs
- Vitest/Jest
- Verified badge in public UI

## Implementation Approach

App-layer only. RLS already permits admin reads.

1. Add `getProfileForAdmin` (id + nickname, or null). Reuse `listArchivedRunsForParticipant(supabase, playerId)` only from the admin-gated profile page.
2. New SSR page `/admin/users/{id}` (nickname, id, archive cards copied from `/runs/history` facts). Link nicknames on `/admin`.
3. Add `getArchivedRunForAdmin` (archived by id, no seat check). Call it from `/runs/[id].astro` **only** when `locals.profile.role === "admin"` after active + participant loaders miss. Keep mutations omitted; keep `AdminRunControls`.

## Critical Implementation Details

**Admin archived-by-id is page-gated, not “whoever RLS allows.”** `getArchivedRunForAdmin` will succeed for organizers via `runs_select_own_organizer` if a member client ever calls it. Invoke it only after `isAdmin` from `locals.profile`. Do not replace `getArchivedRunForParticipant`.

**Back link on archived detail.** Today archived mode always points at `/runs/history`. After bypass, an admin who did not play would land on **their** history. If the participant loader returned the run, keep `← Past runs` → `/runs/history`. If only the admin loader returned it, use `← Admin` → `/admin`.

**No new middleware path.** Do not add `/admin/users` as a separate `PROTECTED_ROUTES` entry (redundant) and do not prefix-gate `/runs`. Invalid profile UUID → 404, never a PostgREST `22P02` 500 (`isUuid` before query).

**Phase 1 cards may 404 until Phase 2.** List verification in Phase 1 is the profile index; opening `/runs/{id}` without a seat is Phase 2.

## Phase 1: Admin player profile and archive list

### Overview

Introduce the admin-only profile URL and show that player's S-07-shaped archive list. Detail bypass waits for Phase 2.

### Changes Required:

#### 1. Admin profile loader

**File**: `src/lib/services/admin.ts`

**Intent**: Let the profile page 404 when there is no `profiles` row, without loading privileged flags this slice must not display.

**Contract**: `getProfileForAdmin(supabase, userId)` returns `{ id: string; nickname: string | null } | null`. `isUuid` miss → `null` (or the page guards first). Missing row → `null`. DB error → `AdminError` with a friendly message; log the raw error (`console.error`). Select only `id, nickname` from `profiles`. Do not return `role` / `is_verified` / `is_banned`.

#### 2. Admin player profile page

**File**: `src/pages/admin/users/[id].astro` (new)

**Intent**: First player-profile surface; admin-only via existing `/admin` middleware prefix.

**Contract**: Assume admin (middleware). Load `getProfileForAdmin`; if null → same 404 pattern as run detail (`Astro.response.status = 404`, “not found” copy — do not distinguish banned vs missing). If found: show nickname (`"—"` when null), user id (monospace, not a link), back link `← Users` → `/admin`. Then `listArchivedRunsForParticipant(supabase, profile.id)`. Empty list: distinct “No past runs” copy about **this player**, not “you”. Cards reuse `/runs/history` facts (title, Archived, time, filled, min points, join, map, organizer) and link to `/runs/{id}`. No filter form. Load failures: log raw error; inline friendly string — do not echo PostgREST into the body. Banned players use this same path (no extra branch).

#### 3. Entry from the users table

**File**: `src/pages/admin/index.astro`

**Intent**: Admins can discover the profile without public roster links.

**Contract**: Nickname cell is a link to `/admin/users/{id}` (including `"—"`). User id column stays plain text. Do not add roster/organizer links on run pages. Optional one-line hint in the `/admin` subtitle that nicknames open archived history.

#### 4. Operator docs

**Files**: `README.md` (Admin access), `AGENTS.md` (Hard Rules protected-routes sentence)

**Intent**: lessons.md — document the new admin surface so later agents do not invent `/players/{id}`.

**Contract**: README step 4: nicknames on `/admin` open `/admin/users/{id}` (that player's confirmed archived runs). AGENTS.md: `/admin` prefix includes `/admin/users/{id}`; non-admins still 404. Do not rewrite unrelated sections.

### Success Criteria:

#### Automated Verification:

- `src/pages/admin/users/[id].astro` exists
- `getProfileForAdmin` exists in `src/lib/services/admin.ts`
- `/admin` nickname cells link to `/admin/users/{id}` (grep)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Admin: nickname on `/admin` opens the profile; nickname + id visible; archive list is that player's confirmed past-grace runs, newest first, not still-active runs
- Known player with zero archived confirmed runs: empty “no past runs” (not 404)
- Invalid UUID and unknown id: HTTP 404
- Banned player with archive: profile + list still load
- Guest `/admin/users/{id}` → sign-in; signed-in member → 404
- `/runs/history` for a member is unchanged (own confirmed archive only)
- Card click without a seat may 404 until Phase 2 — acceptable here

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Admin bypass on archived `/runs/{id}`

### Overview

Make profile cards (and typed archived URLs) open for any admin. Guests/members keep S-07 404. Delete run stays available when the page loaded.

### Changes Required:

#### 1. Admin archived detail loader

**File**: `src/lib/services/runs.ts`

**Intent**: Load an archived run by id without a confirmed-seat check, for the admin branch only.

**Contract**: `getArchivedRunForAdmin(supabase, runId)` returns `ArchivedRunDetail | null`. `!isUuid` → `null`. Fetch `RUN_SELECT` by id; missing → `null`; `mapArchivedRunRow` (null if still active). Do not call `getOwnParticipation`. Do not change `getArchivedRunForParticipant`. Comment that callers must already be admin.

#### 2. Dual-mode detail: admin third attempt

**File**: `src/pages/runs/[id].astro`

**Intent**: Canonical URL; admin bypass after active and participant loaders miss.

**Contract**: Compute `isAdmin` from `locals.profile` **before** the fetch. Sequence: `getActiveRunById`; if null and `user`, `getArchivedRunForParticipant`; if still null and `isAdmin`, `getArchivedRunForAdmin`. Else `pageError = "missing"` (404 copy unchanged). Archived mode still omits `RunParticipantActions` and pending/denied fetches. `AdminRunControls` remains `isAdmin &&` page loaded (including newly visible archived runs). Back link: participant-archive hit → `/runs/history`; admin-only hit → `/admin`. Invalid UUID still 404, not 500.

### Success Criteria:

#### Automated Verification:

- `getArchivedRunForAdmin` exists; `getArchivedRunForParticipant` still returns null without a confirmed seat (grep/comment + call sites)
- `[id].astro` calls the admin loader only when `isAdmin`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Admin who did not play: archived `/runs/{id}` from the profile card opens read-only (roster/map/time, no apply/approve/leave/pending); Archived visible; Delete run present; confirm still required
- Guest and non-confirmed member: same URL still 404
- Admin who **was** confirmed: still opens; back link is Past runs (`/runs/history`)
- Admin-only bypass: back link is Admin (`/admin`)
- Active run detail/mutations unchanged; `/runs/history` unchanged
- Organizer who left (member): still 404 on that archived URL

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None required — no test runner in `package.json`. Keep `isRunActive` / `mapArchivedRunRow` as the archive predicate so a later runner can cover them without a page harness.

### Integration Tests:

- `npm run lint` and `npm run build` per phase
- No new SQL migration; optional sanity: as admin cookie, `run_participants` where `user_id = other` and `status = confirmed` returns rows (existing `run_participants_select_admin`)

### Manual Testing Steps:

1. Local app + Supabase; two members + one SQL-promoted admin. Confirm member A on a run; leave `starts_at` in the future (not on the profile list).
2. SQL-set that run `starts_at` to >1 hour ago. As admin: `/admin` → A's nickname → profile lists the run; B's profile does not.
3. As admin (not seated): open the card → read-only detail + Delete run. As guest and as B: 404.
4. Unknown UUID under `/admin/users/{id}` → 404. New user with no archive → empty state. Ban A → profile + list still load; ban/verify controls still only on `/admin`.
5. Member `/runs/history` still only their own confirmed archives. Active apply/approve still works.

## Performance Considerations

Same shape as S-07: one `run_participants` query for the target user, one `runs` `.in("id", …)`, then confirmed counts on the archived subset. One extra PK `profiles` lookup for the header. No new index. No pagination (locked). Postgres `now()` vs Worker `Date` skew at the grace edge remains the S-04 acceptance.

## Migration Notes

- No database migration and no backfill
- Rollback = revert app code; RLS already allowed admin SELECT
- Deploy is the usual `v*` tag CD; no new secrets

## References

- PRD FR-016, Access Control (admin archive from profile): `context/foundation/prd.md`
- Roadmap S-09: `context/foundation/roadmap.md`
- S-07 archive list/detail: `context/archive/2026-08-17-participant-archive-history/`
- S-06 admin gate + `/admin` table: `context/archive/2026-08-07-admin-moderation-tools/`
- Loaders: `src/lib/services/runs.ts`, `src/lib/services/admin.ts`, `src/lib/services/participants.ts`
- Middleware `/admin` 404: `src/middleware.ts`
- Lessons (`?error=` / no raw infra in UI): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Admin player profile and archive list

#### Automated

- [x] 1.1 `src/pages/admin/users/[id].astro` exists
- [x] 1.2 `getProfileForAdmin` exists in `src/lib/services/admin.ts`
- [x] 1.3 `/admin` nickname cells link to `/admin/users/{id}`
- [x] 1.4 `npm run lint` passes
- [x] 1.5 `npm run build` passes

#### Manual

- [ ] 1.6 Admin: nickname opens profile; list is that player's confirmed archived runs, newest first
- [ ] 1.7 Known player with zero archived confirmed runs: empty “no past runs”
- [ ] 1.8 Invalid UUID and unknown id: HTTP 404
- [ ] 1.9 Banned player with archive: profile + list still load
- [ ] 1.10 Guest → sign-in; member → 404 on `/admin/users/{id}`
- [ ] 1.11 Member `/runs/history` unchanged
- [ ] 1.12 Card click without a seat may 404 until Phase 2

### Phase 2: Admin bypass on archived `/runs/{id}`

#### Automated

- [ ] 2.1 `getArchivedRunForAdmin` exists; `getArchivedRunForParticipant` still requires a confirmed seat
- [ ] 2.2 `[id].astro` calls the admin loader only when `isAdmin`
- [ ] 2.3 `npm run lint` passes
- [ ] 2.4 `npm run build` passes

#### Manual

- [ ] 2.5 Admin who did not play: archived `/runs/{id}` is read-only with Delete run
- [ ] 2.6 Guest and non-confirmed member: archived URL still 404
- [ ] 2.7 Admin who was confirmed: opens; back link is Past runs
- [ ] 2.8 Admin-only bypass: back link is Admin
- [ ] 2.9 Active detail/mutations and `/runs/history` unchanged
- [ ] 2.10 Organizer who left (member): archived URL still 404
