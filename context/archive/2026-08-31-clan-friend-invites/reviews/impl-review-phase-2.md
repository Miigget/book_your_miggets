<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan friend invites — Implementation Plan

- **Plan**: context/changes/clan-friend-invites/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 7e2ced6 (`feat(clan-friend-invites): add owner invite path (p2)`)
- **Files**: `src/lib/services/clans.ts`; `src/lib/clan-invite-mutation-http.ts`; `src/lib/safe-return-to.ts`; `src/pages/api/clans/[id]/invites.ts`; `src/pages/api/clans/invites/cancel.ts`; `src/components/clans/InviteFriendsForm.tsx`; `src/pages/clans/[id].astro`

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

Phase 2 Changes Required vs `7e2ced6`:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| Send-path constant “They already belong to a clan.”; keep `CLAN_ALREADY_MEMBER` first-person | `CLAN_INVITEE_ALREADY_MEMBER` L27; used send pre-check L594 + send 23505 `clan_members_pkey` L134–135. `CLAN_ALREADY_MEMBER` stays L19 / create L334 / create 23505 L122–123 | MATCH |
| Other fixed English constants | L28–36: friends-with-you, friends-with-owner, not-owner, not-pending, pick-at-least-one, already-invited, send/update/load failed | MATCH |
| `listEligibleClanInvitees`: friends minus any-clan members minus this-clan pending; include declined; `public_profiles` nicknames | L505–548: `listPublicFriends` + `clan_members` (no clan filter) + pending for `clanId`; declined not excluded | MATCH |
| `inviteFriendsToClan`: owner check, empty reject, friend-id set, send-path already-member, pending throw or skip, declined UPDATE then INSERT, validate-then-write, 23505 via blob `includes`, log PostgREST | L551–661; pending throws `CLAN_INVITE_ALREADY_PENDING` (plan allowed “already invited”) | MATCH |
| `cancelClanInvite`: DELETE pending as inviter; empty → not pending | L663–683 | MATCH |
| Inbox helpers may land here; not on public clan page | `listIncomingClanInvites` / `listOutgoingClanInvites` L686–743; incoming filtered to friend-id set; **no callers** in pages/components; `[id].astro` does not import them | MATCH (allowed early land) |
| `POST` send: `invitee_ids`, unauth → sign-in, `/clans/{id}?notice=` / `?error=` fixed strings | `invites.ts` POST only; `parseInviteeIds`; notice “Clan invites sent.”; `redirectTo: /clans/${clanId}` after `isUuid` | MATCH |
| `POST` cancel: `invite_id` + `redirect`; `safeClanInviteRedirect` `/profile` or `/clans/{uuid}` (default `/profile`) | `cancel.ts` + helper L25; `safeClanInviteRedirect` L37–45; `safeAuthReturnTo` not widened to `/profile` | MATCH |
| HTTP helper copies friends, catches `ClanError` | `clan-invite-mutation-http.ts`: `wantsJson`, `ensureOwnProfile`, `instanceof ClanError` → `fail(err.message)`, else log + `CLAN_INVITE_UPDATE_FAILED` | MATCH |
| `isOwner` then `listEligibleClanInvitees`; never for guests/non-owners | `[id].astro` L45–52: `isOwner = Boolean(clan && user?.id === clan.ownerId)`; load only inside that `if` | MATCH |
| `InviteFriendsForm` `client:load` only when `isOwner`; `invitee_ids`; empty copy; `cn()`; no `"use client"` | L148–153 + form L26/L46/L33–36/L58; no `"use client"` | MATCH |
| Banner `serverError && (!isAdmin \|\| isOwner)`; still pass `serverError` to `AdminClanControls`; not inverted to admin-only | L75 and L162 | MATCH |
| No pending list / Accept / Decline on clan detail | None on `[id].astro` | MATCH |

Git scope of `7e2ced6` is the seven product files plus 10x artifacts (`change.md`, `crew-decisions.md`, `plan.md`, `impl-review-phase-1.md`). No extra product files. `profile.astro` and `middleware.ts` are not in the commit. Working-tree dirt (`roadmap.md`, `shape-notes.md`, untracked foundation files) is not part of this commit. Dirty `plan.md` SHA write-back is ritual chicken-and-egg, not drift.

