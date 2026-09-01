---
date: 2026-09-01T15:29:45+02:00
researcher: Cursor Agent (for Miigget)
git_commit: 135a506676564c6fcd76c981dda4bd64556911e6
branch: main
repository: book_your_miggets
topic: "Map the current join/capacity surface so a later plan can add min auto-join / max approval bands under Advanced settings without a third default-form join mode and without reintroducing last-slot double-confirm"
tags: [research, codebase, join-mode, auto-join, apply-approve, capacity, advanced-settings, team-size-scope, S-26]
status: complete
last_updated: 2026-09-01
last_updated_by: Cursor Agent (for Miigget)
---

# Research: Join/capacity surface for team-size bands (S-26)

**Date**: 2026-09-01T15:29:45+02:00
**Researcher**: Cursor Agent (for Miigget)
**Git Commit**: 135a506676564c6fcd76c981dda4bd64556911e6
**Branch**: main
**Repository**: book_your_miggets

## Research Question

Map the current join/capacity surface so a later plan can add min auto-join / max approval bands under Advanced settings without a third default-form join mode and without reintroducing last-slot double-confirm.

Cover:

1. Create and edit: `join_mode` field, whether Advanced settings already exists, `max_participants`, where organizer picks approval vs auto-join.
2. Apply and accept: `applyToRun`, `auto_join_run` RPC, organizer Accept, capacity races, soft overfill.
3. Schema: `runs` columns, `join_mode` type, RLS/grants/triggers that would need a new min-band column; authenticated UPDATE grant list.
4. UI: run detail roster, filled/capacity, how join mode is displayed to applicants.
5. Historical lessons from apply-and-approve-participants, auto-join-mode, edit-run, run-create-limits (capacity floor, `auto_join_run` locking, no PostgREST `Error.message` in query strings, S-25 form+API only guards).

## Summary

- **Join mode is binary and lives on the default create/edit form.** `join_mode` is a Postgres enum `('approval_required', 'auto_join')`. The organizer picks it from a two-option `<select>` on the shared `CreateRunForm` (create default `approval_required`, capacity default 64). There is **no third join mode** and **no Advanced settings UI** in `src/` — S-25 explicitly left Advanced empty so S-26 is its first occupant.
- **Capacity is `max_participants` only.** Confirmed roster count is app-side. Auto-join hard-caps at `max_participants` inside `auto_join_run` (`SELECT … FOR UPDATE` on `runs`). Organizer Accept still **soft-overfills** (client `confirm()`, no server check) — a deliberate S-02 decision that S-05 left alone.
- **Last-slot safety exists only on the auto-join RPC path.** Concurrent Accepts can both confirm past max. A min-band hybrid that auto-confirms via an unlocked app-level count, or that maps “band full” to today’s terminal `"This run is already full"`, **will** reintroduce a last-slot double-confirm or a false full-stop. The safe seam: keep the run-row lock; treat band-full ≠ max-full; fall through to pending insert when the min band is filled but `max_participants` remains.
- **A new min-band column must join the authenticated UPDATE grant list** (currently eight columns). Do **not** `ALTER TYPE join_mode`. Invite-only create/edit RPCs and `enforce_run_update_invariants` are the other SQL touchpoints if organizers can set/edit the band.
- **UI shows confirmed-only filled/max and a binary join-mode label.** Applicants see “Join run” vs “Apply to join”; auto-join hides the CTA when `confirmedCount >= max`. Hybrid bands need copy on that island (and optionally detail/list labels) without adding a third radio on the default form.

## Detailed Findings

### 1. Create and edit — join mode, capacity, no Advanced

