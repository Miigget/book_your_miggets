<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Clan-domain schema and RLS contract

- **Plan**: context/changes/clan-domain-schema/plan.md
- **Mode**: Deep
- **Date**: 2026-08-27
- **Verdict**: SOUND
- **Findings**: 0 critical 0 warnings 0 observations (1 closed)

Re-review after REVISE. Crew Lead applied F1 ⭐ (drop `ON CONFLICT`; skip optional `UNIQUE(owner_id)`). No remaining open findings.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 12/12 cited paths ✓, 0/0 clan migrations (absent as expected), 6/6 symbols ✓, brief↔plan ✓

Cited paths exist: `supabase/migrations/20260731111849_participant_apply_leave_and_organizer_seat.sql`, `20260821130000_friend_requests.sql`, `20260825070003_player_labels.sql`, `20260824101006_restricted_run_visibility.sql`, `src/types/database.ts`, `src/lib/supabase.ts`, `package.json`, `.github/workflows/deploy.yml`, `AGENTS.md`, `context/foundation/roadmap.md`, `context/foundation/prd-v2.md`, `context/archive/2026-07-29-run-domain-schema/plan.md`. Twenty migrations on disk (plan claim). No `*clan*` migration yet. `docs/reference/contract-surfaces.md` absent — check skipped.

Symbols: `seat_organizer_on_run_insert` uses `on conflict (run_id, user_id) do nothing` (`20260731111849_…:51-53`); `friend_requests_insert_sender_pending` inlines `public_profiles.is_verified` (`20260821130000_…:53-74`); `player_labels_name_lower_uidx` + revoke-then-grant + `USING (true)` split anon/authenticated + child `player_label_assignments_delete_admin` (`20260825070003_…:19-108`); `is_admin()` / `is_not_banned()` DEFINER + EXECUTE to authenticated only (`20260729134008_…:57-90`); `createServerClient<Database>` (`src/lib/supabase.ts:10`); `db:types` script (`package.json:13`). No `FORCE ROW LEVEL SECURITY` in `supabase/migrations/`. No `clans` / `clan_members` in `src/` or `database.ts`. `runs_title_max_length_chk` is `char_length(title) <= 100` (`20260825110000_…:10-11`).

Brief↔plan: cardinality, owner+trigger **without** `ON CONFLICT`, no `UNIQUE(owner_id)`, columns, unique tag, direct INSERT, world-readable membership SELECT, insert-only + frozen points + admin DELETE, no extra DEFINER helpers, F-02-only scope, two phases — all match locked crew decisions including **f1-on-conflict**.

Deep verification (inline, no nested agent): public/friends-only run create is a direct table INSERT; `create_invite_only_run` is invite-only only (`src/pages/api/runs/index.ts`). Child DELETE for FK CASCADE matches `player_labels` → `player_label_assignments`. Blast radius of this change is the new migration plus regenerated `database.ts`; no in-app clan callers. Progress↔Phase: one `## Progress`; Phase 1/2 names match; criteria 1.1–1.4 and 2.1–2.6 map; phase bodies have no checkboxes.

F1 close-out: Phase 1 trigger contract now inserts `(NEW.owner_id, NEW.id)` with **no** `ON CONFLICT`. Critical Implementation Details and Current State Analysis tell the implementer not to copy the run-domain conflict clause (global `user_id` PK vs per-`(run_id, user_id)`). Plan explicitly skips `UNIQUE(owner_id)` — membership PK already encodes one clan per player. Phase 2 smoke (“second clan fails”) is now consistent with the trigger. Admin-only membership delete without deleting the clan remains an Open Risk, not an F-02 hole.

## Findings

None open.

### F1 — Seating `ON CONFLICT DO NOTHING` lets a second clan commit

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 — Trigger contract (`ON CONFLICT DO NOTHING`)
- **Detail**: Closed. Prior plan copied `ON CONFLICT DO NOTHING` from `seat_organizer_on_run_insert`, which would commit a second clan with no membership row. Updated plan inserts with no conflict clause so the membership PK aborts the outer `clans` INSERT. Optional `UNIQUE(owner_id)` was not added (Crew Lead).
- **Fix**: In the Phase 1 trigger contract, insert `(user_id, clan_id) = (NEW.owner_id, NEW.id)` with **no** `ON CONFLICT`. Do not copy `on conflict (run_id, user_id) do nothing` from `seat_organizer_on_run_insert`. Keep the rest of the trigger (DEFINER, `search_path = ''`, revoke execute, no client GRANT). Optional hardening (not required to restore the smoke): make the planned `owner_id` index `UNIQUE` so the parent table also rejects a second owned clan before the trigger runs.
- **Decision**: FIXED via Fix A (drop `ON CONFLICT`; skip optional `UNIQUE(owner_id)`)
