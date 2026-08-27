<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan-domain schema and RLS contract

- **Plan**: context/changes/clan-domain-schema/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 8f0aa32 (`feat(clan-domain-schema): Author schema migration (p1)`)
- **File**: supabase/migrations/20260827114633_clan_domain_schema.sql

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

Phase 1 Changes Required vs `20260827114633_clan_domain_schema.sql` (138 lines): every contract row MATCH. Git scope of 8f0aa32 is the migration plus earlier 10x plan artifacts (`change.md`, `plan.md`, `plan-brief.md`, `plan-review.md`, `crew-decisions.md`) — no extra product files. Working-tree dirt (`roadmap.md`, `shape-notes.md`, untracked foundation files) is not part of this commit.

Locked contract (plan-review F1 + crew `f1-on-conflict`):

- No `ON CONFLICT` on the seating insert (`values (new.owner_id, new.id)` only).
- No picture column, officer/role enum, `create_clan` RPC, or references to `runs` / `run_participants` / `run_invites` / `are_friends` / `can_view_run` / `is_run_invitee`.
- World SELECT (`USING (true)` split `TO anon` / `TO authenticated`), verified INSERT (`auth.uid() = owner_id`, `is_not_banned()`, `public_profiles.is_verified`, `points = 0`), freeze points (no `GRANT UPDATE` / no UPDATE policies), admin DELETE on both tables plus `GRANT DELETE` on `clan_members` for FK CASCADE.
- `owner_id` index is non-unique (optional `UNIQUE(owner_id)` skipped by Crew Lead).

Patterns compared to `20260825070003_player_labels.sql` (revoke-then-grant, guest SELECT, child admin DELETE), `20260821130000_friend_requests.sql` (inline verified INSERT), `20260731111849_participant_apply_leave_and_organizer_seat.sql` (DEFINER seating trigger, `search_path = ''`, `REVOKE ALL` from public, no client EXECUTE). Tag unique index is `lower(btrim(tag))` as planned (labels use `lower(name)` without btrim).

Phase 2 (`db reset`, types, RLS smoke) is out of scope. Progress 1.2 is deferred apply-proof by plan text; not treated as Phase 1 failure.

## Success criteria (Phase 1)

| ID | Check | Result |
|----|--------|--------|
| 1.1 | Migration exists as `*_clan_domain_schema.sql` | PASS — `supabase/migrations/20260827114633_clan_domain_schema.sql` |
| 1.2 | SQL valid enough for Phase 2 `db reset` | Deferred — not executed this review |
| 1.3 | Policy matrix matches Contract | PASS — SQL review |
| 1.4 | No picture / officers / RPC / run-table refs | PASS — SQL review |

## Findings

None.

## Dimension notes

- **Plan Adherence**: Tables, CHECKs (name nonempty + `char_length(name) <= 100` matching `runs_title_max_length_chk`; tag nonempty + `char_length(tag) <= 16`), unique tag index, `clan_members.user_id` PK, seating trigger, grants, and named policies match the Phase 1 contract.
- **Scope Discipline**: "What We're NOT Doing" held. No UI, RPC, run joins, membership INSERT, or UPDATE surface.
- **Safety & Quality**: DEFINER trigger is revoke-only (not Data-API granted). RLS WITH CHECK uses `(select auth.uid())`. Child DELETE policy present so admin CASCADE is not blocked. No secrets, no `FORCE ROW LEVEL SECURITY` (matches repo + plan).
- **Architecture**: Direct `INSERT` into `clans` under RLS; trigger-only DEFINER; no new helpers.
- **Pattern Consistency**: Matches labels/friends/run-seat conventions; no substantive mismatch.
- **Success Criteria**: 1.1/1.3/1.4 evidenced. 1.2 owned by Phase 2.

## Proceed

Crew override: no triage. Report saved; change remains `implementing` (Phase 2 not started). Next: `/10x-implement clan-domain-schema` Phase 2.
