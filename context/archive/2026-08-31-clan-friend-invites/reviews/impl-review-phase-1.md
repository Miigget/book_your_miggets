<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan friend invites — Implementation Plan

- **Plan**: context/changes/clan-friend-invites/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 3869abd (`feat(clan-friend-invites): add invite schema and accept trigger (p1)`)
- **Files**: `supabase/migrations/20260831115700_clan_friend_invites.sql`; `src/types/database.ts`

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

Phase 1 Changes Required vs `3869abd`:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| Enum `clan_invite_status` pending\|declined only | `create type … as enum ('pending', 'declined')` | MATCH |
| Table: uuid PK, three CASCADE FKs, default pending, timestamps, CHECK not-self, unique `(clan_id, invitee_id)` | Lines 10–20 | MATCH |
| Partial pending-by-invitee + pending-by-clan indexes | `clan_invites_invitee_pending_idx`, `clan_invites_clan_pending_idx` | MATCH |
| Extra btree `invitee_id` / `inviter_id` indexes | Lines 22–23; copies `friend_requests_*_id_idx`; not in NOT-DOING | EXTRA (benign) |
| REVOKE ALL from public/anon; GRANT select/insert/update/delete to authenticated; no anon SELECT | Live grants: authenticated has those four; anon has none | MATCH |
| No `GRANT INSERT` on `clan_members` | This file grants nothing on `clan_members`. Live: authenticated INSERT=false | MATCH |
| RLS TO authenticated; every uid is `(select auth.uid())` | 7 policies; no bare `auth.uid()` | MATCH |
| SELECT participant or `is_admin()` | `clan_invites_select_participant_or_admin` | MATCH |
| INSERT owner + pending + not banned + `are_friends` + clanless | `clan_invites_insert_owner_pending` | MATCH |
| UPDATE decline / reopen split; reopen re-checks friends + clanless + owner | `…_invitee_decline`, `…_owner_reopen` | MATCH |
| DELETE accept: invitee + pending + `are_friends` + `public.is_not_banned()` | `clan_invites_delete_invitee_accept` | MATCH |
| DELETE cancel: inviter + pending + not banned | `clan_invites_delete_owner_cancel` | MATCH |
| DELETE admin `USING (public.is_admin())` | `clan_invites_delete_admin` | MATCH |
| clans BEFORE DELETE INVOKER teardown GUC `app.clan_delete_teardown` `is_local=true` | `clans_before_delete_teardown`; EXECUTE denied to anon/authenticated/public | MATCH |
| DEFINER accept: teardown first, then `pg_trigger_depth() > 1`, then invitee+pending INSERT (no ON CONFLICT) + DELETE other pendings; no `is_admin()` skip | `clan_invites_before_delete_accept` lines 178–195 | MATCH |
| BEFORE UPDATE freeze pair + pending↔declined only | `clan_invites_before_update` raises on identity/status violations | MATCH |
| Types via `db:types`; no trigger Functions entries | Diff is generated `clan_invites` + enum only; Functions unchanged | MATCH |

Git scope of `3869abd` is the migration + types plus earlier 10x artifacts (`change.md`, `plan.md`, `plan-brief.md`, `plan-review.md`, `crew-decisions.md`). No extra product files. Working-tree dirt (`roadmap.md`, `shape-notes.md`, untracked foundation files) is not part of this commit. Dirty `plan.md` SHA write-back is ritual chicken-and-egg, not drift.

Migration `20260831115700` is local-only (not on linked remote). Matches “do not `db push`”.

## Success criteria (Phase 1)

| ID | Check | Result |
|----|--------|--------|
| 1.1 | `npx supabase db reset` exits 0 (after S-18 picture + admin clan update) | PASS — implementer at `3869abd`. This review did not re-wipe; `migration list` shows `20260831115700` applied locally after `20260831110000_admin_clan_update`. Live objects present. |
| 1.2 | `npm run db:types` — `clan_invites` present; not hand-edited | PASS — Row/Insert/Update + `clan_invite_status`; commit diff is three generated hunks; trigger fns absent from `Functions` |
| 1.3 | SQL smoke: anon/owner insert/accept/cancel/decline/reopen/grants/points | PASS — independent re-run of `/tmp/clan-friend-invites-smoke.sql`: 21/21 `passed=t`, `ALL PASSED`, rolled back |
| 1.4 | `npm run lint` exits 0 | PASS — 0 errors (148 pre-existing warnings) |
| 1.5 | `npm run build` exits 0 | PASS — `astro build` Complete |
| 1.7 | SQL smoke F1: admin CASCADE; no seat; other pendings remain; admin-invitee Accept seats | PASS — same smoke: `1.7-admin-cascade-*` and `1.7-admin-invitee-accept-seats` all `t` |
| 1.8 | SQL smoke F2: identity freeze on decline | PASS — `1.8-identity-freeze` `t` (`cannot change clan invite pair`) |
| 1.9 | SQL smoke F6: banned invitee DELETE fails, no seat | PASS — `1.9-banned-accept-fails` `t` (`deleted=0`) |
| 1.6 | Local Studio: columns/enum/unique; `clan_members` no INSERT | YOLO skip — not a defect. Residual: eyeball Studio. SQL already shows unique + grants. |
| 1.10 | Local Studio: admin DELETE policy, teardown trigger, `(select auth.uid())` | YOLO skip — not a defect. Live `pg_policy` / `pg_trigger` confirm all three. |

