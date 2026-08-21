<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Add verified friends

- **Plan**: context/changes/add-friends/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation

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

### F1 — Extra BEFORE UPDATE status-machine guards close a real RLS hole

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260821111120_friend_requests.sql:157-168
- **Detail**: Plan trigger snippet only (1) rejects UPDATE of `accepted`, (2) pins `sender_id`/`receiver_id` on `pending`, (3) keeps the unordered pair on `declined` reopen. Implementation also rejects `pending` → anything except `accepted`/`declined`, and `declined` → anything except `pending`. That is extra vs the snippet, not a new surface. It is necessary: Postgres ORs PERMISSIVE UPDATE `USING` and `WITH CHECK` independently, so a declined receiver can `WITH CHECK` through `friend_requests_update_receiver_pending` (`status IN (accepted, declined)`). Re-run this review: with the trigger disabled, receiver UPDATE declined→accepted succeeded (1 row); with the trigger enabled, it raised `declined requests can only be reopened to pending`. Leave the guards in place. Optional: copy the two `if new.status` blocks into the plan snippet so Phase 2 does not "simplify" them back.
- **Fix**: Keep the extra guards. Optionally add a plan addendum that the BEFORE UPDATE trigger is the status machine (pending→accepted\|declined only; declined→pending only) because RLS WITH CHECK is OR'd across the two UPDATE policies.
- **Decision**: PENDING

## Verification

### Automated

| Check | Result |
|-------|--------|
| 1.1 Migration + RLS + grants + view columns | Pass. `20260821111120_friend_requests.sql` present; 7 policies `TO authenticated`; no `anon` grant on `friend_requests`; `public_friendships` columns are only `user_id`, `friend_id`. |
| 1.2 `npx supabase db reset` | Not re-run (destructive). Version `20260821111120` is in `supabase_migrations.schema_migrations`. Live objects match the file. |
| 1.3 `npm run db:types` | Pass. `npx supabase gen types typescript --local` is byte-identical to committed `src/types/database.ts`. Includes `friend_requests`, `public_friendships`, `friend_request_status`, `are_friends`. |
| 1.4 `npm run lint` | Pass (0 errors; 54 pre-existing `no-console` warnings in other files, none introduced by this phase). |
| 1.5 `npm run build` | Pass. |

### Manual (re-run locally via `postgres` + `SET LOCAL ROLE`, rolled back)

| Progress | Result |
|----------|--------|
| 1.6 verified INSERT pending | Pass (authenticated). Unverified sender/receiver INSERT → RLS. |
| 1.7 self-request | Pass. Authenticated: RLS (`sender_id <> receiver_id` in INSERT WITH CHECK). Owner: `friend_requests_not_self_chk`. |
| 1.8 unique unordered pair | Pass — `friend_requests_unordered_pair_uidx`. |
| 1.9 receiver accept/decline; sender cannot accept | Pass. Sender UPDATE pending→accepted = 0 rows. Receiver decline/accept = 1 row. |
| 1.10 sender DELETE pending; receiver cannot | Pass. Receiver DELETE = 0 rows; sender DELETE = 1 row. |
| 1.11 DELETE accepted; UPDATE accepted | Pass. Participant DELETE accepted = 1 row. Authenticated UPDATE accepted = 0 rows (no UPDATE policy). Owner UPDATE accepted raises `accepted friendships cannot be updated`. |
| 1.12 reopen declined with swap; second INSERT unique | Pass. |
| 1.13 anon SELECT | Pass. `friend_requests` → permission denied. `public_friendships` → 2 rows for one live edge. |
| 1.14 unverify hides live graph | Pass. View 2→0; `are_friends` true→false; accepted `friend_requests` row remains. |

Progress 1.6–1.14 are not rubber stamps: live DB matches commit `44e3f49`, and the smokes were re-run this review.

## Plan vs diff

Commit `44e3f49` on `feature/add-friends`.

- In plan and in diff: `supabase/migrations/20260821111120_friend_requests.sql` — MATCH. Enum, table, self-check, unordered unique index, sender/receiver/pending-inbox indexes, revoke `public`+`anon`, grant DML to `authenticated`, 7 named policies, `public_friendships` (`security_invoker = false`, two rows per live edge, both-verified join), `are_friends` (`STABLE` `SECURITY DEFINER` `search_path = ''`, execute to `authenticated` only). Trigger control flow matches the plan snippet plus F1 guards. INSERT/reopen verification goes through `public_profiles`, not `profiles`. `are_friends` is not referenced from `friend_requests` policies.
- In plan and in diff: `src/types/database.ts` — MATCH. Generated, not hand-edited.
- In plan, not in this phase: service, APIs, `/profile` inbox, `safeFriendRedirect` / `safeAuthReturnTo`, public CTAs — expected. Phase 2/3.
- In diff, not in plan: `context/changes/add-friends/*` docs from the 10x ritual — not product scope creep.

Authenticated also has default-privilege leftovers (`REFERENCES`, `TRIGGER`, `TRUNCATE`) on `friend_requests`, same as `nickname_change_requests` / `run_comments`. `anon` leftovers were revoked on the table. Not a new finding.

## Safety notes (not findings)

- Extra trigger guards are load-bearing, not cosmetic. Do not drop them in a later cleanup.
- `are_friends` adds null/self short-circuits (`a is not null and b is not null and a is distinct from b`) beyond the plan sentence. Harmless; live-graph rule is still accepted + both currently verified.
- Reopen WITH CHECK omits the unordered-pair predicate; the BEFORE UPDATE trigger enforces it (as in the plan snippet). Receiver-pending WITH CHECK omits explicit "ids unchanged"; the trigger assigns `new.sender_id/receiver_id := old.*` before WITH CHECK.
- Lessons `?error=` rule does not apply to this SQL-only phase.

## Decision

YOLO path: Done (no triage). `change.md` stays `implementing` — this is a phase review, not a full-plan impl-review.
