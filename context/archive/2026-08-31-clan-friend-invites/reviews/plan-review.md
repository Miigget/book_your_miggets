<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Clan friend invites

- **Plan**: context/changes/clan-friend-invites/plan.md
- **Mode**: Deep
- **Date**: 2026-08-31
- **Verdict**: SOUND
- **Findings**: 0 critical 0 warnings 0 observations
- **Re-review**: After REVISE. Prior F1–F6 are in `plan.md` / `plan-brief.md` (admin CASCADE teardown, UPDATE freeze, banner `(!isAdmin || isOwner)`, send-path “They already belong to a clan.”, `(select auth.uid())`, accept DELETE `is_not_banned()` + matching Progress/SQL smoke). No new substance gaps.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 11/11 existing modify-paths ✓, new paths absent as expected, 9/9 symbols ✓, brief↔plan ✓

Existing modify-paths: `src/lib/services/clans.ts`, `src/lib/services/friends.ts`, `src/pages/clans/[id].astro`, `src/pages/profile.astro`, `src/lib/safe-return-to.ts`, `src/lib/friend-mutation-http.ts`, `src/components/profile/FriendsInbox.astro`, `src/components/runs/CreateRunForm.tsx`, `src/middleware.ts`, `supabase/migrations/20260827114633_clan_domain_schema.sql`, `AGENTS.md`. New files (`clan_invites` migration, invite APIs, `InviteFriendsForm.tsx`, `ClanInvitesInbox.astro`, `clan-invite-mutation-http.ts`) correctly do not exist yet. `src/pages/api/clans/index.ts` (create) does not collide with planned `[id]/invites` or `invites/{accept,decline,cancel}`.

Symbols confirmed: `are_friends` (DEFINER, EXECUTE to `authenticated` only; not used on `friend_requests` policies; used from run RLS), `listPublicFriends` / `public_friendships` (`friends.ts:146`), `CLAN_ALREADY_MEMBER` = `"You already belong to a clan."` (`clans.ts:18`), 23505 mapped via `message`/`details`/`hint` `includes` (no `error.constraint`), `safeFriendRedirect` (`/profile` \| `/players/{uuid}` only), `safeAuthReturnTo` allows `/clans/{uuid}` but not `/profile` (sibling `safeClanInviteRedirect` still required), `seat_owner_on_clan_insert` DEFINER `search_path = ''` with no `clan_members` INSERT grant, `ClanDetail.ownerId` loaded and unused for UI, `PROTECTED_ROUTES` has `/clans/new` not `/clans`, `invitee_ids` on `CreateRunForm`, page-level `?error=` is `serverError && !isAdmin`. `docs/reference/contract-surfaces.md` absent — check skipped. `npm run db:types` exists in `package.json`.

Progress↔Phase: one `## Progress`; three `### Phase N` names match body headings; every Success Criteria bullet has a Progress checkbox (including F1/F2/F6 smokes 1.7–1.9 and F3 banner 2.12–2.13); phase bodies use plain bullets only.

Codebase verification (deep): F-02 INSERT freeze confirmed; friends dual-UPDATE + BEFORE UPDATE documents the permissive-OR hole; admin clan delete is `deleteClanAsAdmin` → `clans.delete()` relying on `clan_members` CASCADE + `clan_members_delete_admin`; **no** other `clans` FK children (picture is a column + Storage, not an FK); **no** `pg_trigger_depth` or `clans` BEFORE DELETE in migrations (accept + teardown triggers remain greenfield); `listPublicFriends` extra callers (`runs/new`, `runs/[id]/edit`, `players/[id]`) are read-only and out of this slice; no app `clan_members` INSERT.

Do not re-litigate Crew Lead decisions (DEFINER accept trigger, pending|declined + delete-on-accept, owner picker, inbox on `/profile`, exclude already-in-a-clan, sticky membership, accept clears other pendings, `are_friends` on accept, three phases, F1 teardown flag, F2 freeze). `crew-decisions.md` q1 still says “invitee UPDATEs”; the plan and q2 correctly specify DELETE — stale decision text, not a plan defect.

## Findings

None. Prior F1–F6 landed; Progress is consistent; no new CRITICAL/WARNING/OBSERVATION.
