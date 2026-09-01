# Team-size bands under Advanced settings (S-26) Implementation Plan

## Overview

Organizers can optionally set `auto_join_min` under Advanced settings so the first N confirmed seats auto-join and remaining slots up to `max_participants` need approval. The default create control stays the two-option `join_mode` select. Apply/approve and unbanded auto-join keep working. This is roadmap S-26 / prd-v2 FR-005, FR-025, FR-026, US-01.

Refined after plan-review REVISE (F1–F3): overlay switches on RPC text (no confirmed post-check after `band_full`); invite RPCs copy live bodies then DROP + re-GRANT EXECUTE; `runRowFromPublicRpc` stubs `auto_join_min: null`.

## Current State Analysis

- `join_mode` is a two-value Postgres enum (`approval_required` | `auto_join`). The organizer picks it from a default-form `<select>` on shared `CreateRunForm` (`src/components/runs/CreateRunForm.tsx:309-333`). There is no third option and no Advanced UI in `src/` — S-25 left Advanced empty so S-26 is its first occupant (`research.md`).
- Capacity is `max_participants` only (`src/lib/run-limits.ts`). Confirmed count is app-side. Organizer auto-seat occupies one confirmed seat at create.
- Auto-join confirmation is only race-safe inside `auto_join_run` (`SELECT … FOR UPDATE` on `runs`, live body `supabase/migrations/20260901083008_complete_clan_run.sql:78-155`). The RPC currently returns `not_auto_join` unless `join_mode = auto_join`, and `full` when confirmed ≥ max. `applyToRun` calls void `autoJoinRun` only for `auto_join`, then **requires a confirmed row** (`src/lib/services/participants.ts:253-260`) — no pending fallthrough.
- Organizer Accept is still S-02 soft overfill: client `confirm()`, no server cap (`decideParticipant`, `RunParticipantActions.tsx:221-226`).
- Authenticated UPDATE grant list is eight columns and does **not** include a min-band field (`20260901102315_verify_clan_run_finish.sql:144-154`). A new organizer-writable column must be appended or PostgREST UPDATE is a silent no-op/error.
- Join mode locks after any non-organizer `run_participants` row (`enforce_run_update_invariants`, `edit.astro:47-61`, `prepareOwnedActiveRunPatch`). Capacity floor is confirmed-only and change-gated.
- Dashboard pending counts are fetched only for `join_mode === "approval_required"` (`runs.ts:407`). `formatJoinMode` is exhaustive on the two-value enum. Cards show that label; detail DL does too (`runs/[id].astro:250-251`).
- Invite-only create/edit go through `create_invite_only_run` / `set_run_visibility_and_invites` (not the public insert). Those RPCs already take `p_join_mode` and `p_max_participants`.
- No test runner (`AGENTS.md` / `package.json`). Verification is lint, build, `db:types`, local migration apply, and manual/SQL checks.

## Desired End State

An organizer can leave Advanced empty (today’s `join_mode` only) or set a min N. When N is set, players auto-join until confirmed count reaches N (organizer counts), then Apply creates pending until max; “This run is already full” only at max. Default form still has exactly two join-mode options. Existing runs stay unchanged (`auto_join_min` NULL). Invite-only create/edit persist the column. After the first non-organizer participant, both join mode and the min-band freeze.

Verify by: create with Approval required + Advanced min 2 + capacity 4 (organizer is 1/4); a second account Join-confirms (2/4); a third Apply-pends; a fourth Apply-pends; at 4/4 the CTA is disabled full. Unbanded auto-join still confirms until max. Edit after the second player cannot change join mode or min.

### Key Discoveries:

