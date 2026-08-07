---
date: 2026-08-07T14:24:30+02:00
researcher: Cursor Agent (for Miigget)
git_commit: 26370b6f39eababe9f7df54343b0e03bf02b6a89
branch: feature/auto-join-mode
repository: book_your_miggets
topic: "How does the current apply/participant flow work (API routes, RLS policies, triggers, UI islands), and what is the safest way to add instant auto-join confirmation with a capacity check that is race-safe under concurrent applies?"
tags: [research, codebase, auto-join, run-participants, rls, capacity, race-condition, supabase]
status: complete
last_updated: 2026-08-07
last_updated_by: Cursor Agent (for Miigget)
---

# Research: Apply/participant flow and race-safe auto-join confirmation (S-05)

**Date**: 2026-08-07T14:24:30+02:00
**Researcher**: Cursor Agent (for Miigget)
**Git Commit**: 26370b6f39eababe9f7df54343b0e03bf02b6a89
**Branch**: feature/auto-join-mode
**Repository**: book_your_miggets

## Research Question

How does the current apply/participant flow work (API routes, RLS policies, triggers, UI islands), and what is the safest way to add instant auto-join confirmation with a capacity check that is race-safe under concurrent applies?

## Summary

- **The schema is auto-join-ready; the paths are not.** `join_mode` is a Postgres enum `('approval_required', 'auto_join')` on `runs` and already flows through generated types, the create-run form, list/detail DTOs, and UI labels. Only the apply path is blocked: `applyToRun` throws `"Applying to auto-join runs is not available yet"` for non-approval runs, and the `RunParticipantActions` island renders "Auto-join is coming soon…" for `join_mode === "auto_join"`.
- **RLS forbids the naive implementation.** The only member INSERT policy on `run_participants` (`run_participants_insert_self_pending`) forces `status = 'pending'`. A client-session insert of `status = 'confirmed'` is impossible without either widening that policy or going through an elevated path. The established elevated-path pattern in this repo is a `SECURITY DEFINER` function with `set search_path = ''` and revoked PUBLIC execute (`seat_organizer_on_run_insert`, `ensure_own_profile`).
- **There is zero capacity enforcement in SQL today** — the only capacity-related SQL is `max_participants integer not null check (max_participants > 0)`. Filled counts are computed app-side (`countConfirmedParticipants`, `confirmedCountsForRuns`), and S-02 deliberately shipped soft capacity (organizer Accept warns client-side but the server allows overfill). App-level check-then-insert for auto-join would therefore be racy: two concurrent applies can both read `confirmed < max` and both insert.
- **Safest mechanism given what already exists:** a `SECURITY DEFINER` Postgres RPC (e.g. `auto_join_run(run_id)`) that, inside one statement/transaction, locks the run row (`SELECT … FOR UPDATE` on `runs`), re-validates join_mode + active window, counts confirmed participants, and inserts the `confirmed` row only if a slot remains. Locking the parent `runs` row serializes concurrent applies to the same run, which is exactly the roadmap-flagged race ("concurrent applies against the last slot is the one race condition in the product"). This mirrors house patterns (DEFINER + empty search_path + explicit grants) and keeps the member INSERT policy untouched.
- **App layer reuse is high:** the existing `POST /api/runs/[id]/apply` endpoint and `applyToRun` service can branch on `run.join_mode` (loaded by `loadActiveRunForMutation`) and call the RPC for auto-join, keeping nickname gate, ensure-profile, existing-participation checks, `ParticipantError` → `?error=` redirect conventions, and the FR-013 active-window gate.

## Detailed Findings

### 1. Database layer (`supabase/migrations/`)

Migration inventory (chronological):

| File | Purpose |
|------|---------|
| `20260729134008_run_domain_schema.sql` | Enums, `profiles`/`runs`/`run_participants`, RLS helpers, grants, RLS baseline |
| `20260729163802_maps_catalog_and_run_title.sql` | `maps` catalog, `runs.map_id`/`title` |
| `20260730005505_ensure_own_profile.sql` | `ensure_own_profile()` RPC (SECURITY DEFINER, granted to `authenticated`) |
| `20260731111849_participant_apply_leave_and_organizer_seat.sql` | DELETE policies, organizer auto-seat trigger + backfill |
| `20260807104348_run_active_window_select.sql` | Tightened `runs` SELECT to the active window |

**`join_mode`** — enum, not check constraint (`20260729134008_run_domain_schema.sql:9`, column at `:32`):

```sql
create type public.join_mode as enum ('approval_required', 'auto_join');
-- runs column:
join_mode public.join_mode not null default 'approval_required',
```

**Capacity** — the ONLY capacity SQL in the schema (`20260729134008_run_domain_schema.sql:30`):

