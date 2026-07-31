# Apply and Approve Participants Implementation Plan

## Overview

Ship S-02 (north star): members with a nickname apply to `approval_required` runs; organizers accept or deny from the run detail page; confirmed players appear on the public roster and count toward filled slots. Organizers are seated on the team at create time and may leave the team while remaining visible as organizer. Auto-join apply stays deferred to S-05.

## Current State Analysis

- F-01 landed `run_participants` with `participant_status` (`pending` | `confirmed` | `denied`), `UNIQUE (run_id, user_id)`, and RLS: public SELECT confirmed only; self-INSERT as `pending`; organizer/admin UPDATE status (`supabase/migrations/20260729134008_run_domain_schema.sql`).
- Grants allow `INSERT`/`UPDATE` on `run_participants` but **not** `DELETE` — withdraw / leave-team cannot work without a migration.
- Self-INSERT `WITH CHECK` allows only `status = pending`, so the app cannot insert the organizer as `confirmed` via the publishable key; a DB trigger (or equivalent SECURITY DEFINER path) is required for auto-seat.
- S-01 shipped create/list/detail: `POST /api/runs`, `/runs`, `/runs/[id]` with an empty Participants shell and “apply not available yet” copy (`src/pages/runs/[id].astro`). Create stores `join_mode`, `max_participants`, `min_points` but does not touch `run_participants`.
- Auth (FR-001/FR-002), nickname, `ensure_own_profile`, and form-POST + `?error=` patterns exist. No `src/` code reads or writes `run_participants` yet.
- No test runner in `package.json` — verification is lint/build, local migration apply, and manual UI paths.

## Desired End State

- Creating a run seats the organizer as `confirmed` on the roster; organizer can leave the team and still appear as organizer on the run.
- A signed-in member with a nickname can apply to an active `approval_required` run in under ~30 seconds perceived time; guests are sent to sign-in/sign-up and can return to the same run.
- Organizer sees pending applicants on `/runs/[id]` and can accept or deny; after deny, only the organizer can later flip the same row to confirmed (no second Apply).
- Guests see confirmed nicknames and filled/capacity counts; `min_points` remains informational only.
- `auto_join` runs show a clear “coming soon” apply state — no apply mutation until S-05.
- Applicant can withdraw own `pending` application.

### Key Discoveries:

- Participant RLS matrix and enum already encode the approval state machine — product work is service/API/UI plus DELETE + organizer-seat trigger (`20260729134008_run_domain_schema.sql` ~38–46, ~151–152, ~257–332).
- Create-run API ends at `runs` insert + redirect (`src/pages/api/runs/index.ts` ~101–120) — organizer seat should be DB-owned so it cannot be skipped by alternate clients.
- Detail shell is the intentional S-02 hook (`src/pages/runs/[id].astro` ~155–170); list already shows capacity/join mode but not filled counts (`src/pages/runs/index.astro`).
- Prior plans explicitly deferred apply/approve/roster to S-02 and auto-join confirm/capacity races to S-05 (`create-and-list-runs/plan.md`, `run-domain-schema/plan-brief.md`).

## What We're NOT Doing

- Auto-join instant confirm / hard capacity races (S-05 / FR-014)
- Enforcing or validating `min_points` against a player score (deferred until profile/stats work)
- Guest search/filter of the active list (S-03)
- Archive / in-progress grace UX (S-04)
- My-runs dashboard / cross-run pending inbox (S-08)
- Admin moderation UI (S-06)
- Confirmed non-organizer “leave team” (only pending withdraw + organizer self-leave)
- `service_role` on the Worker; Discord; live TeeWorlds stats

## Implementation Approach

Extend the F-01 contract with a small migration (DELETE policies + organizer auto-seat trigger + backfill), add a participants service mirroring `src/lib/services/runs.ts`, expose thin form-POST API routes under `src/pages/api/runs/[id]/…`, and replace the detail Participants shell with Astro SSR data + React islands for mutations. Soft capacity warning is client-side before Accept; the server still allows overfill. Keep RLS as the authz boundary with the publishable key.

## Critical Implementation Details