**Shared form.** Create (`src/pages/runs/new.astro`) and edit (`src/pages/runs/[id]/edit.astro`) both mount [`CreateRunForm.tsx`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/CreateRunForm.tsx). POST action is `/api/runs` vs `/api/runs/{id}` ([L188–190](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/CreateRunForm.tsx#L188-L190)).

**Where the organizer picks approval vs auto-join.** A default-form `<select id="join_mode">` with exactly two options ([L309–333](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/CreateRunForm.tsx#L309-L333)):

- `approval_required` → “Approval required”
- `auto_join` → “Auto join”

Type [`CreateRunFormJoinMode`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/CreateRunForm.tsx#L27) and [`JOIN_MODES`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/runs.ts#L769-L773) are the same pair. Create default is `"approval_required"` ([L97](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/CreateRunForm.tsx#L97)); DB default matches ([`20260729134008_run_domain_schema.sql:9,32`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260729134008_run_domain_schema.sql#L9)).

**Capacity.** `FormField id="max_participants"` on the default form ([L278–291](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/CreateRunForm.tsx#L278-L291)). Create default `DEFAULT_RUN_CAPACITY = 64`; changeable range 1–64; grandfather >64 if unchanged ([`src/lib/run-limits.ts`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/run-limits.ts#L1-L32)). S-25 put these guards on the **existing Capacity / Starts-at fields**, not under Advanced.

**Advanced settings: absent.** No “Advanced” copy, `<details>`, Accordion, or Collapsible under `src/components/runs/`. The closest disclosure pattern in the app is the extra-filters toggle on [`RunListFilters.astro`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/RunListFilters.astro#L44-L75) (`aria-expanded` + `grid-rows-[0fr]/[1fr]`).

**Join-mode lock on edit.** UI: any non-organizer `run_participants` row (any status) sets `joinModeLocked` ([`edit.astro` L47–61](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/runs/%5Bid%5D/edit.astro#L47-L61)); the select is disabled and **omits `name`**, so POST sends empty `join_mode`. Service: `prepareOwnedActiveRunPatch` omits `join_mode` from the write when locked ([`runs.ts` L1083–1089](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/runs.ts#L1083-L1089)); `updateRun` only patches `join_mode` when prepared ([L1326–1328](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/runs.ts#L1326-L1328)). DB backstop: `join_mode_locked` in `enforce_run_update_invariants`. Organizer’s own auto-seat does **not** lock.

**Capacity floor on edit.** App: if `max_participants` **changes** and the new value is below confirmed count → `RunError("Capacity cannot be below the confirmed roster")` ([L1079–1081](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/runs.ts#L1079-L1081)). Trigger: same rule, only when the column actually changes (so an already-overfilled run can still save title/map). Floor is **confirmed only**, not pending.

**APIs.**

| Path | Join mode | Capacity |
|------|-----------|----------|
| [`POST /api/runs`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/api/runs/index.ts) | `isJoinMode` required; passed to `.insert()` or `createInviteOnlyRun` | parse → `isAllowedRunCapacity` |
| [`POST /api/runs/[id]`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/api/runs/%5Bid%5D/index.ts) | deferred to `prepareOwnedActiveRunPatch` | same + roster floor |
| Invite-only | RPC `create_invite_only_run` / `set_run_visibility_and_invites` take `p_join_mode` and `p_max_participants` | same validators |

There is no `createRun()` helper — public create is an inline insert; invite-only is the RPC.

### 2. Apply and accept — RPC lock, soft Accept, race seams

**`applyToRun`** ([`participants.ts` L222–284](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/participants.ts#L222-L284)):

1. `ensureOwnProfile`
2. `loadActiveRunForMutation` (audience-active + not completed)
3. Nickname gate
4. Existing participation → pending / confirmed / denied messages (no re-apply)
5. **`join_mode === "auto_join"` → `autoJoinRun` RPC only** (must end confirmed; no pending fallthrough)
6. Else `INSERT status = 'pending'` (member RLS forbids self-`confirmed`)

Endpoint: [`POST /api/runs/[id]/apply`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/api/runs/%5Bid%5D/apply.ts). `ParticipantError.message` → `?error=` via `runFail`; unexpected errors are logged and replaced with `"Could not apply to this run"` ([L34–39](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/api/runs/%5Bid%5D/apply.ts#L34-L39)). Apply does **not** leak PostgREST into the query string.

**`autoJoinRun` outcome map** ([L190–219](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/participants.ts#L190-L219)):

| RPC outcome | Client |
|-------------|--------|
| `confirmed`, `already_confirmed` | success (idempotent) |
| `full` | `"This run is already full"` (**terminal**) |
| `already_pending` | `"You already applied to this run"` |
| `denied` | denied message |
| `no_nickname` | nickname gate |
| `not_active` | not found / inactive |
| `not_auto_join` / `banned` / `not_authenticated` / unknown | `"Could not apply to this run"` (logged) |

**`auto_join_run` live body** is the last `CREATE OR REPLACE` in [`20260901083008_complete_clan_run.sql` L78–155](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260901083008_complete_clan_run.sql#L78-L155) (`SECURITY DEFINER`, `search_path = ''`). Order:

1. `not_authenticated` / `banned`
2. `SELECT * FROM runs … FOR UPDATE` (serializes concurrent applies per run)
3. `not_active` if missing / `!is_run_roster_open_row` / `!can_view_run`
4. `not_auto_join` if `join_mode <> 'auto_join'`
5. `no_nickname` / existing participation (`already_pending` | `already_confirmed` | `denied`)
6. `count(confirmed) >= max_participants` → **`full`**
7. `INSERT confirmed` → `confirmed`

Grants: `revoke all from public; grant execute to authenticated` (introduced in `20260807123643_auto_join_run_rpc.sql`, re-granted with visibility). Types: [`auto_join_run: { Args: { p_run_id: string }; Returns: string }`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/types/database.ts#L725).

**Organizer Accept** ([`decideParticipant` L397–457](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/participants.ts#L397-L457)): organizer check, block confirmed→denied, CAS `.in("status", ["pending", "denied"])`. **No capacity check, no `FOR UPDATE`.** UI soft-warn only ([`RunParticipantActions.tsx` L221–226](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/RunParticipantActions.tsx#L221-L226)). `join_mode` is loaded but unused — Accept still works on auto-join runs (e.g. denied → accept).

**`loadActiveRunForMutation`** ([L160–187](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/participants.ts#L160-L187)) selects `join_mode` plus lifecycle stamps but **returns only `{ id, join_mode, organizer_id }`** — not `max_participants`. Active window is S-24: `archived_at` null and (`extended_until` null or not elapsed); no 1-hour grace ([`isRunActive`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/run-lifecycle.ts#L24-L36)). Completed clan runs freeze roster via `completed_at` / `is_run_roster_open_row`.

**Withdraw / leave / kick** ignore `join_mode`. Safe to leave alone for S-26.

**Capacity races (what the plan must not undo):**

| Path | Lock | Cap check | Last-slot safe? |
|------|------|-----------|-----------------|
| Concurrent auto-joins | `runs FOR UPDATE` | `count >= max_participants` | Yes — second gets `full` |
| Concurrent Accepts | none | none | No — S-02 soft overfill |
| Auto-join vs Accept same last seat | lock only on RPC | Accept ignores cap | Accept can overfill |
| Pending insert | uniqueness only | n/a | Unlimited pending |

**Hybrid min-band implication.** If auto-join uses `count < min` **with the existing lock**, the last **min-band** seat stays race-safe. After the band is full, applicants must **pending-insert**, not abort as `full`, unless `count >= max`. Mapping today’s `full` to a hard fail at the min band would stop Apply too early. An unlocked “if count < min then RPC else pending” branch can send two requests into the RPC at the boundary — the lock still serializes, but the **loser must fall through to pending**, not to `"This run is already full"`. Do not add a second unlocked confirm writer.

### 3. Schema — columns, enum, grants, triggers

**`join_mode` enum** — never `ALTER TYPE`’d ([`20260729134008:9`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260729134008_run_domain_schema.sql#L9)): `'approval_required' | 'auto_join'`. Generated [`Enums.join_mode`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/types/database.ts#L835) matches. **Do not add a third enum value** — that would become a third default-form mode.

**`runs` capacity-related columns today:** `max_participants integer not null check (> 0)` (no 64 CHECK — S-25 is form+API only) and `min_points` (unrelated to team-size). **No** `team_size`, `min_auto_*`, or band column.

**Authenticated UPDATE grant list** — latest rewrite [`20260901102315_verify_clan_run_finish.sql` L144–154](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260901102315_verify_clan_run_finish.sql#L144-L154):

```sql
revoke update on table public.runs from authenticated;
grant update (
  title,
  map_id,
  map_category,
  starts_at,
  max_participants,
  min_points,
  join_mode,
  visibility
) on table public.runs to authenticated;
```

Closed to authenticated UPDATE: `id`, `organizer_id`, `archived_at`, `extended_until`, `completed_at`, `verified_at`, `created_at`, `updated_at` (trigger stamps `updated_at` as DEFINER). A new min-band column **must be appended to this GRANT** or organizer/admin PostgREST UPDATE cannot write it even when RLS passes. Table INSERT stays all-columns; a nullable/`DEFAULT` column does not need an INSERT grant change.

**RLS on `runs` is row-scoped** (active window, visibility, organizer, admin). A new column does not need a new policy unless write rules differ.

**Triggers on `runs`:**

| Trigger | Role for S-26 |
|---------|----------------|
| `seat_organizer_on_run_insert` | Organizer occupies one **confirmed** seat at create — counts toward min band and filled/max |
| `enforce_organizer_active_run_cap` | Unrelated (5-cap) |
| `enforce_run_update_invariants` ([`20260820124849` L51–89](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260820124849_runs_update_active_invariants.sql#L51-L89)) | `join_mode_locked`; `capacity_below_confirmed` only when `max_participants` changes. Product may freeze the min-band with join_mode and/or CHECK `min <= max` / floor vs confirmed |

**`run_participants`:** `unique (run_id, user_id)`; INSERT policy `run_participants_insert_self_pending` forces `status = 'pending'` + `can_view_run`. Confirmed inserts stay DEFINER (`auto_join_run`, organizer seat).

**Other SQL writers if invite-only should set the band:**

- `create_invite_only_run` INSERT list includes `max_participants`, `min_points`, `join_mode` ([`20260831131219` ~L318–387](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260831131219_manual_archive_and_extend.sql#L318-L387))
- `set_run_visibility_and_invites` UPDATE `join_mode = coalesce(p_join_mode, join_mode)` ([`20260824101006` ~L584–586](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260824101006_restricted_run_visibility.sql#L584-L586))
- `list_player_public_runs` RETURNS TABLE includes `max_participants`, `join_mode` — adding a returned column needs DROP + CREATE

**Migration must-touch list (keep enum at two values):**

1. `ALTER TABLE runs ADD COLUMN` + CHECKs (`>= 0`/`NULL` = unset, `<= max_participants`)
2. Re-`REVOKE`/`GRANT UPDATE` copying the eight columns and **appending the new one**
3. Optionally `CREATE OR REPLACE enforce_run_update_invariants` (freeze / floor)
4. Optionally extend invite RPCs
5. Teach `auto_join_run` the band (new outcome or overload `full` with app fallthrough — plan choice)
6. `npm run db:types`

Do not GRANT UPDATE on lifecycle stamps.

### 4. UI — roster, filled/capacity, applicant join-mode display

**Run detail** ([`src/pages/runs/[id].astro`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/runs/%5Bid%5D.astro)): Capacity `{confirmedCount}/{run.maxParticipants}` ([L240–243](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/runs/%5Bid%5D.astro#L240-L243)); Join mode `formatJoinMode(run.joinMode)` ([L250–251](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/runs/%5Bid%5D.astro#L250-L251)). Confirmed roster from `listConfirmedParticipants`; pending/denied only for organizer on an active run. Island props include `joinMode`, `maxParticipants`, confirmed/pending/denied lists — **no min-band prop**.

**`formatJoinMode`** ([`runs.ts` L131–141](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/runs.ts#L131-L141)): `"Approval required"` / `"Auto join"`. Exhaustive on the two-value enum.

**Applicants** ([`RunParticipantActions.tsx`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/RunParticipantActions.tsx)): the island does **not** reprint the join-mode label (detail DL already did). It branches on `joinMode === "auto_join"`:

- CTA: “Join run” vs “Apply to join” ([L388–394](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/RunParticipantActions.tsx#L388-L394))
- `autoJoinFull = isAutoJoin && confirmedCount >= maxParticipants` ([L76–77](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/RunParticipantActions.tsx#L76-L77)) → disabled “This run is full” ([L326–333](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/RunParticipantActions.tsx#L326-L333))
- Approval mode has **no** full gate — Apply stays available when confirmed ≥ max (soft overfill on Accept)
- Guests: “Sign in to apply…” even on auto-join runs
- Organizer pending + Accept-anyway confirm; denied list can still Accept
- Roster: confirmed only; `(organizer)` badge; Kick for non-organizer confirmed

**Filled math is confirmed-only everywhere** (`confirmedCountsForRuns`, detail `.length`, edit floor). Pending is a separate dashboard chip **only** when `joinMode === "approval_required"`. Organizer auto-seat means a new run starts at **1/max**.

**Other labels:** `ActiveRunCard.astro`, `DashboardRunCard.astro`, `RunPreviewCard.astro` (home + player Incoming/Recent), `RunListFilters.astro` join-mode filter, `admin/users/[id].astro` past runs. Create form options duplicate the helper strings rather than calling `formatJoinMode`.

**Surfaces that must explain mixed bands without a third default-form control:** `CreateRunForm` (new Advanced disclosure + band fields; keep the two-option Join mode select), detail DL + `RunParticipantActions` (Join vs Apply vs band-full vs max-full), optionally cards/`formatJoinMode` if hybrid needs a one-line label.

### 5. Historical lessons (named archives)

**Capacity floor (edit-run, apply-and-approve).** S-02 shipped **soft overfill on Accept** (warn, still UPDATE). Edit-run floor is **confirmed count only**, and the trigger fires **only when `max_participants` changes** so an already-overfilled run can still save other fields (`capacity_below_confirmed`). Pending does not occupy capacity. Organizer seat counts as confirmed.

**`auto_join_run` locking (auto-join-mode).** Roadmap’s one product race is concurrent last-slot auto-joins. Chosen mechanism: DEFINER RPC + `FOR UPDATE` on `runs` + count + insert in one transaction. Rejected: RLS WITH CHECK (snapshot race), BEFORE INSERT trigger (would fire on Accept and break soft overfill), serializable isolation (not per-request via PostgREST). RPC returns **discriminated text**, not exceptions, so the app never puts raw DB text in `?error=`. Capacity scope was **auto-join only**; Accept stayed soft. Denied users stay blocked (`unique` + non-deletable denied). `already_confirmed` is idempotent success under the lock.

**No PostgREST `Error.message` in query strings (lessons.md + all four archives).** Domain failures are `ParticipantError` / `RunError` with user-facing copy. Infra errors: `console.error` + generic message. Apply already follows this; any new band-full outcome must map to an intentional string, not `error.message`.

**S-25 form+API only guards (run-create-limits).** Capacity default/max 64 and schedule ≤1 year live on the **existing Capacity and Starts-at fields** — no migration, no Postgres CHECK, no Advanced dump (1-minute create guardrail). Existing >64 grandfathered until changed. Team-size (S-26) was explicitly **out of scope**. Invite-only create uses the same API helpers. Direct PostgREST can still write capacity > 64 (accepted).

**S-26 placement (roadmap + PRD).** Risk: “a third join mode on the default form would break the 1-minute create guardrail; Advanced settings is the PRD’s resolution. Concurrent last-slot races already exist in auto-join — bands must not reintroduce a double-confirm.” FR-005: production join control stays approval vs auto-join; team-size lives under Advanced. FR-026: auto-join still fills when allowed **except** where team-size puts remaining slots on approval.

## Code References

- [`src/components/runs/CreateRunForm.tsx:97,278-333`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/CreateRunForm.tsx#L97) — create defaults; Capacity field; two-option Join mode select; lock helper copy
- [`src/lib/run-limits.ts:1-32`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/run-limits.ts#L1-L32) — default/max 64, grandfather, messages
- [`src/lib/services/runs.ts:131-141,769-773,1079-1089,1326-1328`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/runs.ts#L131-L141) — `formatJoinMode`, `JOIN_MODES`/`isJoinMode`, capacity floor + join-mode omit, `updateRun` patch
- [`src/lib/services/participants.ts:160-284,397-457`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/services/participants.ts#L160-L187) — `loadActiveRunForMutation`, `autoJoinRun` map, `applyToRun` branch, `decideParticipant` CAS / no cap
- [`src/pages/api/runs/[id]/apply.ts:29-39`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/api/runs/%5Bid%5D/apply.ts#L29-L39) — `ParticipantError` vs generic fail
- [`src/components/runs/RunParticipantActions.tsx:76-77,221-226,326-394`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/components/runs/RunParticipantActions.tsx#L76-L77) — full gate, Accept confirm, Join vs Apply
- [`src/pages/runs/[id].astro:240-251`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/runs/%5Bid%5D.astro#L240-L251) — Capacity + Join mode DL
- [`src/pages/runs/[id]/edit.astro:47-61`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/pages/runs/%5Bid%5D/edit.astro#L47-L61) — `joinModeLocked` from non-organizer rows
- [`supabase/migrations/20260729134008_run_domain_schema.sql:9,30`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260729134008_run_domain_schema.sql#L9) — enum + `max_participants > 0`
- [`supabase/migrations/20260820124849_runs_update_active_invariants.sql:51-89`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260820124849_runs_update_active_invariants.sql#L51-L89) — join-mode lock + capacity floor trigger
- [`supabase/migrations/20260901083008_complete_clan_run.sql:78-155`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260901083008_complete_clan_run.sql#L78-L155) — live `auto_join_run`
- [`supabase/migrations/20260901102315_verify_clan_run_finish.sql:144-154`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/supabase/migrations/20260901102315_verify_clan_run_finish.sql#L144-L154) — authenticated UPDATE grant list
- [`src/types/database.ts:725,835`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/types/database.ts#L725) — RPC typing + enum
- [`src/lib/run-lifecycle.ts:24-36`](https://github.com/Miigget/book_your_miggets/blob/135a506676564c6fcd76c981dda4bd64556911e6/src/lib/run-lifecycle.ts#L24-L36) — audience-active (no 1h grace)

## Architecture Insights

- **Keep `join_mode` as the default control; put bands beside it, not instead of it.** PRD FR-005 / US-01 / roadmap S-26: production picker stays approval vs auto-join; team-size is optional under Advanced. Adding a third enum value or a third `<option>` on the default select is the failure mode the roadmap names.
- **Fill rule when a min band is set (PRD business logic):** auto-join fills only the min band; remaining slots up to `max_participants` need approval; otherwise today’s `join_mode`. Organizer auto-seat already occupies one confirmed seat, so `min = 1` means every later player needs approval. Plan should treat the organizer as counting toward the min band.
- **Single locked writer for auto-confirm.** Reuse `auto_join_run`’s `FOR UPDATE` (new threshold = min band when set). Introduce an outcome the app can distinguish from max-full (new token such as `band_full`, or keep `full` only for max and add `band_full`). `applyToRun` must: RPC while under band; on band-full → **same pending insert as approval mode**; on max-full → existing `"This run is already full"`. Do not treat band-full as terminal.
- **Do not silently harden Accept.** S-02 soft overfill is still live. Roadmap “double-confirm” is the **auto-join last-slot race**, not Accept overfill. Changing Accept needs an explicit plan decision.
- **Grant list is the silent breaker.** Every new organizer-writable `runs` column since edit-run has been appended via `REVOKE` + `GRANT UPDATE (…, new)`. Forgetting the column leaves RLS green and the UPDATE a no-op/error.
- **Join-mode lock after any non-organizer row** is the template if changing the min band mid-roster would desync pending vs auto-join applicants. Capacity floor stays confirmed-only and change-gated.
- **S-25 vs S-26 homes:** 64/year stay on the flat Capacity/Starts-at fields; Advanced is reserved for extra/new options (team-size first). Do not move capacity into Advanced.
- **Error contract:** new RPC outcomes → `ParticipantError` strings; never `Error.message` in `?error=`.
- **Invite-only and public create both write `join_mode` / `max_participants` today.** Any new column that organizers can set at create must be wired through both the inline insert and `create_invite_only_run` (and the visibility setter on edit).

## Historical Context (from prior changes)

- [`context/archive/2026-07-31-apply-and-approve-participants/plan-brief.md`](../archive/2026-07-31-apply-and-approve-participants/plan-brief.md) — Capacity on Accept: soft warn, allow overfill; auto-join deferred to S-05; organizer auto-seat; unique + deny-stays-denied.
- [`context/archive/2026-08-07-auto-join-mode/research.md`](../archive/2026-08-07-auto-join-mode/research.md) — schema was auto-join-ready but apply blocked; RLS pending-only INSERT; safest race-safe path = DEFINER + `FOR UPDATE`; organizer seat counts toward capacity.
- [`context/archive/2026-08-07-auto-join-mode/plan-brief.md`](../archive/2026-08-07-auto-join-mode/plan-brief.md) — RPC discriminated outcomes; reuse apply endpoint; Accept stays soft; full-run UX disabled client-side, server authoritative.
- [`context/archive/2026-08-20-edit-run/plan-brief.md`](../archive/2026-08-20-edit-run/plan-brief.md) — join-mode lock after any non-organizer participant; capacity floor = confirmed count; column grants + invariant trigger; disabled select omitted from POST.
- [`context/archive/2026-08-20-edit-run/reviews/impl-review-phase-1.md`](../archive/2026-08-20-edit-run/reviews/impl-review-phase-1.md) — floor check only when `max_participants` changes (overfilled title save must succeed).
- [`context/archive/2026-09-01-run-create-limits/plan-brief.md`](../archive/2026-09-01-run-create-limits/plan-brief.md) — form-level 64 + schedule; **no Advanced, no S-26**; no CHECK/migration; grandfather >64.
- [`context/foundation/lessons.md`](../../foundation/lessons.md) — never forward Auth/PostgREST/`Error.message` into `?error=`.
- [`context/foundation/roadmap.md`](../../foundation/roadmap.md) (S-26) — Advanced is the resolution for the 1-minute create guardrail; bands must not reintroduce last-slot double-confirm.
- [`context/foundation/prd-v2.md`](../../foundation/prd-v2.md) — FR-005, FR-025, FR-026, US-01 acceptance: default join control unchanged; team-size under Advanced.

## Related Research

- [`context/archive/2026-08-07-auto-join-mode/research.md`](../archive/2026-08-07-auto-join-mode/research.md) — apply/participant flow and race-safe auto-join (S-05). Baseline this change extends.
- No `research.md` in the S-02 apply-and-approve, S-13 edit-run, or S-25 run-create-limits archives (plan-only).

## Open Questions

These are plan-time choices, not blockers for this map:

1. **When Advanced min-band is set, does it overlay any `join_mode`?** PRD: “when team-size is used, auto-join up to the min band, then approval for the rest; otherwise today’s join mode.” That implies even an `approval_required` run would auto-join the min band if the organizer set a team-size. Confirm in `/10x-plan` so `auto_join_run`’s `not_auto_join` gate is updated (or a sibling RPC is used) instead of remaining `join_mode = auto_join` only.
2. **New RPC outcome vs overloading `full`.** Band-full must fall through to pending; max-full must stay a hard reject. A distinct token (`band_full`) is the least ambiguous mapping for `autoJoinRun`’s switch.
3. **Freeze the min-band with `join_mode` after the first non-organizer apply?** Same desync risk as flipping auto_join → approval with leftover pending. Likely yes, via the existing lock trigger.
4. **Accept at max when bands are on.** Keep S-02 soft overfill unless the plan explicitly hardens Accept (would need a locked DEFINER path to stay race-safe). Not required to prevent auto-join double-confirm.
5. **List/detail label.** Keep showing `formatJoinMode(join_mode)` and add a Capacity/Advanced line for “auto-join first N”, vs a hybrid phrase. Default-form select stays two options either way.
6. **Unset representation.** `NULL` min-band = current behavior vs `0` vs `min = max` meaning all auto-join. Plan should pick one CHECK/default so backfill of existing runs is a no-op.