- Overlay is locked by prd-v2 success criterion 2 / FR-026: when a band is set, auto-join fills the min regardless of stored `join_mode`; otherwise today’s join mode. That means `auto_join_run`’s `not_auto_join` gate must allow `auto_join_min IS NOT NULL`, not only `join_mode = auto_join`.
- Mapping today’s `full` onto the min band would stop Apply too early. Distinct `band_full` + pending fallthrough is the race-safe seam (`research.md` Architecture Insights). Check **max before min** so `min = max` stays “all auto-join until capacity.”
- `applyToRun` (`participants.ts:253-260`) calls void `autoJoinRun` then **requires a confirmed row**. Overlay cannot wrap that helper and keep the post-check; the branch must switch on RPC text (`band_full` → pending insert, never the post-check). `autoJoinRun` is only called from `applyToRun`.
- `set_run_visibility_and_invites` uses `join_mode = coalesce(p_join_mode, join_mode)`. The same coalesce **cannot** clear `auto_join_min` to NULL. Invite edit needs an explicit “write this nullable value” flag. Live create body is `20260831131219:313-398` (5-cap UX pre-check); setter live body is `20260824101006:519-599`. `DROP FUNCTION` drops `GRANT EXECUTE`.
- `runRowFromPublicRpc` (`runs.ts:500-536`) builds a complete `RunRow`. Adding `auto_join_min` to `RunRow` requires `auto_join_min: null` there; do not DROP/CREATE `list_player_public_runs`.
- Dashboard pending chip/counts ignore auto-join runs today. Auto-join + band will have pending; those queries must include banded runs.
- Grant-list rewrite is the silent breaker for every new `runs` column since edit-run.

## What We're NOT Doing

- **`ALTER TYPE join_mode`** or a third default-form option.
- Moving Capacity / Starts-at into Advanced (S-25 stays on the flat fields).
- Hardening organizer Accept (S-02 soft overfill stays, including on banded runs).
- Team-size copy on list/dashboard/preview cards; `formatJoinMode` stays binary. No new column on `list_player_public_runs` RETURNS TABLE (would require DROP + CREATE).
- Treating min as “cannot start without N players.”
- Waitlists, a sibling RPC, or a second unlocked confirm writer.
- GRANT UPDATE on lifecycle stamps (`archived_at`, `extended_until`, `completed_at`, `verified_at`).
- Changing withdraw / leave / kick.
- Adding a Vitest/Jest runner.

## Implementation Approach

DB-first, three phases:

1. **Schema + RPC** — nullable `auto_join_min`, CHECK, GRANT append, freeze in `enforce_run_update_invariants`, teach `auto_join_run` `band_full`, extend invite RPCs, `npm run db:types`.
2. **Services + APIs** — parse/validate on create/edit (public insert + invite RPCs), overlay `applyToRun` (switch on RPC text; pending only on `band_full`), pending counts for banded runs, `mapRunWriteError`.
3. **UI + agent contract** — Advanced disclosure on `CreateRunForm`, detail team-size line, Join/Apply/full CTA, dashboard pending chip, `AGENTS.md`.

Keep one locked writer for auto-confirm (`auto_join_run`). App-side count must not decide confirm.

## Critical Implementation Details

**Outcome order under the existing lock** — after `FOR UPDATE` and the confirmed count, return `full` if `count >= max_participants`, else `band_full` if `auto_join_min IS NOT NULL AND count >= auto_join_min`, else insert confirmed. Never treat `band_full` as terminal in the app. Unbanded auto-join (`auto_join_min` NULL) must never emit `band_full`.

**Apply fallthrough** — Replace `applyToRun`’s `if (join_mode === "auto_join") { await autoJoinRun(); require confirmed }` block (`participants.ts:253-260`). Call `auto_join_run` when `join_mode === "auto_join" || auto_join_min != null`. Switch on the RPC text outcome in `applyToRun` (or make `autoJoinRun` return the outcome string — do **not** keep it `Promise<void>`). `confirmed` / `already_confirmed` → existing confirmed return; `band_full` (and only then) → existing pending insert, return `{ status: "pending" }`; `full` → `"This run is already full"`; other outcomes unchanged. Never run the confirmed post-check after `band_full`.

**Invite setter NULL** — do not `coalesce` `auto_join_min`. Add `p_update_auto_join_min boolean default false` plus `p_auto_join_min integer default null`, and `SET auto_join_min = CASE WHEN p_update_auto_join_min THEN p_auto_join_min ELSE auto_join_min END`. Locked edits omit both (leave unchanged). Unlocked edits pass `p_update_auto_join_min = true` even when the value is SQL NULL (clear the band). `create_invite_only_run` can take `p_auto_join_min integer default null` and INSERT it (create has no “leave unchanged”). Changing the create RPC signature requires `DROP FUNCTION` of the old argument list first.

**Grant list** — `REVOKE UPDATE` then `GRANT UPDATE` copying the current eight columns and **appending** `auto_join_min`. Forgetting this leaves RLS green and organizer save broken.

## Phase 1: Schema, RPC, grants, types

### Overview

