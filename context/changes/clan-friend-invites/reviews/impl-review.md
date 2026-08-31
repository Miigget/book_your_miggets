<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan friend invites — Implementation Plan

- **Plan**: context/changes/clan-friend-invites/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: `3869abd` (p1), `7e2ced6` (p2), `d9dc203` (p3) on `feature/clan-friend-invites`
- **Prior phase reviews**: all APPROVED, 0 findings (`impl-review-phase-1.md`, `impl-review-phase-2.md`, `impl-review-phase-3.md`)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## End-state (Crew Lead confirm)

| Check | Result | Evidence |
|-------|--------|----------|
| Owner picker on `/clans/{id}` only when owner | **Holds** | `clans/[id].astro` L45–52 load + L148–153 `client:load` island inside `{isOwner && …}` |
| Profile inbox (Accept / Decline / Cancel) | **Holds** | `profile.astro` L47–57 verified gate + L116 `ClanInvitesInbox`; no callers under `clans/` or `players/` |
| DEFINER seating | **Holds** | `clan_invites_before_delete_accept` `prosecdef=t`; INSERT `clan_members` in trigger only |
| No `clan_members` INSERT grant | **Holds** | Live `has_table_privilege('authenticated', …, 'INSERT')` = false. App has no `.from("clan_members").insert` |
| No pending chrome on public clan page | **Holds** | Clan detail: roster + owner picker only. No pending list, Accept, Decline, Cancel |
| No `/clans` prefix-protect | **Holds** | `PROTECTED_ROUTES` L6: `/clans/new` only. AGENTS.md keeps “Do not prefix-protect `/clans`” |

## Grounding

Product files in `3869abd^..d9dc203` vs Changes Required: MATCH on every planned contract item. **1 EXTRA (benign)** — non-partial `clan_invites_invitee_id_idx` / `clan_invites_inviter_id_idx` (same family as `friend_requests_*_id_idx`). **0 DRIFT. 0 MISSING.** Phase 3 did not touch `clans/[id].astro`; owner-only friend-graph load still holds.

Dirty foundation files (`roadmap.md`, `shape-notes.md`, untracked `context/foundation/*`) are not this change.

### Phase 1 — schema + types (`3869abd`)

Enum pending\|declined; table + unique pair; seven RLS policies with `(select auth.uid())` (admin DELETE is `is_admin()` only, as planned); teardown GUC then `pg_trigger_depth() > 1` then invitee seat; UPDATE freeze; generated `clan_invites` types; trigger fns absent from `Functions`. Live catalog this review: 7 policies, 3 new triggers, authenticated `clan_members` INSERT=false, anon `clan_invites` SELECT=false.

### Phase 2 — owner invite path (`7e2ced6`)

Send-path `CLAN_INVITEE_ALREADY_MEMBER` (“They already belong to a clan.”) distinct from `CLAN_ALREADY_MEMBER`. Eligible list = friends minus any-clan members minus this-clan pending (declined included). Send/reopen/cancel APIs + `safeClanInviteRedirect` (`/profile` \| `/clans/{uuid}`; `safeAuthReturnTo` not widened to `/profile`). Banner `serverError && (!isAdmin || isOwner)`.

### Phase 3 — inbox + seating UX (`d9dc203`)

`acceptClanInvite` DELETE + friends pre-check + `clan_members_pkey` → first-person copy. `declineClanInvite` UPDATE. Native Astro inbox on `/profile`. AGENTS.md mutation paths + owner-only picker + inbox-not-on-clan/player.

## Success criteria