```sql
max_participants integer not null check (max_participants > 0),
```

No trigger, view, constraint, or policy compares confirmed count to `max_participants`.

**`run_participants`** (`20260729134008_run_domain_schema.sql:38-46`): `id` uuid PK, `run_id` → `runs` ON DELETE CASCADE, `user_id` → `profiles` ON DELETE CASCADE, `status public.participant_status` (`'pending' | 'confirmed' | 'denied'`, enum at `:10`) default `'pending'`, `unique (run_id, user_id)` at `:45`. Indexes: `(run_id, status)` and `(user_id)` (`:50-51`). The unique constraint is the only concurrency guard today — it prevents double-apply (app maps error `23505`), not overbooking.

**Member INSERT policy** (`20260729134008_run_domain_schema.sql:294-302`) — forces `pending`:

```sql
create policy "run_participants_insert_self_pending"
  on public.run_participants
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'::public.participant_status
    and public.is_not_banned()
  );
```

WITH CHECK covers: self-only, `status = 'pending'`, not banned. It does NOT check active window, capacity, or `join_mode` — those live in app code.

**Organizer auto-seat trigger** (`20260731111849_participant_apply_leave_and_organizer_seat.sql:44-62`) — the house pattern for elevated writes:

```sql
create or replace function public.seat_organizer_on_run_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.run_participants (run_id, user_id, status)
  values (new.id, new.organizer_id, 'confirmed'::public.participant_status)
  on conflict (run_id, user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.seat_organizer_on_run_insert() from public;
```

Key facts: SECURITY DEFINER + `set search_path = ''`; EXECUTE revoked from PUBLIC (trigger-only); the organizer always occupies one confirmed seat, so capacity math must include them. `ensure_own_profile()` (`20260730005505_ensure_own_profile.sql:4-37`) is the client-callable variant: SECURITY DEFINER + explicit `grant execute … to authenticated`.

**Locking/serialization patterns in migrations:** none — no `FOR UPDATE`, no advisory locks, no serializable isolation, no partial unique indexes for seats. The only conflict handling is `unique (run_id, user_id)` + `on conflict do nothing`.

**Conventions for a new migration:** filename `YYYYMMDDHHmmss_short_snake_description.sql`; policies named `{table}_{op}_{qualifier}` in double quotes with `to anon|authenticated`, `(select auth.uid())`, enum casts like `'pending'::public.participant_status`; DEFINER functions always `set search_path = ''` + `revoke all from public` + explicit grant only if client-callable; policy replacement via `drop policy if exists` then recreate (see `20260807104348`).

### 2. API routes and service layer

Four participant mutation routes, all `export const POST` with the same shape (cookie SSR client from `src/lib/supabase.ts:6-24`, `getUser()`, service call, `ParticipantError.message` → `?error=` redirect, unexpected errors `console.error` + generic message — per `lessons.md` rule on not leaking infra errors):

- `src/pages/api/runs/[id]/apply.ts:6-39` → `applyToRun`
- `src/pages/api/runs/[id]/withdraw.ts` → `withdrawApplication`
- `src/pages/api/runs/[id]/leave-team.ts` → `leaveTeamAsOrganizer`
- `src/pages/api/runs/[id]/participants/[participantId]/decide.ts` → `decideParticipant` (FormData `status` must be `"confirmed"` or `"denied"`, `:37-45`)

Guest POST to apply redirects to `/auth/signin?returnTo=/runs/{id}` (`apply.ts:24-25`); `safeRunReturnTo` allows only `/runs/{uuid}` (`src/lib/safe-return-to.ts:1-9`). Middleware protects only `/dashboard` and `/runs/new` (`src/middleware.ts:4`) — apply relies on in-handler auth.

**FR-013 active-window gate** — `loadActiveRunForMutation` (`src/lib/services/participants.ts:158-183`): selects `id, join_mode, organizer_id` from `runs` where `archived_at is null` and `starts_at > now - 1h` (`activeWindowStartsAfter`, `src/lib/run-lifecycle.ts:1-19`, `RUN_GRACE_MS = 3_600_000`); throws `ParticipantError("Run not found or no longer active")` otherwise. S-04 established this as the mandatory choke point for ALL participant mutations.

**`applyToRun`** (`src/lib/services/participants.ts:185-228`), in order: `ensureOwnProfile` → `loadActiveRunForMutation` → **hard block** `if (run.join_mode !== "approval_required") throw new ParticipantError("Applying to auto-join runs is not available yet")` (`:190-192`) → nickname gate (`"Set a nickname before applying"`) → `getOwnParticipation` with per-status messages (pending/confirmed/denied) → insert `{ run_id, user_id, status: "pending" }` with `23505` mapped to a duplicate-application message. **No capacity check anywhere in the apply path.**

