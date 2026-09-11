<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pass run ownership (S-29) Implementation Plan

- **Plan**: context/changes/transfer-run-ownership/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-09-11
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: 5474f3f (feat p1), 5c99145 (Progress stamp)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Product files in `5474f3f^..HEAD` vs Phase 1 Changes Required. Context artifacts under `context/changes/transfer-run-ownership/` are 10x ritual, not product creep. Workspace dirt outside those commits (`.cursor/rules/10x-course.mdc`, `roadmap.md`, untracked foundation files) is ignored.

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `supabase/migrations/YYYYMMDDHHmmss_transfer_run_ownership.sql` | `20260911103000_transfer_run_ownership.sql` | MATCH |
| `src/types/database.ts` | `Functions.transfer_run_ownership` | MATCH |
| `src/lib/services/runs.ts` | `transferRunOwnership` + target-cap message | MATCH |
| `src/pages/api/runs/[id]/transfer.ts` | new POST | MATCH |
| `src/components/runs/OrganizerRunLifecycleControls.tsx` | Transfer select + confirm | MATCH |
| `src/pages/runs/[id].astro` | candidates + props | MATCH |
| `AGENTS.md` | organizer transfer + freeze exception | MATCH |

Missing vs plan: none. Unplanned product extras: none. Island still mounts only when `isOrganizer && !isArchived` (planned). `OrganizerRunLifecycleControls` has no other call site. `PROTECTED_ROUTES` unchanged. Admin routes / Dashboard cards untouched.

Locked Crew cuts verified:

- Owner = `runs.organizer_id` only. RPC: missing / non-organizer → `not_found` (no admin bypass). Matches complete_clan_run leak-safe load.
- Target = confirmed `run_participants` row, not self, not pending. App select is `listConfirmedParticipants` filtered `userId !== organizerId`. RPC `not_confirmed` for pending/denied/missing/self.
- Audience-active only: `is_run_active_row(archived_at, extended_until)`. Did **not** use `is_run_roster_open_row` — Complete does not freeze transfer.
- Clan-only: UI hides (`visibility !== "clan_only"` and empty candidates); RPC `clan_only`. No GRANT UPDATE rewrite (so `auto_join_min` grant list stays).
- Recipient 5-cap: `pg_advisory_xact_lock(8724, hashtext(new id))`; count other audience-active rows owned by the target (this row still belongs to the caller). Cap copy is `TRANSFER_TARGET_ACTIVE_RUN_CAP_MESSAGE` (“That player already has 5…”), not `ACTIVE_RUN_CAP_MESSAGE`.
- Restricted inherit-edit: non-public + target `public_profiles.is_verified` not true → `not_verified`.
- App errors: invalid uuid → “Pick a confirmed participant on this run.”; `not_found` / `not_authenticated` → “Run not found or no longer active”; `banned` → `BANNED_RUN_MUTATION_MESSAGE`; `not_active` → “This run is already archived.”; infrastructure → log + “Could not transfer this run”. Lessons.md: no raw PostgREST in `?error=`.
- Route copies `archive.ts` guards (`isUuid`, cookie client, `commentUnauthorized`, `runFail` / `wantsJson`). `new_organizer_id` via `formString` trim (same as `decide.ts`). Success `/runs/{id}` (JSON `{ ok, redirect }`). Not in `PROTECTED_ROUTES`.
- UI: native `<select name="new_organizer_id">` + `window.confirm` (“You will lose organizer tools…”); `Button variant="outline"` (not destructive); `postLifecycle` / `fetchFormJson`. No second island. No Dashboard Transfer.
- AGENTS.md: `POST /api/runs/{id}/transfer` (`organizer_id` only; audience-active only; confirmed, not pending, not self); DEFINER; do not GRANT UPDATE on `organizer_id`; clan-only cannot transfer; recipient 5-cap; Complete freeze list still join/leave/decide/kick/withdraw/edit/extend — **delete and transfer are allowed**; do not invent officer transfer.

What We're NOT Doing: none of the out-of-scope items appear in the product diff (no clan_only transfer, no GRANT on `organizer_id` / lifecycle stamps, no `runs_update_own` / INSERT cap-trigger edits, no participant-row writes, no officer/admin/Dashboard transfer, no test runner).

Local Postgres (this review, not a re-run of the full impersonation matrix):

- `transfer_run_ownership(uuid, uuid)` exists, `SECURITY DEFINER`, returns `text`.
- `EXECUTE` granted to `authenticated` (and owner `postgres`); not `anon` / `public`.
- Authenticated `UPDATE` columns on `runs` are title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility, auto_join_min — **not** `organizer_id`, `completed_at`, `archived_at`, `extended_until`, `verified_at`.

## Automated verification

Re-run this invocation:

| Command | Result |
|---------|--------|
| `npm run lint` | PASS — 0 errors (206 pre-existing-style `no-console` / Astro class warnings; new `console.error` on transfer matches lessons.md) |
| `npm run build` | PASS |
| Local RPC + GRANT | PASS — function live; authenticated has EXECUTE; authenticated has no UPDATE on `organizer_id` |

Progress 1.1–1.3 treated as done (Crew lock). Full impersonated actor-matrix (happy-path swap + pending/self/clan_only/archived/non-owner/5-cap fail-closed + PostgREST UPDATE still blocked + Complete freeze still blocks roster/edit) was not re-executed in this review.

## Manual verification

Progress rows 1.4–1.10 remain `- [ ]`. YOLO skips human-action manuals (Crew locked). Not a reject reason.

Static review is not a substitute for those click-throughs (Transfer + confirm, pending excluded, clan-only refused, completed still works, archived hidden, target 5-cap sentence, non-owner/officer POST).

Residual risk: friends-only listing keys off `are_friends(organizer_id, …)` — after transfer, friends of the old owner who are not friends with the new one drop off the Friends section (confirmed seats remain). Called out in plan-brief; not a defect. Unseated old organizer stays unseated (no participant insert).

## Findings

None.

## Notes

- Plan-review was skipped (token-save). Per-phase review was skipped. This full-plan pass is the only review.
- `change.md` stamped `impl_reviewed` by this review. Report written to disk only — no git commit (COMMIT_OK false).
- No triage: zero findings, no ⭐ picks.
