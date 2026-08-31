<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan friend invites — Implementation Plan

- **Plan**: context/changes/clan-friend-invites/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: d9dc203 (`feat(clan-friend-invites): add invitee inbox and seating UX (p3)`)
- **Files**: `src/pages/api/clans/invites/accept.ts`; `src/pages/api/clans/invites/decline.ts`; `src/lib/services/clans.ts`; `src/components/profile/ClanInvitesInbox.astro`; `src/pages/profile.astro`; `AGENTS.md`

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

Phase 3 Changes Required vs `d9dc203`:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| `acceptClanInvite`: DELETE pending as invitee; empty → not pending; not-friends/RLS → “You must be friends with the clan owner.”; `clan_members_pkey` → `CLAN_ALREADY_MEMBER` | `clans.ts` L697–741. Pre-DELETE `loadFriendIdSet` throws `CLAN_INVITE_MUST_BE_FRIENDS_WITH_OWNER` (L29/L718–720). `mapAcceptClanInviteError` maps `23505`+`clan_members_pkey` → L19 first-person copy; `are_friends` blob or `42501` → friends copy. Empty DELETE → `CLAN_INVITE_NOT_PENDING` | MATCH |
| `declineClanInvite`: UPDATE pending → declined as invitee | L743–768: `.update({ status: "declined" }).eq(invitee_id).eq(status, pending)`; empty → not pending | MATCH |
| POST `invite_id` + `redirect` via `clan-invite-mutation-http`; notices accepted/declined; default `/profile` | `accept.ts` / `decline.ts` POST only; helper default `safeClanInviteRedirect(...) ?? "/profile"`; notices “Clan invite accepted.” / “Clan invite declined.” | MATCH |
| Load incoming/outgoing only when verified (same gate as friends) | `profile.astro` L47–57 inside `if (own.isVerified)` with friends lists | MATCH |
| Incoming filtered to current friends; nicknames + clan name/tag; `NicknameLink`; optional `/clans/{id}` | Incoming: `friendIds.has(row.inviter_id)` L788–792. Hydrate: `clans` name/tag + `public_profiles` `id, nickname` only. Inbox links clan; `NicknameLink` for the other person | MATCH |
| Incoming Accept + Decline; outgoing Cancel `redirect=/profile` | `ClanInvitesInbox.astro` L50–63 / L90–96. Native Astro forms, no `client:*` | MATCH |
| Unverified: omit or one line that clan invites require friends; no new verify gate | Unverified copy L24–25. Accept/decline do **not** call `requireVerifiedViewer` | MATCH |
| Empty verified: “No pending clan invites.” | L27 | MATCH |
| AGENTS.md: mutation paths; inbox on `/profile` not clan/player; owner-only picker; keep no prefix-protect `/clans` and nickname-only roster | Hard Rules paragraph: all four sentences present; `Do not prefix-protect /clans` and `public_profiles (nickname only — never email)` kept | MATCH |

Git scope of `d9dc203` is the six product files plus 10x artifacts (`change.md`, `crew-decisions.md`, `plan.md`, `impl-review-phase-2.md`). No extra product files. `clans/[id].astro`, `players/[id].astro`, and `middleware.ts` are not in the commit. Working-tree dirt (`roadmap.md`, `shape-notes.md`, untracked foundation files, dirty `plan.md` / `crew-decisions.md`) is not part of this commit.

Inbox callers: `ClanInvitesInbox` and `listIncomingClanInvites` / `listOutgoingClanInvites` appear only under `src/pages/profile.astro`. No matches under `src/pages/clans` or `src/pages/players`.

## Success criteria (Phase 3)