**`decideParticipant` confirm write** (`src/lib/services/participants.ts:329-336`) — the current "make confirmed" pattern, with CAS guard added by S-02 impl-review F5:

```ts
.update({ status, updated_at: new Date().toISOString() })
.eq("id", participantId).eq("run_id", runId)
.in("status", ["pending", "denied"])
.select("id").maybeSingle();
```

**Capacity counting (app-side only):** `countConfirmedParticipants` (`participants.ts:144-156`, exact head count of `status = 'confirmed'` — currently defined but UNUSED) and `confirmedCountsForRuns` (`src/lib/services/runs.ts:130-155`, used by the list). Run detail uses `confirmed.length` (`src/pages/runs/[id].astro:70`).

### 3. UI (run detail page + island)

- `src/pages/runs/[id].astro` loads the run via `getActiveRunById`, `listConfirmedParticipants` (always), own participation + nickname (signed in), pending/denied lists (organizer), and renders `{confirmedCount}/{run.maxParticipants}` (`:142`), join-mode label via `formatJoinMode` (`:151`, helper at `runs.ts:89-99` → `"Approval required"` / `"Auto join"`), and the confirmed roster (`:197-209`).
- The only React island is `RunParticipantActions` (`client:load`, `[id].astro:212-226`) with props `joinMode`, `maxParticipants`, `confirmedCount`, `isGuest`, `isOrganizer`, `nickname`, `ownStatus`, `organizerSeated`, `pending`, `denied`, `serverError`.
- **The "coming soon" branch to replace** (`src/components/runs/RunParticipantActions.tsx:98-102`):

```tsx
{joinMode === "auto_join" && (
  <p className="text-sm text-blue-100/60">
    Auto-join is coming soon. You can browse this run, but applying is not available yet.
  </p>
)}
```

- Nickname gate and Apply button are gated on `joinMode === "approval_required"` (`:104`, `:132-138`); Withdraw shows for `ownStatus === "pending"` (`:140-150`); organizer Accept has a client-side soft-capacity `confirm()` when `confirmedCount >= maxParticipants` (`:62-68`), and the server still allows overfill (S-02 decision). Guest early-return with sign-in/up CTAs + `returnTo` at `:71-91`.
- Run list (`src/pages/runs/index.astro:97-101`) shows `Filled: {run.confirmedCount}/{run.maxParticipants}`; no apply action on the list.

### 4. `join_mode` end-to-end

DB enum (`20260729134008:9`) → generated types `src/types/database.ts` (Row `:160`, Enums `:260`, Constants `:393`) → create form select (`src/components/runs/CreateRunForm.tsx:34`, `:185-203`) → `POST /api/runs` validates via `isJoinMode` (`src/pages/api/runs/index.ts:16, 97-110`) → DTO `RunListItem.joinMode` (`runs.ts:18`, mapped `:115`) → UI branches (service block `participants.ts:190-192`; island `:98-138`). Only the apply path and capacity rule are unfinished.

## Code References

- `supabase/migrations/20260729134008_run_domain_schema.sql:9,30,32,38-46,294-302` — join_mode enum, max_participants check, run_participants table + unique, member INSERT policy (forces pending)
- `supabase/migrations/20260731111849_participant_apply_leave_and_organizer_seat.sql:44-62` — SECURITY DEFINER auto-seat trigger (house pattern for elevated writes)
- `supabase/migrations/20260730005505_ensure_own_profile.sql:4-37` — client-callable SECURITY DEFINER RPC pattern with explicit grant
- `supabase/migrations/20260807104348_run_active_window_select.sql:8-24` — active-window SELECT policies (drop + recreate pattern)
- `src/lib/services/participants.ts:144-156` — `countConfirmedParticipants` (unused; natural capacity hook)
- `src/lib/services/participants.ts:158-183` — `loadActiveRunForMutation` (FR-013 gate; returns `join_mode`)
- `src/lib/services/participants.ts:185-228` — `applyToRun` (auto-join block at 190-192; pending insert at 216-220)
- `src/lib/services/participants.ts:285-345` — `decideParticipant` (CAS confirm at 329-336)
- `src/pages/api/runs/[id]/apply.ts:6-39` — apply endpoint (canonical POST handler pattern)
- `src/components/runs/RunParticipantActions.tsx:62-68,71-91,98-138` — soft-capacity confirm, guest CTA, "coming soon" + approval-only apply UI
- `src/pages/runs/[id].astro:70,142,151,212-226` — confirmedCount, capacity display, island props
- `src/lib/services/runs.ts:89-99,130-155` — `formatJoinMode`, `confirmedCountsForRuns`
- `src/lib/run-lifecycle.ts:1-19` — `RUN_GRACE_MS`, `activeWindowStartsAfter`