Add the nullable min-band column and teach SQL to overlay, freeze, and distinguish band-full from max-full. Regenerated types land; app behavior stays the same until Phase 2 (existing rows are NULL; unbanded auto-join path unchanged).

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_run_auto_join_min.sql` (timestamp at implementation time; follow existing section-banner style)

**Intent**: Persist an optional auto-join minimum, keep existing runs as no-op, lock the band with join mode, and return `band_full` from the existing auto-join RPC without a third enum value.

**Contract**:

- `ALTER TABLE public.runs ADD COLUMN auto_join_min integer;` (nullable, no default — NULL = unset). No backfill.
- Table CHECK `auto_join_min IS NULL OR (auto_join_min >= 1 AND auto_join_min <= max_participants)` named so `mapRunWriteError` can match it (e.g. `runs_auto_join_min_chk`).
- **Do not** `ALTER TYPE join_mode`.
- Re-`REVOKE UPDATE ON public.runs FROM authenticated` and `GRANT UPDATE (title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility, auto_join_min)`.
- Copy live function bodies then edit. Do not start from older `CREATE OR REPLACE` copies.
- `create_invite_only_run`: DROP `(text, uuid, text, timestamptz, integer, integer, join_mode, uuid[])`. Start from live body `20260831131219:313-398` (keep the 5-cap UX pre-check). Add `p_auto_join_min integer default null` to the signature and INSERT list. Re-`REVOKE ALL` / `GRANT EXECUTE` to `authenticated` (DROP drops those grants; live grant is `20260824101006:512-517`).
- `set_run_visibility_and_invites`: DROP the current 10-arg list `(uuid, run_visibility, uuid[], text, uuid, text, timestamptz, integer, integer, join_mode)`. Start from live body `20260824101006:519-599`. Add `p_update_auto_join_min boolean default false` and `p_auto_join_min integer default null`; SET `auto_join_min = CASE WHEN p_update_auto_join_min THEN p_auto_join_min ELSE auto_join_min END` (do not coalesce). Re-`GRANT EXECUTE` to `authenticated` (live grant `20260824101006:601-624`).
- Freeze trigger: copy `enforce_run_update_invariants` from `20260820124849:51-89` including `new.updated_at := now()` and change-gated `capacity_below_confirmed`. Add `auto_join_min` distinct-from lock using the same `join_mode_locked` exception as join_mode (non-organizer `run_participants` row).
- `CREATE OR REPLACE auto_join_run`: keep `FOR UPDATE`, nickname/ban/existing-participation, and `full` at max. Replace the join-mode-only gate with: allow when `join_mode = auto_join OR auto_join_min IS NOT NULL`; else `not_auto_join`. After the max check, if `auto_join_min IS NOT NULL AND v_confirmed_count >= auto_join_min` return `band_full`. Signature stays `(p_run_id uuid) returns text`. Re-grant `EXECUTE` to `authenticated` only.
- Do not DROP/CREATE `list_player_public_runs`.

Non-obvious outcome order (implementer must not reverse these two IFs):

```sql
if v_confirmed_count >= v_run.max_participants then
  return 'full';
end if;
if v_run.auto_join_min is not null
   and v_confirmed_count >= v_run.auto_join_min then
  return 'band_full';