**Organizer seat vs INSERT RLS:** Do not try to insert `confirmed` from the Worker under the current self-pending policy. Prefer an `AFTER INSERT ON runs` SECURITY DEFINER trigger that inserts `(run_id, organizer_id, confirmed)` and a one-shot backfill for existing runs missing that row.

**DELETE surface:** Grant `DELETE` to `authenticated` and add RLS so a user may delete **only** (a) their own `pending` row (withdraw), or (b) their own `confirmed` row on a run they organize (leave team). Do **not** allow deleting `denied` rows — that would reopen Apply via UNIQUE + fresh pending insert and break the deny decision (6B).

**Soft capacity:** Warn in the organizer Accept UI when `confirmedCount >= max_participants`; still perform the UPDATE if they confirm. No DB trigger for capacity in this slice.

## Phase 1: Schema — leave team + organizer seat

### Overview

Make withdraw/leave and automatic organizer seating possible under RLS without weakening the pending-only self-apply rule.

### Changes Required:

#### 1. Participants migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_participant_apply_leave_and_organizer_seat.sql` (timestamp at implement time)

**Intent**: Unlock delete-based leave/withdraw and ensure every new (and existing) run has the organizer on the confirmed roster.

**Contract**:
- `GRANT DELETE ON public.run_participants TO authenticated`.
- RLS `DELETE` policies matching Critical Implementation Details (own pending; own confirmed if organizer).
- Trigger function + `AFTER INSERT ON public.runs` that inserts organizer as `confirmed` (ignore duplicate if somehow present).
- Backfill: for each run missing a `run_participants` row for `organizer_id`, insert `confirmed`.
- No changes to `participant_status` enum or public SELECT-confirmed rules.

#### 2. Regenerated types

**File**: `src/types/database.ts` (via local Supabase gen types — same workflow as prior slices)

**Intent**: Keep typed client aligned after migration apply.

**Contract**: Regeneration only; no hand-edits to generated enums/tables unless the project’s established gen script requires a documented follow-up.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on local Supabase (`npx supabase db reset` or `migration up` per project habit)
- Types regenerate without error; `npm run lint` passes on touched generated output if committed
- `npm run build` still succeeds after types update

#### Manual Verification:

- Create a new run (SQL or existing UI) → organizer appears as a `confirmed` `run_participants` row
- Existing run without seat gets a confirmed organizer row after backfill
- As applicant: can delete own pending row in SQL/Studio under authenticated role; cannot delete denied
- As organizer: can delete own confirmed seat; run row still has `organizer_id`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Participants service + API

### Overview

Centralize participant reads/writes and expose form-POST endpoints that mirror create-run error handling.

### Changes Required:

#### 1. Participants service

**File**: `src/lib/services/participants.ts` (new; share small helpers with `runs.ts` if needed without bloating it)

**Intent**: One place for roster queries and apply/withdraw/decide/leave mutations used by pages and API routes.

**Contract**:
- DTOs for public confirmed participant (at least nickname + ids as needed) and organizer pending row.
- Loaders: list confirmed for a run (join nicknames via `public_profiles` or equivalent safe source); list pending for organizer; load viewer’s own participation row if any; confirmed count helper.
- Mutations (typed Supabase client): apply (`pending` insert after `ensureOwnProfile`); withdraw (delete own pending); set status to `confirmed` | `denied` (organizer); leave team (delete own confirmed as organizer).
- Reject apply in service/API when run is missing/archived, `join_mode !== approval_required`, viewer lacks nickname, or viewer already has a row (any status) — map DB unique violations to clear errors.
- Do not enforce `min_points`; do not hard-block accept on capacity.

#### 2. Apply / withdraw / leave / decide API routes

**Files**:
- `src/pages/api/runs/[id]/apply.ts`
- `src/pages/api/runs/[id]/withdraw.ts`
- `src/pages/api/runs/[id]/leave-team.ts`
- `src/pages/api/runs/[id]/participants/[participantId]/decide.ts` (or equivalent single decide route with `status` form field)

**Intent**: Thin POST handlers following `src/pages/api/runs/index.ts`: auth, validate, mutate, redirect back to `/runs/{id}` with `?error=` on failure.