## Architecture Insights

- **RLS is the authz boundary** (publishable key on the Worker, no `service_role`); anything a member session cannot do through policies must go through a SECURITY DEFINER function. Both existing elevated paths follow: `security definer` + `set search_path = ''` + `revoke all from public` (+ `grant execute to authenticated` only when client-callable).
- **App-level gates vs DB gates:** active window, nickname, ensure-profile, and duplicate-status messaging are app-level; identity uniqueness is DB-level. Capacity is currently nowhere (soft by design in S-02). For auto-join, the confirm-if-capacity decision MUST be DB-level to be race-safe — two Worker isolates doing check-then-insert can interleave. A `SELECT … FOR UPDATE` on the `runs` row inside a DEFINER RPC serializes all applies per run; the count-then-insert inside the same transaction is then safe. (Alternatives considered: widening INSERT RLS WITH CHECK with a capacity subquery is NOT race-safe — policy evaluation takes no lock and two snapshot reads can both pass; a BEFORE INSERT capacity trigger with `FOR UPDATE` on runs would also work but changes semantics of every insert path including the organizer seat; serializable isolation is not available per-request through PostgREST.)
- **Error contract:** domain failures must be `ParticipantError` with user-facing text (lessons.md: never forward raw PostgREST/DB messages into `?error=`). An RPC returning a discriminated result (e.g. `confirmed | full | duplicate | not_active`) maps cleanly onto this; alternatively a raised exception with a known code/message the service translates.
- **Organizer seat counts toward capacity** (confirmed row from the trigger), so "capacity remains" = `count(status='confirmed') < max_participants` naturally includes the organizer.
- **Denied stays denied:** `unique (run_id, user_id)` + no DELETE policy for denied rows means a denied user cannot re-apply — S-02 decision that auto-join must respect (an auto-join run's denied user should get the existing denied message, not a bypass).

## Historical Context (from prior changes)

- `context/archive/2026-07-31-apply-and-approve-participants/plan.md` — "Auto-join apply stays deferred to S-05"; "`auto_join` runs show a clear 'coming soon' apply state — no apply mutation until S-05"; "Auto-join instant confirm / hard capacity races (S-05 / FR-014)" in What We're NOT Doing; soft capacity: "Warn in the organizer Accept UI when `confirmedCount >= max_participants`; still perform the UPDATE if they confirm. No DB trigger for capacity in this slice."
- `context/archive/2026-07-31-apply-and-approve-participants/plan-brief.md` — Key Decision "Capacity on Accept | Soft warn, allow overfill | Organizer flexibility; hard races deferred to S-05"; risk note "Soft overfill means filled counts can exceed `max_participants` by design until a later hard rule."
- `context/archive/2026-07-31-apply-and-approve-participants/reviews/impl-review.md` — F5: concurrent Accept/Deny was last-write-wins; fixed with status CAS (`.in("status", [...])`), the precedent for compare-and-set writes. F6: guest sees auto-join "coming soon" only after sign-in — SKIPPED as acceptable for S-02; S-05 may want clearer guest messaging on auto-join runs.
- `context/archive/2026-08-07-run-archival-lifecycle/plan.md` — all participant mutations must gate through `loadActiveRunForMutation` (same window as list/detail); grace period remains fully mutable; past-grace → `ParticipantError("Run not found or no longer active")`.
- `context/foundation/lessons.md` — default branch is `main`; update stale docs in the same turn; at manual-verification gates provide clickable local URLs + running servers; never echo raw infrastructure errors into `?error=` redirects.

## Related Research

- `context/archive/2026-08-07-run-archival-lifecycle/research.md` — active-window/archival derivation research (S-04).
- No research.md exists in the S-02 archive (plan-only change).

## Open Questions

1. **Full-run UX:** when capacity is filled, should the auto-join apply button be disabled client-side (stale-count risk) in addition to the authoritative server rejection? (Server must decide either way; UI treatment is a design choice for the plan.)
2. **Does auto-join need the withdraw path?** An instantly-confirmed member is `confirmed`, not `pending`; today only organizers can delete their own confirmed row. Leaving a full auto-join run is arguably S-05-adjacent but was never promised by FR-014 — plan should scope it explicitly (likely out).
3. **Should hard capacity also apply to organizer Accept (approval mode)?** S-02 chose soft overfill deliberately; S-05's DB guarantee could optionally cover Accept too, but that changes S-02 semantics — plan should decide and record it.
4. **Guest messaging on auto-join runs** (S-02 impl-review F6 leftover): guests currently see generic sign-in CTA; fine to keep, but the plan can note it.