end if;
```

#### 2. Generated types

**File**: `src/types/database.ts` (via `npm run db:types`)

**Intent**: Make the new column and RPC args visible to supabase-js without hand-editing.

**Contract**: `runs.Row` / `Insert` / `Update` include `auto_join_min: number | null`. `Enums.join_mode` remains `"approval_required" | "auto_join"`. `auto_join_run` still `{ Args: { p_run_id: string }; Returns: string }`. Invite function Args include the new parameters.

### Success Criteria:

#### Automated Verification:

- Local migration applies (`npx supabase migration up` or `npx supabase db reset` against the local stack).
- `npm run db:types` — `auto_join_min` on `runs`; `join_mode` enum still two values; invite RPC Args include `p_auto_join_min` / `p_update_auto_join_min`.
- `npm run lint` on the regenerated types file.

#### Manual Verification:

- SQL: two concurrent `auto_join_run` calls at the last min-band seat → one `confirmed`, one `band_full` (not `full`).
- SQL: `auto_join_min` NULL and `join_mode = auto_join` still returns `full` at max and never `band_full`.
- Authenticated UPDATE can write `auto_join_min` (grant list includes it).
- After DROP, `create_invite_only_run` / `set_run_visibility_and_invites` still `EXECUTE` for authenticated; create still has the 5-cap UX pre-check.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Apply overlay, create/edit APIs, pending counts

### Overview

Wire the column through create/edit (public + invite-only) and make apply overlay the min band using `band_full` fallthrough. Unbanded paths stay as today. No Advanced UI yet — APIs accept `auto_join_min` from form data (empty = NULL).

### Changes Required:

#### 1. Parse helpers

**File**: `src/lib/run-limits.ts`

**Intent**: One island-safe parser for optional min so form and APIs share messages.

**Contract**: Empty/whitespace → `null`. Otherwise a whole number `1 … maxParticipants`. Reject `0`, negatives, non-integers, and `min > max` with explicit user-facing strings (not `Error.message`). Do not treat `0` as unset.

#### 2. Run DTOs and dashboard pending

**File**: `src/lib/services/runs.ts`

**Intent**: Carry `autoJoinMin` on mapped runs and count pending on banded auto-join runs.

**Contract**: Add `auto_join_min` to `RUN_SELECT` / `RunRow` / `runFieldsFromRow` / `RunListItem` as `autoJoinMin: number | null`. Set `auto_join_min: null` on the `RunRow` built in `runRowFromPublicRpc` (`runs.ts:500-536`). Do not DROP/CREATE `list_player_public_runs`. `pendingIds` for organizer dashboard include rows where `join_mode === "approval_required" || auto_join_min != null`. `formatJoinMode` stays two-valued (no hybrid phrase). `mapRunWriteError`: `join_mode_locked` copy covers team-size; match `runs_auto_join_min_chk` to a capacity-vs-min message.

#### 3. Create / edit prepare + writers

**Files**: `src/lib/services/runs.ts` (`prepareOwnedActiveRunPatch`, `createInviteOnlyRun`, `updateRun`, `setRunVisibilityAndInvites`); `src/pages/api/runs/index.ts`; `src/pages/api/runs/[id]/index.ts`

**Intent**: Persist the optional band on every organizer write path; freeze it with join mode.

**Contract**: Parse `auto_join_min` against parsed capacity. Unlocked: write `number | null`. Locked (any non-organizer participant): omit from PostgREST patch and omit invite `p_update_auto_join_min` (same gate as `joinMode`). If capacity changes while a stored min exists, reject when new max < min (CHECK backstop). Public `.insert()` includes `auto_join_min`. `createInviteOnlyRun` passes `p_auto_join_min`. Invite edit passes `p_update_auto_join_min: true` and `p_auto_join_min` when unlocked. Edit API reads `formString(..., "auto_join_min")` (empty when the locked field omitted `name`).

#### 4. Apply overlay

**File**: `src/lib/services/participants.ts`

**Intent**: Auto-confirm under the band for any `join_mode`; pending-insert when the band is full but max is not.

**Contract**: `loadActiveRunForMutation` selects and returns `auto_join_min`. Replace the `applyToRun` block at `participants.ts:253-260` (`if (join_mode === "auto_join") { await autoJoinRun(); require confirmed }`). Call `auto_join_run` when `join_mode === "auto_join" || auto_join_min != null`. Switch on the text outcome in `applyToRun` (or make `autoJoinRun` return the outcome string — do **not** keep it `Promise<void>`). Mapping:

- `confirmed` / `already_confirmed` → existing confirmed return (`{ status: "confirmed", participantId }`)
- `band_full` (and only then) → existing pending insert, return `{ status: "pending" }`
- `full` → `"This run is already full"`
- other outcomes unchanged (`already_pending`, `denied`, `no_nickname`, `not_active`, default generic fail)

Never run the confirmed post-check (`getOwnParticipation` require `status === "confirmed"`) after `band_full`. `autoJoinRun` is only called from `applyToRun`. `POST /api/runs/[id]/apply` already maps `ParticipantError.message` vs generic fail — no new leak of PostgREST into `?error=`. Accept / `decideParticipant` unchanged.

Non-obvious overlay (do not wrap today’s void helper and keep `:255-258`):

```ts
if (run.join_mode === "auto_join" || run.auto_join_min != null) {
  const outcome = await autoJoinRun(supabase, runId); // must return string, not void
  if (outcome === "confirmed" || outcome === "already_confirmed") {
    // existing confirmed return (post-check / participantId fetch is OK here)
  } else if (outcome === "band_full") {
    // fall through to existing pending insert — never the confirmed post-check
  }
  // full / already_pending / denied / … already thrown or mapped as today
}
```

### Success Criteria:

#### Automated Verification:

- `npm run lint`
- `npm run build`

#### Manual Verification:

- Approval required + min 2, capacity 4: second player confirms via apply; third is pending.
- Unbanded auto-join still confirms until max; next apply is `"This run is already full"` (not pending).
- Create/edit API rejects min `0`, min > capacity; empty field stores NULL.
- After a non-organizer row, edit cannot change `auto_join_min` (trigger + omitted field).
- Invite-only create persists `auto_join_min`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Advanced UI, detail CTA, dashboard chip, AGENTS.md

### Overview

First occupant of Advanced settings on the shared create/edit form. Detail explains the overlay without a third join-mode label. Applicant CTA matches the fill rule. Dashboard shows pending on banded auto-join runs.

### Changes Required:

#### 1. Create / edit form

**Files**: `src/components/runs/CreateRunForm.tsx`; `src/pages/runs/[id]/edit.astro`

**Intent**: Optional min under a collapsed Advanced disclosure; default join-mode select stays two options; lock UX matches join mode.

**Contract**: After the join-mode control, a disclosure labeled “Advanced settings” (collapsed by default; open on edit when `autoJoinMin != null`). Number input `id`/`name` `auto_join_min` unless `joinModeLocked`, then omit `name` and disable (same as join mode). Empty = unset. Client `validate` uses the Phase 2 helper vs current capacity. Hint: organizer counts toward N. Pass `autoJoinMin` on `CreateRunFormEditValues`. Do not move Capacity into Advanced. Closest disclosure pattern: `RunListFilters.astro` extra-filters toggle — a `<details>` or equivalent `aria-expanded` is fine. Locked helper copy mentions join mode **and** team-size.

#### 2. Run detail + applicant island

**Files**: `src/pages/runs/[id].astro`; `src/components/runs/RunParticipantActions.tsx`

**Intent**: Show the overlay on detail; CTA is Join under the band, Apply after the band, full only at max.

**Contract**: Keep Join mode DL as `formatJoinMode(run.joinMode)`. When `autoJoinMin != null`, add a DL row such as “Auto-join first N”. Pass `autoJoinMin` into the island. Full disable when `confirmedCount >= maxParticipants` **and** (`autoJoinMin != null` || `joinMode === "auto_join"`). CTA label Join when a band is set and `confirmedCount < autoJoinMin`, or when unbanded auto-join; otherwise Apply. Band-full must not hide Apply. Approval without a band keeps Apply with no full gate. Organizer pending/denied lists already load for any organizer — leave that.

#### 3. Dashboard pending chip

**File**: `src/components/runs/DashboardRunCard.astro`

**Intent**: Surface pending on auto-join runs that have a band.

**Contract**: Show the pending chip when `pendingCount > 0` and not archived and (`joinMode === "approval_required"` **or** `autoJoinMin != null`). Do not add a team-size line on this card (or `ActiveRunCard` / `RunPreviewCard`).

#### 4. Agent contract

**File**: `AGENTS.md`

**Intent**: Record S-26 invariants so later slices do not add a third join mode or drop the column from the grant list.

**Contract**: Document: team-size lives under Advanced; default join control stays approval vs auto-join; `auto_join_min` NULL = unset; no `ALTER TYPE join_mode`; overlay when set (organizer counts); `band_full` ≠ `full`; freeze with join mode; GRANT UPDATE must include `auto_join_min`; invite RPCs take the column; Accept stays soft overfill.

### Success Criteria:

#### Automated Verification:

- `npm run lint`
- `npm run build`
- `AGENTS.md` states the invariants above.

#### Manual Verification:

- Create form: Join mode still two options; Advanced collapsed; empty min omitted; setting min 2 works for public and invite-only.
- Detail shows “Approval required” plus “Auto-join first 2” (not a hybrid join-mode phrase). Cards still show binary join mode only.
- Second player sees Join and lands confirmed; third sees Apply and lands pending; at max the CTA is disabled full.
- After the first non-organizer apply, edit disables join mode and team-size together.
- Dashboard pending chip appears on an auto-join run once the band is filled and someone is pending.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`. Put shared parse rules in `run-limits.ts` so form and API cannot drift.

