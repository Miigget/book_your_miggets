<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Restricted run visibility Implementation Plan

- **Plan**: context/changes/restricted-run-visibility/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-24
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

None.

## Evidence (phase 1)

### Plan vs diff

- **In plan and in diff**: `supabase/migrations/20260824101006_restricted_run_visibility.sql` (MATCH), `src/types/database.ts` via `npm run db:types` (MATCH). Known live-schema names (`organizer_id`, `starts_at`, `archived_at`, `run_participants`, `are_friends`, `auto_join_run`, `is_run_in_active_window`, `is_confirmed_participant`, `join_mode` enum, `p_join_mode public.join_mode default null`) match the plan’s intent and were not treated as drift.
- **In diff but not in phase 1 Changes Required**: change-folder docs (`plan.md` Progress SHA write-back, `crew-decisions.md`, `roadmap.md` S-15 `in-progress`). Benign process artifacts; no extra app/API surface.
- **In plan but not in diff**: none for phase 1. No UI, no `sync_run_invites`, no comment-policy widening, no hand-edit of generated types.

### Contract checks (migration)

- Enum `run_visibility` + `runs.visibility NOT NULL DEFAULT 'public'`; `run_invites` PK `(run_id, user_id)`, `user_id` index, RLS, no anon table grant, SELECT/INSERT/DELETE to authenticated; INSERT/DELETE use inlined active window (not `is_run_in_active_window()`).
- `is_run_invitee` / `can_view_run` STABLE DEFINER `search_path = ''`; `can_view_run` granted anon+authenticated, never calls `is_run_in_active_window`; `runs` SELECT inlines window + audience (`are_friends` / `is_run_invitee`) and does not call `can_view_run`.
- `runs_select_confirmed_participant` is `is_confirmed_participant(id)` with no archive conjunct; INSERT/UPDATE own WITH CHECK adds public-or-verified; UPDATE grant list includes `visibility`; `enforce_run_update_invariants` untouched.
- Confirmed `run_participants` SELECT and pending INSERT AND `can_view_run`; `auto_join_run` returns `not_active` on audience miss; `is_run_in_active_window` is window AND `can_view_run`.
- Required INVOKER RPCs `create_invite_only_run` / `set_run_visibility_and_invites`; empty invite-only raises `invite_list_empty` before mutate; new invitees must be current friends; existing snapshot ids may stay after unfriend.

### Automated verification

- **1.1** PASS — migration file present; RLS per operation on `run_invites`; no anon grant; default `public`.
- **1.2** PASS — `supabase_migrations.schema_migrations` contains `20260824101006` (live apply; did not re-run `db reset` so smoke data could be verified then removed).
- **1.3** PASS — generated types include `Enums.run_visibility`, `runs.Row.visibility`, `run_invites`, `can_view_run`, `is_run_invitee`, `create_invite_only_run`, `set_run_visibility_and_invites`. Re-ran `npm run db:types`: no diff.
- **1.4** PASS — `npm run lint` exit 0 (pre-existing `no-console` warnings only; 0 errors).
- **1.5** PASS — `npm run build` Complete.

### Manual verification (re-run this review, then deleted smoke rows)

- **1.6–1.9** PASS — anon/stranger see only public; organizer/admin see restricted; live friend sees friends-only; non-invitee friend does not see invite-only; after unfriend, non-seated loses friends-only, seated confirmed and invite snapshot still SELECT.
- **1.10–1.12** PASS — confirmed `run_participants` dump hidden for anon/stranger; `auto_join_run` on hidden UUID returns `not_active`; `is_run_in_active_window` false for non-audience, true for confirmed seat.
- **1.13–1.14** PASS — unverified INSERT restricted fails, public succeeds; invite RPC rejects `{}` with `invite_list_empty`, accepts ≥1 current friend, keeps unfriended snapshot id on replace.
- **1.15** PASS — PostgREST `GET /rest/v1/runs` as anon returned only the public seed id among four test ids.
- **1.16** PASS — unverified public→restricted fails WITH CHECK; public title save succeeds; title-only on leftover restricted fails until `visibility = public`.

No 42P17 recursion observed on `runs` / `run_participants` / `run_invites` SELECT under `anon`/`authenticated`.