| ID | Check | Result |
|----|--------|--------|
| 1.1 | `npx supabase db reset` | PASS — implementer at `3869abd`. This review did not re-wipe. Migration `20260831115700` is applied locally after S-18 admin clan update. |
| 1.2 | `npm run db:types` — `clan_invites` present; not hand-edited | PASS — Row/Insert/Update + enum; trigger fns absent from `Functions` |
| 1.3 / 1.7 / 1.8 / 1.9 | SQL smoke (accept/cancel/CASCADE/freeze/banned) | PASS — Phase 1 review 21/21 the same day. Live catalog this turn still shows grants/policies/triggers. Not re-wiped. |
| 1.4 / 2.1 / 3.1 | `npm run lint` exits 0 | PASS this turn — 0 errors, 167 warnings (`no-console` on logged PostgREST paths; lessons.md) |
| 1.5 / 2.2 / 3.2 | `npm run build` exits 0 | PASS this turn — `astro build` Complete |
| 2.3 / 3.3 | `PROTECTED_ROUTES` + owner-only load + AGENTS.md | PASS — middleware L6; `listEligibleClanInvitees` behind `isOwner`; Hard Rules paragraph |
| 2.12 | Page-level `?error=` | PASS — `serverError && (!isAdmin \|\| isOwner)`; `AdminClanControls` still gets `serverError` |
| 1.6, 1.10, 2.4–2.11, 2.13, 3.4–3.9 | Manual UI / Studio | YOLO skip — not a defect. Residual risk only; not rubber-stamped `[x]` |

## Findings

None.

## Residual (not findings)

- **All Manual Progress rows** skipped under YOLO (human-action): Studio eyeball (1.6, 1.10); guest/non-owner/owner picker click-through (2.4–2.11, 2.13); Accept seating UX, Decline/reopen, Cancel, unfriend stale Accept, two-pending clear, guest 404/email/runs (3.4–3.9). Schema/RLS/UI contracts are in code; Phase 1 SQL smoke covered seating, sibling-pending clear, not-friends DELETE, owner-cancel-no-seat, admin CASCADE, identity freeze, banned accept at the DB layer.
- **Extra FK btree indexes** on `clan_invites` (`invitee_id`, `inviter_id`) were not listed in the plan. Sibling `friend_requests` pattern; not product-scope creep.
- Phase-review residuals still true and already accepted: silent picker load failure; reopen-then-insert not one transaction; send `redirectTo` after `isUuid` not through `safeClanInviteRedirect`; outgoing inbox not friend-filtered (incoming is); `42501` mapped to friends copy.
- **`change.md` manuals vs stamp:** Progress still has `[ ]` manuals, so `/10x-implement` “After all phases” would Pause before `implemented`. This review stamps `impl_reviewed` per `/10x-impl-review`. Do not treat manuals as missing implementation.

## Dimension notes

- **Plan Adherence**: All three phases MATCH Changes Required. No MISSING. Extra indexes only.
- **Scope Discipline**: “What We're NOT Doing” held — no `GRANT INSERT` on `clan_members`, no prefix-protect `/clans`, no pending list on the public clan page, no player-page CTA, no leave/officers/runs/points UPDATE, no Vitest, no second issue.
- **Safety & Quality**: Accept is invitee DELETE + DEFINER seat. CASCADE teardown GUC cannot misfire Accept. Nested pending clears skip via `pg_trigger_depth() > 1`. Dual UPDATE hole closed by freeze. Owner-only friend graph. `?error=` is `ClanError` / fixed helper strings; PostgREST logged, not echoed (lessons.md). No email on clan-invite hydrate.
- **Architecture**: Writes stay on `clans.ts` + `ClanError`. HTTP is a friends-helper sibling. Roster still `getClanById`. Inbox is `FriendsInbox` sibling, not a React island.
- **Pattern Consistency**: `(select auth.uid())`, dual UPDATE + freeze, revoke-then-grant, DEFINER without EXECUTE grant, `invitee_ids` picker, native inbox forms — match friends + F-02.
- **Success Criteria**: lint + build re-executed this review. Catalog confirms INSERT freeze, policies, DEFINER. Manuals are YOLO residual, not rubber-stamping.

## Proceed

Crew override: 0 findings → Done (no triage). Report saved. `change.md` → `impl_reviewed`. Status is **not** `implemented` because Manual Progress rows remain (implement Pause). Next: Crew Lead — do not archive this invocation.