### Integration Tests:

- None automated. Phase 1 SQL checks stand in for the last-slot race (two `auto_join_run` calls under one min-band seat).

### Manual Testing Steps:

1. Create public run, default join = Approval required, Advanced empty → apply is pending (today).
2. Create public run, Approval required, Advanced min 2, capacity 4 → organizer 1/4; player B Join → confirmed 2/4; player C Apply → pending; Accept still warns and can overfill at 4/4.
3. Create auto-join with no Advanced → Join until max → next click “This run is already full.”
4. Create auto-join + min 2, capacity 4 → Join, then Apply, then full at 4.
5. Invite-only create with a min; edit before anyone applies can clear the min (NULL); after a friend applies, both join mode and min are frozen.
6. Lower capacity below a stored min while unlocked → rejected; grandfather >64 capacity still works if unchanged (S-25).

## Performance Considerations

`auto_join_run` already locks one `runs` row per apply. The extra `auto_join_min` comparison is in-row. Dashboard pending fetch grows only by banded auto-join run ids, not a table scan.

## Migration Notes

- NULL default is a no-op backfill; existing runs keep today’s join mode.
- Rollback: drop the column after reversing RPC/trigger/grant to the eight-column list. No enum change to revert.
- Direct PostgREST can set `auto_join_min` once granted (same class as capacity > 64). App + CHECK are the product guards.
- YOLO skips Progress Manual rows; they remain the human checklist.

