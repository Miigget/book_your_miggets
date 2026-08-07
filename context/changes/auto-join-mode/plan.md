# Auto-Join Mode (S-05) Implementation Plan

## Overview

Implement FR-014 / US-02: when a run's `join_mode` is `auto_join`, an authenticated member who applies is confirmed on the participant list immediately — subject to remaining capacity — with no organizer action. This replaces the "Auto-join is coming soon" state shipped in S-02 and closes the one race condition the roadmap calls out: concurrent applies against the last slot must never overbook the run.

## Current State Analysis

- `join_mode` already exists end-to-end: Postgres enum `('approval_required', 'auto_join')` (`supabase/migrations/20260729134008_run_domain_schema.sql:9,32`), generated types, create-run form select, list/detail DTOs, and the `formatJoinMode` label. Only the apply path is blocked.
- `applyToRun` hard-blocks auto-join runs: `throw new ParticipantError("Applying to auto-join runs is not available yet")` (`src/lib/services/participants.ts:190-192`), and the `RunParticipantActions` island renders the "coming soon" paragraph for `joinMode === "auto_join"` (`src/components/runs/RunParticipantActions.tsx:98-102`).
- The only member INSERT policy on `run_participants` forces `status = 'pending'` (`run_participants_insert_self_pending`, `20260729134008:294-302`). A client session cannot insert a `confirmed` row.
- There is **no capacity enforcement in SQL** — the only capacity-related SQL is `max_participants integer not null check (max_participants > 0)`. Confirmed counts are computed app-side (`countConfirmedParticipants` at `participants.ts:144-156`, unused; `confirmedCountsForRuns` at `runs.ts:130-155`). S-02 deliberately shipped soft capacity on organizer Accept (client-side warn, server allows overfill).
- The repo's established pattern for writes RLS won't allow is a `SECURITY DEFINER` function with `set search_path = ''`, `revoke all … from public`, and an explicit grant only when client-callable: `seat_organizer_on_run_insert` (trigger, `20260731111849:44-62`) and `ensure_own_profile` (client-callable RPC, `20260730005505:4-37`).
- All participant mutations gate through `loadActiveRunForMutation` (`participants.ts:158-183`): active window `archived_at is null AND starts_at > now() - 1h` (S-04 contract), returns `join_mode`, throws `ParticipantError("Run not found or no longer active")`.
- The RLS boundary uses the publishable key on the Worker — no `service_role`. Error contract (lessons.md): only `ParticipantError` messages reach `?error=` redirects; raw DB/PostgREST errors are logged server-side only.
- The organizer occupies one `confirmed` seat via the auto-seat trigger, so "capacity remains" = `count(status = 'confirmed') < max_participants` naturally includes them.
- No test runner exists in the repo (per `AGENTS.md`) — verification is lint + build + manual + SQL-level checks.

## Desired End State

A member visiting an active auto-join run with a free slot can click Join and land on the confirmed roster in one request. When the last slot is contested by concurrent applies, exactly one wins; the rest get a clean "run is full" message. Approval-required runs behave exactly as before.

Verify by: creating an auto-join run with capacity 2 (organizer takes seat 1), joining from a second account (instantly on roster, `Filled: 2/2`), attempting to join from a third account (rejected with "This run is already full"), and firing two concurrent `auto_join_run` RPC calls at one remaining slot in SQL (exactly one `confirmed` result).

### Key Discoveries:

- `run_participants_insert_self_pending` forces `pending`, so instant confirm must go through a SECURITY DEFINER path — widening the INSERT policy with a capacity subquery would NOT be race-safe (policy evaluation takes no lock; two snapshot reads can both pass). See `research.md` § Architecture Insights.
- `SELECT … FOR UPDATE` on the parent `runs` row inside a DEFINER RPC serializes all applies per run; count-then-insert inside the same transaction is then safe. No locking pattern exists in migrations yet — this introduces the first one.
- `loadActiveRunForMutation` already returns `join_mode` (`participants.ts:161`), so `applyToRun` can branch without extra queries.
- `unique (run_id, user_id)` + no DELETE policy for `denied` rows means a denied user can never re-apply — S-02 decision that auto-join must respect.
- The island already receives `joinMode`, `maxParticipants`, `confirmedCount`, `nickname`, `ownStatus` (`src/pages/runs/[id].astro:212-226`) — the UI change is confined to `RunParticipantActions.tsx`.