| ID | Check | Result |
|----|--------|--------|
| 3.1 | `npm run lint` exits 0 | PASS — 0 errors (167 warnings; `no-console` on new `console.error` matches lessons.md / friends helper). Phase 2 was 164; +3 from accept/decline/list paths |
| 3.2 | `npm run build` exits 0 | PASS — `astro build` Complete |
| 3.3 | `AGENTS.md` documents inbox on `/profile` and owner-only picker; `PROTECTED_ROUTES` still does not prefix-protect `/clans` | PASS — Hard Rules paragraph. `middleware.ts` L6 still `["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile", "/clans/new"]` — `/clans` is not a prefix. Unchanged in this commit |
| 3.4–3.9 | Manual UI | YOLO skip — not a defect. Residual: Accept seating, Decline/reopen, Cancel, stale Accept, two-pending clear, guest 404/email/runs not click-tested |

## Findings

None.

## Residual (not findings)

- **3.4–3.9 manual UI** skipped under YOLO (human-action). Inbox placement, stale-Accept friends copy, no email in hydrate, and no pending chrome on `/clans/{id}` are evidenced in code. Click-through (guest roster after Accept, two-pending sibling clear, unfriend-then-forced-Accept) is residual risk only. Phase 1 SQL smoke already covered seating, sibling-pending clear, not-friends DELETE, and owner-cancel-no-seat at the DB layer.
- **Outgoing inbox is not friend-filtered.** Phase 3 contract requires incoming filter only. Desired-end-state “inbox omits rows where `are_friends` is false” is implemented on incoming. Owner still sees Cancel for a pending row after unfriend — cancel RLS does not require `are_friends`.
- **`mapAcceptClanInviteError` maps any `42501` to the friends copy** (`clans.ts` L691–693). Forced stale Accept is covered by the `loadFriendIdSet` pre-check (L718–720). A PostgREST RLS USING miss typically returns 0 rows → `CLAN_INVITE_NOT_PENDING`, not `42501`. Concurrent unfriend between pre-check and DELETE could show “not pending” instead of the friends string.
- **`sessionEmail` on `/profile`** is the existing own-profile form, not the clan-invite inbox. Hydrate never selects email.

## Dimension notes

- **Plan Adherence**: Accept/decline APIs, error mapping (stale friends + first-person already-member, not send-path “They already belong to a clan.”), `/profile` inbox, Astro forms, and AGENTS.md all MATCH. No MISSING items.
- **Scope Discipline**: “What We're NOT Doing” held — no prefix-protect `/clans`, no pending list on the public clan page, no player-page CTA, no `GRANT INSERT`, no Vitest, no second issue, no leave/officers/runs. Process files in the same commit are 10x ritual, not product creep. Phase 2 owner picker (`clans/[id].astro`) unchanged; still `isOwner` then `listEligibleClanInvitees`.
- **Safety & Quality**: Invitee-only DELETE/UPDATE; seating remains the Phase 1 DEFINER trigger (no client INSERT). `?error=` is `ClanError` constants or helper fixed strings; PostgREST logged, not echoed (lessons.md). Friend graph for the inbox is the viewer’s own pending rows + `public_friendships`, loaded only on signed-in `/profile` behind verified. No email on clan-invite rows. UUID checks; parameterized `.eq()`.
- **Architecture**: Clan invite writes stay on `clans.ts` + `ClanError`. HTTP reuses Phase 2 `postClanInviteMutation`. Roster still `getClanById`. Inbox is a `FriendsInbox` sibling, not a React island.
- **Pattern Consistency**: `accept.ts` / `decline.ts` match `friends/accept.ts` and `clans/invites/cancel.ts` (`invite_id`, shared helper, notices). Inbox markup matches `FriendsInbox.astro`. No extra verify gate on mutate (planned).
- **Success Criteria**: 3.1/3.2 re-executed this review. 3.3 evidenced in `AGENTS.md` + `middleware.ts`. 3.4–3.9 are YOLO residual, not rubber-stamping.

## Proceed

Crew override: no triage (YOLO / Done). Report saved; `change.md` stays `implementing` so the crew does not route `impl_reviewed` → archive. All three phases’ automated rows are done; remaining Progress is manual (YOLO residual). Next: Crew Lead decides implement-complete vs archive vs full-plan review (this invocation stops; do not archive).