## References

- Related research: `context/changes/team-size-scope/research.md`
- Roadmap S-26 / prd-v2 FR-005, FR-025, FR-026, US-01
- Live `auto_join_run`: `supabase/migrations/20260901083008_complete_clan_run.sql:78-155`
- Grant list: `supabase/migrations/20260901102315_verify_clan_run_finish.sql:144-154`
- Apply branch: `src/lib/services/participants.ts:160-284` (`autoJoinRun` void + `applyToRun` confirmed post-check `:253-260`)
- Public RPC mapper: `src/lib/services/runs.ts:500-536` (`runRowFromPublicRpc`)
- Invite create live body: `supabase/migrations/20260831131219_manual_archive_and_extend.sql:313-398`
- Invite setter live body + EXECUTE grants: `supabase/migrations/20260824101006_restricted_run_visibility.sql:512-624`
- Join-mode lock: `supabase/migrations/20260820124849_runs_update_active_invariants.sql:51-89`
- Lessons: never forward PostgREST/`Error.message` into `?error=`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RPC, grants, types

#### Automated

- [x] 1.1 Local migration applies (`npx supabase migration up` or `npx supabase db reset`) — 7d31915
- [x] 1.2 `npm run db:types` — `auto_join_min` on `runs`; `join_mode` still two values; invite RPC Args updated — 7d31915
- [x] 1.3 `npm run lint` on regenerated types — 7d31915

#### Manual

- [ ] 1.4 SQL: concurrent `auto_join_run` at last min-band seat → one `confirmed`, one `band_full`
- [ ] 1.5 SQL: NULL min + auto_join still `full` at max, never `band_full`
- [ ] 1.6 Authenticated UPDATE can write `auto_join_min`
- [ ] 1.7 After DROP, invite RPCs still EXECUTE for authenticated; create keeps 5-cap pre-check

### Phase 2: Apply overlay, create/edit APIs, pending counts

#### Automated

- [x] 2.1 `npm run lint`
- [x] 2.2 `npm run build`

#### Manual

- [ ] 2.3 Approval + min 2: second player confirms, third pending
- [ ] 2.4 Unbanded auto-join still full-stops at max (no pending)
- [ ] 2.5 API rejects min 0 / min > capacity; empty stores NULL
- [ ] 2.6 Locked edit cannot change `auto_join_min`
- [ ] 2.7 Invite-only create persists `auto_join_min`

### Phase 3: Advanced UI, detail CTA, dashboard chip, AGENTS.md

#### Automated

- [ ] 3.1 `npm run lint`
- [ ] 3.2 `npm run build`
- [ ] 3.3 `AGENTS.md` documents S-26 invariants

#### Manual

- [ ] 3.4 Advanced collapsed; default form still two join-mode options
- [ ] 3.5 Detail team-size line; cards stay binary `formatJoinMode`
- [ ] 3.6 CTA Join under band, Apply after, full only at max
- [ ] 3.7 Join mode and team-size freeze together after first non-organizer apply
- [ ] 3.8 Dashboard pending chip on auto-join + band