## What We're NOT Doing

- **Hard capacity on organizer Accept (approval mode).** S-02 chose soft overfill deliberately ("Organizer flexibility; hard races deferred to S-05" referred to auto-join races, not Accept). Accept semantics stay unchanged.
- **Leave/withdraw for confirmed auto-join members.** A confirmed auto-joiner cannot leave the run — identical to confirmed members in approval mode today (only organizers can delete their own confirmed row). A general "leave team" feature is a separate future change.
- **Changing `join_mode` after run creation** — no edit surface exists; not added here.
- **Waitlists or queueing** when the run is full — apply is simply rejected.
- **Guest-facing auto-join messaging changes** (S-02 impl-review F6 leftover) — guests keep the existing sign-in CTA with `returnTo`.
- **Retrofitting the DB capacity guarantee onto the pending-insert path** — approval-mode applies stay app-gated as today.

## Implementation Approach

Two phases, DB-first (repo convention: schema/migration → business logic → API → UI):

1. **Phase 1** lands a client-callable `SECURITY DEFINER` RPC `public.auto_join_run(p_run_id uuid)` that performs the entire join decision atomically: lock the `runs` row with `SELECT … FOR UPDATE`, re-validate join mode + active window, check ban/nickname/existing participation, count confirmed seats, and insert the `confirmed` row only if a slot remains. It returns a discriminated text outcome so the app layer can map results onto user-facing `ParticipantError` messages without ever exposing raw DB errors. Regenerate `src/types/database.ts` so `supabase.rpc("auto_join_run", …)` is typed.
2. **Phase 2** branches `applyToRun` on `run.join_mode` (reusing the existing `POST /api/runs/[id]/apply` endpoint — same user action, same URL, same redirect contract) and replaces the "coming soon" UI branch in `RunParticipantActions` with the real join flow, including a "run is full" state.

Why an RPC and not the alternatives (grounded in `research.md`):

