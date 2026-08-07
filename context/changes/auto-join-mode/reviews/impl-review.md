<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auto-Join Mode (S-05)

- **Plan**: context/changes/auto-join-mode/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-08-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Review evidence

- **Drift review** (all planned files read + `git diff main...HEAD` per path): all 4 changed code files MATCH the plan; `src/pages/api/runs/[id]/apply.ts` and `src/pages/runs/[id].astro` confirmed unchanged as planned; no "What We're NOT Doing" guardrail crossed (organizer Accept keeps soft capacity, no leave path for confirmed auto-joiners, no join_mode editing, no waitlist, no guest messaging change, no capacity retrofit on the pending-insert path).
- **Safety review**: identity derived solely from `auth.uid()`; `set search_path = ''`, revoke-from-public + grant-to-authenticated verified; all gates re-validated inside the DEFINER; no dynamic SQL; no raw DB/PostgREST error can reach `?error=` (lessons.md rule honored — outcomes are discrete text, transport errors go to `console.error` + fixed copy). Race design (lock → validate → count → insert) confirmed correct; count and duplicate lookup happen after the `FOR UPDATE` lock.
- **Success criteria (re-run on final state)**: `npx supabase db reset` clean (all 6 migrations apply); `npm run lint` 0 errors (7 warnings: 5 pre-existing + 2 intentional `console.error` per house pattern); `npm run build` completes. All manual Progress rows carry evidence: SQL smoke/guard outcomes, two-session `FOR UPDATE` race test (exactly one `confirmed`, one `full`, count stayed at capacity), and full HTTP-level UI flows (join, full-state, nickname gate, approval regression, guest returnTo, status states, concurrent double-submit → single roster row).

## Findings

### F1 — unique_violation could escape the RPC insert as a raised exception

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/migrations/20260807123643_auto_join_run_rpc.sql:89
- **Detail**: The only interleaving that produces it is an approval-mode pending INSERT (non-locking path) racing the RPC for the same user, which requires the run's `join_mode` to flip mid-request — no product surface exists for that. If it fires, the service transport-error branch absorbs it (`console.error` + generic `ParticipantError`); no raw error leaks.
- **Fix**: Optionally wrap the insert in `exception when unique_violation then return 'already_confirmed'`.
- **Decision**: ACCEPTED — degraded path is already safe and user-clean; the trigger requires a join_mode flip that has no UI surface. Hardening deferred; revisit if a join-mode edit surface ships.

### F2 — Organizer Accept racing auto-join can exceed max_participants by one

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/migrations/20260807123643_auto_join_run_rpc.sql:80-90 (interaction with decideParticipant)
- **Detail**: `decideParticipant` updates `run_participants` without locking the runs row, so a concurrent Accept + auto-join can land one seat over capacity. The product deliberately allows organizer over-capacity (S-02 soft-capacity decision, reaffirmed in this plan's "What We're NOT Doing").
- **Fix**: None required; document the invariant as "auto-join alone never oversubscribes", not "confirmed ≤ max".
- **Decision**: ACCEPTED — matches the recorded S-02/S-05 scope decision; likelihood is low (auto-join runs rarely hold pending rows). Invariant documented here.

### F3 — plpgsql simple CASE without ELSE raises CASE_NOT_FOUND if participant_status grows

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/migrations/20260807123643_auto_join_run_rpc.sql:73-77
- **Detail**: All three current enum values are covered. A future fourth value would raise, which the service transport-error branch absorbs safely.
- **Fix**: Optional ELSE fallback in a future migration.
- **Decision**: ACCEPTED — any enum extension arrives via migration + review, where this function must be revisited anyway; failure mode degrades safely today.

### F4 — `not_auto_join` mapped to generic error though theoretically reachable

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (UX)
- **Location**: src/lib/services/participants.ts:209-213
- **Detail**: Reachable only if `join_mode` changes between `loadActiveRunForMutation` and the RPC. No edit surface for `join_mode` exists (explicitly out of scope for S-05).
- **Fix**: Map to a friendlier "join settings changed" message if a join-mode edit surface ever ships.
- **Decision**: DISMISSED — contrived without an edit surface; the generic message plus server-side log is the correct posture per lessons.md.

### F5 — Whitespace-aware nickname check in the RPC (minor plan refinement)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260807123643_auto_join_run_rpc.sql:58-65
- **Detail**: Plan said "nickname is null"; implementation uses `nullif(btrim(nickname), '')`, treating whitespace-only as unset — parity with the app layer's `.trim()` gate.
- **Fix**: None.
- **Decision**: ACCEPTED — strict improvement matching app-layer semantics.

### F6 — "Joining..." pending label on auto-join (cosmetic extra)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/runs/RunParticipantActions.tsx:141
- **Detail**: Pending text "Joining..." (vs "Applying...") not spelled out in the plan; consistent with the planned "Join run" label change.
- **Fix**: None.
- **Decision**: ACCEPTED — cosmetic consistency with the planned button label.