**Contract**:
- Unauthenticated → redirect `/auth/signin` (prefer preserving return path to the run when easy / already patterned).
- Apply: require nickname (same spirit as create); only `approval_required` active runs; insert pending.
- Withdraw: only own pending.
- Decide: only organizer (RLS enforces); body/action sets `confirmed` or `denied`; allow `denied → confirmed` and `pending → confirmed|denied`; do not invent a second Apply path.
- Leave-team: organizer removes own confirmed seat only.
- Success → redirect `/runs/{id}` (optional success query only if already used elsewhere; otherwise clean URL).

#### 3. Enrich run detail/list data as needed

**File**: `src/lib/services/runs.ts` and/or callers in Astro pages

**Intent**: Surface filled counts without a second ad-hoc query pattern on every page.

**Contract**: Extend list/detail DTOs or companion loader so UI can show `confirmedCount` / `maxParticipants`. Prefer one efficient query strategy (embed or count) consistent with existing `RUN_SELECT` style.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- New API modules export uppercase `POST` only (Astro convention)

#### Manual Verification:

- Signed-in user with nickname: Apply → pending row; Withdraw → row gone; Apply again works
- Organizer: Accept → confirmed on public roster; Deny → not public; later Accept on same denied row works; second Apply from denied user fails with clear error
- Leave-team: organizer drops from roster, still shown as organizer; Accept beyond capacity succeeds (API-level)
- Auto-join run: Apply endpoint refuses with clear error

**Implementation Note**: Pause for human manual confirmation before Phase 3.

---

## Phase 3: Run detail (and list) UI

### Overview

Replace the Participants placeholder with the real roster, apply/withdraw CTAs, organizer pending queue with soft capacity warn, organizer leave-team, and auto-join “coming soon” state. Wire guest → auth → back to run for the under-30s apply guardrail.

### Changes Required:

#### 1. Run detail participants section

**Files**: `src/pages/runs/[id].astro`; new React island(s) under `src/components/runs/` (e.g. apply / organizer pending actions — split only if it stays clear)

**Intent**: One composition on detail: public confirmed list + role-appropriate actions.

**Contract**:
- Show `Participants (confirmedCount/maxParticipants)` with confirmed nicknames (fallback label if nickname somehow null should be rare after gates).
- Guest: CTA to sign in / sign up with return to this run.
- Member, no row, `approval_required`, has nickname: Apply control (form POST).
- Member without nickname: prompt/link to set nickname before apply (reuse profile nickname API/patterns from create).
- Member with `pending`: status + Withdraw.
- Member with `denied` / `confirmed`: read-only status (no re-Apply); confirmed non-organizer has no leave in this slice.
- Organizer: pending list with Accept / Deny; before Accept when `confirmedCount >= maxParticipants`, soft confirm dialog (browser `confirm` acceptable for MVP); Leave team when organizer is confirmed on roster.
- `auto_join`: no Apply — copy that auto-join is coming soon.
- Keep Astro for SSR roster; React only for interactive forms. Reuse `FormField` / `SubmitButton` / `ServerError` / `cn()` as elsewhere.
- Surface `?error=` from API redirects.

#### 2. List filled counts (lightweight)

**File**: `src/pages/runs/index.astro` (and DTO from Phase 2)

**Intent**: Guests see how full a run is while browsing.

**Contract**: Show filled/capacity next to existing capacity display without turning the list into a dashboard of secondary widgets.

#### 3. Auth return path for apply

**Files**: auth pages/forms/API as needed (`src/pages/auth/signin.astro`, `signup`, related API) — minimal change

**Intent**: Guest who hits Apply intent can authenticate and land back on the same run to finish under the 30s guardrail.

**Contract**: Support a safe relative return URL (e.g. `/runs/{uuid}` only) through sign-in/sign-up success redirects; reject open redirects.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest opens detail → sees confirmed roster + sign-in CTA → after auth returns to run → sets nickname if needed → Apply &lt; ~30s
- Organizer pending Accept/Deny UI; soft warn when full but Accept still works; overfill reflected in counts
- Organizer Leave team → gone from Participants, still named as organizer on the page
- Auto-join run shows coming-soon; no apply control
- Withdraw pending works from UI
- Denied user cannot Apply again; organizer can later Accept them

**Implementation Note**: Pause for human manual confirmation; this phase completes the slice when Progress checkboxes are done.