- **Widened INSERT RLS with a capacity WITH CHECK subquery** — not race-safe: two concurrent inserts each see a pre-insert snapshot count below capacity and both pass.
- **BEFORE INSERT capacity trigger** — race-safe if it locks the run row, but it would fire on *every* `run_participants` insert, changing semantics of the organizer auto-seat trigger and of approval-mode applies (S-02's soft-overfill decision). Too broad for this slice.
- **Serializable isolation** — not controllable per-request through PostgREST/supabase-js.

The RPC derives the user from `auth.uid()` internally (never trusts a caller-supplied user id — same posture as `ensure_own_profile`) and duplicates the app-level gates (active window, nickname, ban, existing participation) because a DEFINER function is directly callable via PostgREST by any authenticated session; the DB must be authoritative even if the service-layer checks are bypassed.

## Critical Implementation Details

**Locking scope** — the `FOR UPDATE` lock must be taken on the `public.runs` row (the shared resource), not on `run_participants` rows. Locking the run serializes all concurrent applies to that run; the confirmed-seat count executed after acquiring the lock is then stable for the remainder of the transaction. Do not use `FOR SHARE` (concurrent applicants would both proceed) and do not count before locking.

**Outcome contract, not exceptions** — the RPC returns a text outcome rather than raising for domain results (`full`, `already_confirmed`, …). Raised exceptions surface as opaque PostgREST errors, which the lessons.md rule forbids forwarding to users; discrete return values keep the mapping explicit and testable. Reserve exceptions for genuinely unexpected states.

**Enum string values differ between layers** — DB enum values are snake_case (`auto_join`, `approval_required`); make sure the service branch compares against the generated `Enums<"join_mode">` values, exactly as `applyToRun` does today at `participants.ts:190`.

## Phase 1: DB migration — race-safe `auto_join_run` RPC

### Overview

Land the migration that makes instant confirmation possible and race-safe at the database level, plus regenerated types. No app behavior changes in this phase (the service still blocks auto-join applies).

### Changes Required:

#### 1. New migration: auto-join RPC

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_auto_join_run_rpc.sql` (timestamp at implementation time; follow the header-comment and section-banner style of `20260731111849_participant_apply_leave_and_organizer_seat.sql`)

**Intent**: Create `public.auto_join_run(p_run_id uuid) returns text` — a `SECURITY DEFINER` plpgsql function that atomically validates and executes an auto-join, serializing concurrent applies per run via a row lock on `runs`.

**Contract**: The function is the single authority for auto-join confirmation. Signature and outcome values are depended on by Phase 2:

```sql
create or replace function public.auto_join_run(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$ … $$;

revoke all on function public.auto_join_run(uuid) from public;
grant execute on function public.auto_join_run(uuid) to authenticated;
```

Internal sequence (all inside the function's implicit transaction):

- Resolve `v_user_id := (select auth.uid())`; return `'not_authenticated'` if null.
- Return `'banned'` if not `public.is_not_banned()`.
- `select … from public.runs where id = p_run_id for update` into locals; return `'not_active'` when no row, `archived_at is not null`, or `starts_at <= now() - interval '1 hour'` (mirror the RLS active window in `20260807104348_run_active_window_select.sql:8-24`).
- Return `'not_auto_join'` when `join_mode <> 'auto_join'::public.join_mode`.
- Return `'no_nickname'` when the caller's `profiles.nickname` is null (parity with the app-level gate; defends direct RPC calls).
- Look up the caller's existing `run_participants` row; return `'already_pending'`, `'already_confirmed'`, or `'denied'` by its status.
- Count `run_participants` rows with `status = 'confirmed'` for the run (lock held ⇒ stable); return `'full'` when count `>= max_participants`.
- Insert `(p_run_id, v_user_id, 'confirmed'::public.participant_status)`; return `'confirmed'`.

Outcome vocabulary (closed set): `confirmed | full | already_pending | already_confirmed | denied | no_nickname | not_active | not_auto_join | banned | not_authenticated`.

#### 2. Regenerate database types

**File**: `src/types/database.ts`

**Intent**: Regenerate with the repo's script `npm run db:types` (`supabase gen types typescript --local > src/types/database.ts`; requires local Supabase running via `npx supabase start`) so the `Functions` section includes `auto_join_run` and `supabase.rpc("auto_join_run", { p_run_id })` typechecks in Phase 2.

**Contract**: `Database["public"]["Functions"]["auto_join_run"]` with `Args: { p_run_id: string }`, `Returns: string`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local stack: `npx supabase db reset` completes without error
- Types regenerated: `npm run db:types` run against local Supabase; `src/types/database.ts` contains `auto_join_run` in `Functions`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- SQL smoke test (psql against local Supabase): calling `auto_join_run` on an auto-join run with a free slot returns `confirmed` and the roster row exists; second call returns `already_confirmed`
- Race check: with exactly one slot remaining, two concurrent transactions calling `auto_join_run` for two different users produce exactly one `confirmed` and one `full`; confirmed count never exceeds `max_participants`
- Guard checks: RPC returns `not_auto_join` for an approval-required run, `not_active` for an archived/past-grace run, and `full` when `count(confirmed) = max_participants`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Service branch + apply endpoint reuse + UI

### Overview

Wire the RPC into the existing apply flow and replace the "coming soon" UI so members can actually join. `POST /api/runs/[id]/apply` remains the single apply endpoint for both join modes.

### Changes Required:

#### 1. Branch `applyToRun` on join mode

**File**: `src/lib/services/participants.ts`

**Intent**: Remove the `"Applying to auto-join runs is not available yet"` block (`:190-192`). Keep the shared prelude (`ensureOwnProfile`, `loadActiveRunForMutation`, nickname gate, `getOwnParticipation` pre-check with the existing per-status messages) for both modes, then: approval mode → existing pending insert, unchanged; auto-join mode → call `supabase.rpc("auto_join_run", { p_run_id: runId })` and map the outcome to the user-facing contract.

**Contract**: Outcome → behavior mapping (`ParticipantError` messages are user-facing; raw errors go to `console.error` only, per lessons.md):

- `confirmed` → success (endpoint redirects to `/runs/{id}` as today)
- `already_confirmed` → success as well (idempotent join): this is what a double-click/double-submit race resolves to once the run-row lock serializes the two requests, and redirecting to the run page — where the member sees their confirmed status — is correct for both the race and a genuine repeat POST. The `getOwnParticipation` pre-check still shows the friendly "You are already on this run" message on a normal repeat visit before the RPC is ever called.
- `full` → `ParticipantError("This run is already full")`
- `already_pending` / `denied` / `no_nickname` → the existing `applyToRun` messages for those states (these are defense-in-depth; the pre-checks normally catch them first)
- `not_active` → existing `"Run not found or no longer active"`
- `not_auto_join` / `banned` / `not_authenticated` / unknown / RPC transport error → log server-side, throw generic `ParticipantError("Could not apply to this run")`

No changes to `src/pages/api/runs/[id]/apply.ts` — the handler already delegates everything to `applyToRun` and owns the redirect/`?error=` contract.

#### 2. Replace the "coming soon" island branch

**File**: `src/components/runs/RunParticipantActions.tsx`

**Intent**: Delete the auto-join "coming soon" paragraph (`:98-102`) and extend the member action area so auto-join runs get a real join flow: the nickname gate (`:104-130`) and the apply form (`:132-138`) render for both join modes when `ownStatus === null`; for auto-join, label the button "Join run" (instant confirmation) instead of "Apply to join". When `confirmedCount >= maxParticipants` and the viewer is not yet a participant on an auto-join run, render a disabled full state ("This run is full") instead of the form — the server remains authoritative (a stale count still submits fine and gets the server's `full` rejection via `?error=`).

**Contract**: Props are unchanged (`joinMode`, `maxParticipants`, `confirmedCount`, `nickname`, `ownStatus`, `serverError`, …). The form still POSTs to `/api/runs/${runId}/apply`. Existing `ownStatus`-driven states (pending → withdraw, confirmed, denied) and organizer panels are untouched; guest early-return with `returnTo` CTAs is untouched.

#### 3. Run detail page — verify, no expected change

**File**: `src/pages/runs/[id].astro`

**Intent**: Confirm the island props already carry everything the new UI needs (they do per research: `:212-226`) and that the roster + `Filled: n/max` reflect an instant join after redirect. No code change expected; touch only if a prop gap surfaces.

**Contract**: No prop or query changes.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Auto-join happy path: account B opens an active auto-join run with free capacity, clicks "Join run", lands back on the detail page listed in the confirmed roster; `Filled` count incremented on detail and list pages
- Full-run rejection: with `confirmedCount = maxParticipants`, a non-participant sees the disabled "This run is full" state; forcing the POST anyway (stale tab) surfaces "This run is already full" via `?error=`
- Nickname gate: account without nickname sees the nickname form on an auto-join run and can join after setting it
- Approval-required regression: apply/withdraw/accept/deny flow behaves exactly as before (button label still "Apply to join", pending state intact)
- Guest path: guest on an auto-join run sees sign-in/sign-up CTAs; after sign-in with `returnTo`, can join
- Already-participating states: pending (unreachable on auto-join runs created post-S-05, but harmless), confirmed, and denied users see the existing status messages, not a join button
- Double-submit: rapidly double-clicking "Join run" produces a single roster entry and a clean success redirect (no error banner)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — the repo has no test runner or `test` script (`AGENTS.md`); do not introduce one in this slice.

### Integration Tests:

- SQL-level: the Phase 1 manual race check (two concurrent `auto_join_run` calls against one slot) is the integration test for the product's one known race condition. Run it via two parallel psql sessions (`begin; select public.auto_join_run(…);` in each, commit both) or a two-connection script against local Supabase.

### Manual Testing Steps:

1. `npx supabase start` + `npx supabase db reset`, `npm run dev`; create an auto-join run with `max_participants = 2` from account A (organizer auto-seats: `Filled: 1/2`).
2. From account B: open the run, join, verify instant roster presence and `Filled: 2/2`.
3. From account C: verify the disabled "This run is full" state; POST the form anyway from a pre-full stale tab and verify the "This run is already full" error banner.
4. Repeat step 2 on an approval-required run to confirm no regression (pending flow intact).
5. Race check per Testing Strategy → Integration Tests.

## Performance Considerations

The `FOR UPDATE` lock is per-run and held only for the duration of one short RPC (a point lookup, one indexed count on `(run_id, status)`, one insert). Contention is bounded by concurrent applies to a single run — at KoG-community scale this is trivially small. No new indexes needed.

## Migration Notes

- Pure additive migration (one new function); no table/policy changes, no backfill, no data migration. Existing auto-join runs created since S-01 become joinable the moment Phase 2 deploys.
- Deploys through the existing CD path (tag `v*` → `supabase db push` → Worker deploy). DB-first ordering within the release is safe: the RPC landing before the new Worker code is inert.
- Rollback: dropping the function restores the pre-S-05 DB state; the app-level auto-join branch would then fail closed (RPC error → generic "Could not apply to this run").

## References

- Related research: `context/changes/auto-join-mode/research.md`
- PRD: `context/foundation/prd.md` — FR-014, US-02, Business Logic §
- Roadmap: `context/foundation/roadmap.md` — S-05
- SECURITY DEFINER patterns: `supabase/migrations/20260731111849_participant_apply_leave_and_organizer_seat.sql:44-62`, `supabase/migrations/20260730005505_ensure_own_profile.sql:4-37`
- Apply flow: `src/pages/api/runs/[id]/apply.ts:6-39`, `src/lib/services/participants.ts:158-228`
- UI branch to replace: `src/components/runs/RunParticipantActions.tsx:98-138`
- Prior decisions: `context/archive/2026-07-31-apply-and-approve-participants/plan.md` (soft capacity, auto-join deferral), `reviews/impl-review.md` F5 (CAS precedent)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB migration — race-safe `auto_join_run` RPC

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset`
- [x] 1.2 Types regenerated: `src/types/database.ts` contains `auto_join_run` in `Functions`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Build passes: `npm run build`

#### Manual

- [x] 1.5 SQL smoke test: `auto_join_run` confirms with free slot, then `already_confirmed`
- [x] 1.6 Race check: concurrent calls at one slot yield exactly one `confirmed`, one `full`
- [x] 1.7 Guard checks: `not_auto_join`, `not_active`, `full` outcomes verified

### Phase 2: Service branch + apply endpoint reuse + UI

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Build passes: `npm run build`

#### Manual

- [ ] 2.3 Auto-join happy path: instant roster + filled count on detail and list
- [ ] 2.4 Full-run rejection: disabled state + server error on stale POST
- [ ] 2.5 Nickname gate works on auto-join runs
- [ ] 2.6 Approval-required flow regression-free
- [ ] 2.7 Guest sign-in `returnTo` path joins successfully
- [ ] 2.8 Existing participation states show status messages, no join button
- [ ] 2.9 Double-submit join is idempotent (single roster entry, no error)