Independent smoke (JWT impersonation, rolled back):

| Step | passed | detail |
|------|--------|--------|
| 1.3-anon-no-select-grant | t | anon SELECT grant=false |
| 1.3-anon-select-denied | t | anon SELECT succeeded=false |
| 1.3-owner-insert-friend | t | |
| 1.3-owner-insert-non-friend-fails | t | denied |
| 1.3-owner-insert-already-member-fails | t | denied |
| 1.3-accept-seats | t | |
| 1.3-accept-deletes-row | t | deleted=1 |
| 1.3-accept-clears-other-pending | t | |
| 1.3-accept-leaves-other-declined | t | declined |
| 1.3-not-friends-delete-no-seat | t | deleted=0 |
| 1.3-owner-cancel-no-seat | t | deleted=1 |
| 1.3-invitee-decline | t | declined |
| 1.3-owner-reopen | t | pending |
| 1.3-no-clan-members-insert | t | grant=false insert_ok=false denied |
| 1.3-points-update-denied | t | denied |
| 1.7-admin-cascade-deletes-clan | t | deleted=1 |
| 1.7-admin-cascade-no-seat | t | before=6 after=5 |
| 1.7-other-clan-pending-remains | t | keep=1 |
| 1.7-admin-invitee-accept-seats | t | deleted=1 |
| 1.8-identity-freeze | t | cannot change clan invite pair status=pending |
| 1.9-banned-accept-fails | t | deleted=0 |

## Findings

None.

## Residual (not findings)

- **1.6 / 1.10 Studio visual** skipped under YOLO (human-action). Columns, unique, grants, admin DELETE policy, teardown trigger, and `(select auth.uid())` are evidenced by live catalog + SQL smoke; Studio click-through is residual risk only.
- **Teardown GUC is transaction-local.** Same-transaction leftover after admin clan DELETE would skip a later Accept (implementer reset the GUC inside the smoke script). One-statement PostgREST `deleteClanAsAdmin` does not hit this. Do not skip Accept because `is_admin()` is true — that case passed (`1.7-admin-invitee-accept-seats`).
- **Extra FK btree indexes** (`clan_invites_invitee_id_idx`, `clan_invites_inviter_id_idx`) were not listed in the plan. Sibling `friend_requests` pattern; not product-scope creep.

## Dimension notes

- **Plan Adherence**: Enum, table, grants, seven RLS policies, teardown GUC, DEFINER seating (guard order + no ON CONFLICT), UPDATE freeze, and generated types all MATCH. No MISSING items. Extra indexes only.
- **Scope Discipline**: “What We're NOT Doing” held — no `GRANT INSERT` on `clan_members`, no officers/runs/leave, no UI/API, no Vitest. Phase 2/3 files absent from `3869abd`.
- **Safety & Quality**: Accept is invitee DELETE + DEFINER seat. CASCADE cannot misfire Accept. Nested pending clears skip via `pg_trigger_depth() > 1`. Dual UPDATE hole closed by freeze RAISE. Trigger functions `search_path = ''`, `REVOKE ALL FROM public`, EXECUTE false for anon/authenticated/public. No secrets. No Data-API Functions entries for triggers.
- **Architecture**: Same family as `seat_owner_on_clan_insert` + `clan_members_delete_admin`. Roster remains `clan_members`; invite rows are pending\|declined only.
- **Pattern Consistency**: `(select auth.uid())`, dual UPDATE + freeze, revoke-then-grant, DEFINER without EXECUTE grant — matches `friend_requests` and F-02. Raise-on-identity (vs friends assign-back) is plan-specified, stricter.
- **Success Criteria**: 1.3/1.4/1.5/1.7/1.8/1.9 re-executed this review. 1.1/1.2 evidenced by live schema + generated diff. 1.6/1.10 are YOLO residual, not rubber-stamping.

## Proceed

Crew override: no triage (YOLO / Done). Report saved; `change.md` stays `implementing` so the crew does not route `impl_reviewed` → archive. Next: `/10x-implement clan-friend-invites` Phase 2.
