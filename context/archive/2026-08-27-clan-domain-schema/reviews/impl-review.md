<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan-domain schema and RLS contract

- **Plan**: context/changes/clan-domain-schema/plan.md
- **Scope**: Phases 1–2 of 2 (full plan)
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: 8f0aa32 (p1), ee0072d (p2), e0097ed (epilogue)

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

## Grounding

Full-plan sweep of completed phases vs product files in `8f0aa32..e0097ed`:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| Migration `*_clan_domain_schema.sql`: tables, CHECKs, unique tag index, owner-seat trigger (no `ON CONFLICT`), grants, RLS | `supabase/migrations/20260827114633_clan_domain_schema.sql` (138 lines). Live DB after this review's `db reset`: 7 policies, trigger `clans_seat_owner_after_insert`, unique `clans_tag_lower_btrim_uidx`, `fk_to_runs=0` | MATCH |
| Local `npx supabase db reset`; no remote push | This review: `db reset` exit 0; last applied `20260827114633_clan_domain_schema.sql`. No `db push` in the three commits | MATCH |
| Generated `src/types/database.ts` includes `clans` + `clan_members`; do not hand-edit | `clan_members` L37, `clans` L77. No `create_clan` / `seat_owner_on_clan_insert` in `public.Functions` | MATCH |

Git product surface: migration + generated types only. Other committed files are 10x process (`change.md`, `plan.md`, `plan-brief.md`, `crew-decisions.md`, phase reviews). Working-tree dirt (`roadmap.md`, `shape-notes.md`, untracked foundation files) is not part of these commits.

Locked contract (plan-review F1 + crew `f1-on-conflict`) holds in SQL and in the applied DB: seating insert is `values (new.owner_id, new.id)` with no `ON CONFLICT`; no `UNIQUE(owner_id)`; membership PK is the second-clan abort.

## Success criteria (this turn)

| ID | Check | Result |
|----|--------|--------|
| 1.1 | Migration exists as `*_clan_domain_schema.sql` | PASS — `supabase/migrations/20260827114633_clan_domain_schema.sql` |
| 1.2 / 2.1 | `npx supabase db reset` exits 0 | PASS — this review, exit 0; applied `20260827114633_clan_domain_schema.sql` |
| 1.3 | Policy matrix matches Contract | PASS — SQL + live `pg_policies` (7 policies) |
| 1.4 | No picture / officers / RPC / run-table refs | PASS — SQL review; live `fk_to_runs=0` |
| 2.2 | `src/types/database.ts` includes `clans` and `clan_members` | PASS — L37 / L77 |
| 2.3 | `npm run lint` passes | PASS — 0 errors (123 pre-existing warnings, none in this change) |
| 2.4 | `npm run build` passes | PASS — `astro build` Complete |
| 2.5 | Anon / unverified / verified / admin RLS smoke | PASS — Phase 2 impl-review independently re-ran 16/16 JWT steps the same day. This turn confirmed grants/policies/trigger after a fresh reset (anon SELECT-only; no UPDATE on `clans`; no INSERT on `clan_members`; EXECUTE on seating fn only `postgres`) |
| 2.6 | Owner membership seated on insert without a second client write | PASS — Phase 2 review 16/16; this turn: trigger `clans_seat_owner_after_insert` / `seat_owner_on_clan_insert` DEFINER present post-reset |

YOLO residual (already in `crew-decisions.md`): 2.5/2.6 were specialist SQL, not Studio click-through. Not treated as rubber-stamping — Phase 2 review re-executed the matrix; this review re-applied the migration and re-read the live catalog.

## Dimension notes

- **Plan Adherence**: All Phase 1 contract rows and Phase 2 apply/types/smoke MATCH. No DRIFT / MISSING.
- **Scope Discipline**: "What We're NOT Doing" held. No UI, picture, officers, clan runs, membership INSERT grant, points writer, `create_clan` RPC, or remote `db push`.
- **Safety & Quality**: DEFINER seating function is revoke-only (`EXECUTE` granted only to `postgres`). INSERT CHECK uses `(select auth.uid())`. Child DELETE policy + `GRANT DELETE` present for CASCADE. Frozen points is grant-level (no UPDATE on `clans`). `authenticated` TRUNCATE/TRIGGER/REFERENCES on these tables matches sibling `player_labels` / `friend_requests` (repo default-privilege pattern, not unique to F-02).
- **Architecture**: Direct `INSERT` into `clans` under RLS; trigger-only DEFINER; no new helpers; types expose tables only.
- **Pattern Consistency**: Matches labels (revoke-then-grant, guest SELECT), friends (inline verified INSERT), run-seat trigger (`search_path = ''`, `REVOKE ALL FROM public`). Intentional deltas: unique on `lower(btrim(tag))` not name; no `ON CONFLICT`; no parent UPDATE grant.
- **Success Criteria**: 1.1–1.4 and 2.1–2.4 re-evidenced this turn. 2.5–2.6 evidenced by same-day Phase 2 independent smoke plus this turn's live catalog after reset.

## Prior phase reviews

- `reviews/impl-review-phase-1.md` — APPROVED (0c / 0w / 0o)
- `reviews/impl-review-phase-2.md` — APPROVED (0c / 0w / 0o)

## Proceed

Crew override: no triage. Report saved; `change.md` stays `impl_reviewed`. Next: archive is a separate step (not this invocation).