---

## Testing Strategy

### Unit Tests:

- None required — no test runner in repo yet. Prefer pure helpers (e.g. return-URL allowlist) kept trivial enough to verify manually / via lint.

### Integration Tests:

- None automated. Use local Supabase + manual API/UI paths below.

### Manual Testing Steps:

1. Reset/apply migrations; confirm organizer seat on create + backfill on an old run.
2. User A creates approval run → appears in Participants as confirmed; Leave team → only organizer label remains; optional re-seat is out of scope unless they Apply (organizer may Apply like anyone else if not seated — product: after leave, Apply → pending → self-Accept is OK).
3. User B (guest) → sign up/in with return URL → nickname → Apply; User A Accept; B on public roster; counts update on list/detail.
4. User C Apply → A Deny → C cannot Apply again → A Accept later → C confirmed.
5. Fill to capacity → Accept another with soft warn → overfill allowed.
6. Pending Withdraw by applicant; auto-join run shows coming soon and Apply API fails.

## Performance Considerations

Roster sizes are bounded by `max_participants` (small). Prefer a single detail query or one extra participants query per page — avoid N+1 nickname fetches. List filled counts should use an aggregate or embed that stays cheap for MVP active-run volumes.

## Migration Notes

- Local: apply new migration via usual Supabase workflow; regenerate types.
- Remote: ships with production CD on `v*` tag (`supabase db push` in deploy workflow) — no special seed file for participants.
- Backfill is idempotent insert of missing organizer confirmed rows only.
- Rollback: dropping DELETE policies/trigger returns to pre-S-02 leave/seat behavior; app routes must ship with the migration (ordering: migrate before relying on leave/seat in UI).

## References

- Roadmap S-02: `context/foundation/roadmap.md`
- PRD: FR-001, FR-002, FR-004, FR-008, FR-009, US-01, Business Logic — `context/foundation/prd.md`
- Prior: `context/changes/run-domain-schema/plan.md`, `plan-brief.md`
- Prior: `context/changes/create-and-list-runs/plan.md`, `plan-brief.md`
- Schema: `supabase/migrations/20260729134008_run_domain_schema.sql`
- Detail shell: `src/pages/runs/[id].astro`
- Create API pattern: `src/pages/api/runs/index.ts`
- Runs service: `src/lib/services/runs.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema — leave team + organizer seat

#### Automated

- [x] 1.1 Migration applies cleanly on local Supabase — a3b311e
- [x] 1.2 Types regenerate without error; lint clean on committed generated output — a3b311e
- [x] 1.3 npm run build succeeds after types update — a3b311e

#### Manual

- [x] 1.4 New run seats organizer as confirmed participant — a3b311e
- [x] 1.5 Backfill seats organizer on existing run missing a row — a3b311e
- [x] 1.6 Authenticated user can delete own pending; cannot delete denied — a3b311e
- [x] 1.7 Organizer can delete own confirmed seat; run still has organizer_id — a3b311e

### Phase 2: Participants service + API

#### Automated

- [x] 2.1 npm run lint passes — c8301e1
- [x] 2.2 npm run build passes — c8301e1
- [x] 2.3 New API modules export uppercase POST only — c8301e1

#### Manual

- [x] 2.4 Apply → pending; Withdraw → gone; re-Apply works — c8301e1
- [x] 2.5 Accept/Deny/later Accept on denied; second Apply from denied fails clearly — c8301e1
- [x] 2.6 Leave-team works; Accept beyond capacity succeeds at API — c8301e1
- [x] 2.7 Auto-join Apply refused with clear error — c8301e1

### Phase 3: Run detail (and list) UI

#### Automated

- [x] 3.1 npm run lint passes
- [x] 3.2 npm run build passes

#### Manual

- [x] 3.3 Guest → auth return → nickname → Apply under ~30s
- [x] 3.4 Organizer pending UI + soft capacity warn; overfill allowed
- [x] 3.5 Organizer Leave team; still shown as organizer
- [x] 3.6 Auto-join coming-soon UI; no apply control
- [x] 3.7 Withdraw pending from UI
- [x] 3.8 Denied cannot Apply again; organizer can later Accept
