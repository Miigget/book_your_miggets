# Auto-Join Mode (S-05) — Plan Brief

> Full plan: `context/changes/auto-join-mode/plan.md`
> Research: `context/changes/auto-join-mode/research.md`

## What & Why

Implement FR-014 / US-02: on a run whose organizer picked auto-join mode, a member who applies is confirmed on the participant list immediately if capacity remains — no organizer approval step. This replaces the "Auto-join is coming soon" placeholder shipped in S-02 and scales team formation past the approval bottleneck.

## Starting Point

`join_mode` (`approval_required | auto_join`) already flows DB → types → create form → list/detail UI; only the apply path is blocked (`applyToRun` throws for auto-join, island shows "coming soon"). RLS lets members insert only `pending` participation rows, and no SQL enforces capacity — S-02 shipped soft overfill on organizer Accept and explicitly deferred instant confirm + hard capacity races to S-05.

## Desired End State

A member opens an active auto-join run with a free slot, clicks "Join run", and is on the confirmed roster after one request. When the run is full they see a full state and the server rejects with "This run is already full". Concurrent applies against the last slot never overbook — exactly one winner. Approval-required runs behave exactly as before.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Race-safety mechanism | SECURITY DEFINER RPC `auto_join_run(p_run_id)` with `SELECT … FOR UPDATE` on the `runs` row, count + insert in one transaction | Only DB-level serialization survives concurrent Worker isolates; matches the repo's existing DEFINER patterns (`ensure_own_profile`, organizer auto-seat) | Research |
| Rejected alternatives | No RLS capacity WITH CHECK (snapshot reads race), no BEFORE INSERT trigger (fires on every insert path, breaks S-02 soft-overfill), no serializable isolation (not controllable via PostgREST) | Chose the narrowest mechanism that is actually race-safe | Research |
| RPC result shape | Discriminated text outcome (`confirmed`, `full`, `denied`, …), not raised exceptions | Lessons.md forbids leaking raw DB errors into `?error=`; explicit outcomes map cleanly onto `ParticipantError` messages | Plan |
| Endpoint | Reuse `POST /api/runs/[id]/apply`; branch inside `applyToRun` on `run.join_mode` | Same user action and redirect contract; `loadActiveRunForMutation` already returns `join_mode` | Research |
| Identity & gates in RPC | `auth.uid()` internally + re-check ban/nickname/active-window/participation in SQL | DEFINER RPCs are directly callable via PostgREST, so the DB must be authoritative | Plan |
| Capacity scope | Auto-join only; organizer Accept keeps S-02 soft overfill | Changing Accept semantics would silently revise a deliberate S-02 decision — out of slice | Research |
| Denied users | Stay blocked (existing message); no re-apply bypass | `unique (run_id, user_id)` + non-deletable denied rows is a standing S-02 rule | Research |
| Leaving after auto-join | Out of scope | Confirmed members can't leave in approval mode either — consistent; a leave feature is a separate change | Plan |
| Full-run UX | Disabled "This run is full" state client-side; server stays authoritative on stale counts | Cheap UX win without pretending the client count is truth | Plan |

## Scope

**In scope:**

- New migration: `auto_join_run` RPC (locking, capacity check, outcome contract) + regenerated `src/types/database.ts`
- `applyToRun` branch for auto-join + outcome→message mapping
- `RunParticipantActions` island: replace "coming soon" with join flow + full state

**Out of scope:**

- Hard capacity on organizer Accept; leave/withdraw for confirmed members; waitlists; join-mode editing; guest messaging changes; any test-runner introduction

## Architecture / Approach

DB-first: the RPC is the single authority for auto-join confirmation — lock run row → validate (mode, active window, ban, nickname, existing participation) → count confirmed → insert `confirmed` or return `full`. App layer keeps its friendly pre-checks for UX, calls the RPC, and maps outcomes to the existing `ParticipantError` → `?error=` redirect contract. UI reuses the existing apply form, relabeled "Join run" for auto-join.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB migration — `auto_join_run` RPC | Race-safe instant-confirm capability + typed RPC | Getting lock/count ordering wrong voids the race guarantee — verified by a concurrent SQL test |
| 2. Service branch + UI | Members can actually join; "coming soon" gone | Regressing the approval-required apply flow while touching shared code |

**Prerequisites:** S-02 shipped (done, `v0.1.3`); local Supabase via Docker for migration + race verification.
**Estimated effort:** ~1-2 sessions across 2 phases — small slice.

## Open Risks & Assumptions

- Confirmed auto-join members cannot leave a run; a mistaken instant join occupies a slot until archival (accepted — consistent with approval-mode confirmed members; future change if it hurts).
- The client-side full state can be stale in either direction; the server outcome is always authoritative (accepted by design).
- Assumes the Supabase type generator is run against local Supabase as in prior slices; CI needs no new secrets.

## Success Criteria (Summary)

- A member joins an auto-join run and appears on the confirmed roster immediately; filled counts update on detail and list.
- Two concurrent applies at the last slot produce exactly one confirmed participant — never an overbooked run.
- Approval-required runs and all existing participant flows behave exactly as before.