## Success criteria (Phase 2)

| ID | Check | Result |
|----|--------|--------|
| 2.1 | `npm run lint` exits 0 | PASS — 0 errors (164 warnings; `no-console` on new `console.error` matches lessons.md / friends helper) |
| 2.2 | `npm run build` exits 0 | PASS — `astro build` Complete |
| 2.3 | `PROTECTED_ROUTES` has `/clans/new` not `/clans`; friend-graph load on clan detail is owner-only | PASS — middleware L6 `["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile", "/clans/new"]`; `listEligibleClanInvitees` only behind `isOwner` in `[id].astro`; page never imports `listPublicFriends` |
| 2.12 | Page-level `?error=` is `serverError && (!isAdmin \|\| isOwner)`; `AdminClanControls` still gets `serverError`; not inverted to admin-only | PASS — L75 and L157–163 |
| 2.4–2.11, 2.13 | Manual UI | YOLO skip — not a defect. Residual: guest/non-owner/owner picker, forced POST copy, reopen, cancel, admin-owner banner not click-tested |

## Findings

None.

## Residual (not findings)

- **2.4–2.11 / 2.13 manual UI** skipped under YOLO (human-action). Guest leak and owner-only load are evidenced in code (`isOwner` gate + no `listPublicFriends` on the page + island only when `isOwner`). Forced already-member copy is evidenced by `CLAN_INVITEE_ALREADY_MEMBER` on the send path. Click-through is residual risk only.
- **Picker load failure is silent.** `[id].astro` L48–51 swallows `listEligibleClanInvitees` errors; the owner then sees empty-eligible copy. `/players/{id}` surfaces a `friendsError` for the same class. Plan did not require a picker load banner; Phase 3 can add `CLAN_INVITE_LOAD_FAILED` if wanted.
- **Reopen-then-insert is not one transaction** (`inviteFriendsToClan` L616–659). Same non-transactional style as friends reopen/insert. Unique + 23505 mapping still apply. Constraint + retry is the existing family.
- **`options.redirectTo` is not run through `safeClanInviteRedirect`.** Current send call site passes `/clans/${clanId}` after `isUuid` — safe. Sign-in still uses `safeAuthReturnTo`. Future callers should not pass an unsanitized override.
- **Inbox helpers** landed in `clans.ts` as the plan allowed. Dead until Phase 3 UI; they do not leak on `/clans/{id}`.

## Dimension notes

- **Plan Adherence**: Service constants (including send-path already-member), eligible list, send/reopen/cancel, HTTP POST + `safeClanInviteRedirect`, owner-only picker, and banner condition all MATCH. No MISSING items.
- **Scope Discipline**: “What We're NOT Doing” held — no prefix-protect `/clans`, no pending list on the public page, no player-page CTA, no `GRANT INSERT`, no Vitest, no second issue, no leave/officers/runs. Inbox helpers are plan-allowed, not creep.
- **Safety & Quality**: Owner-only friend graph; guests never receive eligible nicknames as props. `?error=` is `ClanError` constants or fixed helper strings; PostgREST logged, not echoed (lessons.md). Send authz is owner check + RLS; cancel is inviter+pending DELETE (will not fire Accept seating). Email never selected. No injection (query builder + `isUuid` / `parseInviteeIds`).
- **Architecture**: Clan invite writes stay on `clans.ts` + `ClanError`. HTTP is a friends-helper sibling that does not route through `FriendsError`. Roster still `getClanById`.
- **Pattern Consistency**: `invitee_ids` matches `CreateRunForm`; cancel matches `api/friends/cancel.ts`; 23505 blob `includes` matches `friends.ts` / create-clan. `safeClanInviteRedirect` is a sibling of `safeFriendRedirect` and does not put `/profile` on `safeAuthReturnTo`.
- **Success Criteria**: 2.1/2.2 re-executed this review. 2.3/2.12 evidenced in source. 2.4–2.11/2.13 are YOLO residual, not rubber-stamping.

## Proceed

Crew override: no triage (YOLO / Done). Report saved; `change.md` stays `implementing` so the crew does not route `impl_reviewed` → archive. Next: `/10x-implement clan-friend-invites` Phase 3.
