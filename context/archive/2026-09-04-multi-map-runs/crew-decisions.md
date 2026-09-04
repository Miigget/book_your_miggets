---
change_id: multi-map-runs
mode: YOLO
started: 2026-09-04
updated: 2026-09-04
status: complete
---

# Crew decisions — multi-map-runs

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-09-04 | 10x-new | created change.md (S-27 / FR-009) |
| 2026-09-04 | gh-change-sync | `--event new` → #91 Backlog (1:1 S-27) |
| 2026-09-04 | 10x-plan | DECISION_REQUEST complexity + round-1; Crew answered ⭐ |
| 2026-09-04 | 10x-plan | DECISION_REQUEST round-2; Crew answered ⭐ |
| 2026-09-04 | 10x-plan | wrote plan.md + plan-brief.md; status planned |
| 2026-09-04 | gh-change-sync | `--event planned` → #91 Backlog |
| 2026-09-04 | 10x-plan-review | REVISE (0C/3W); Crew triaged ⭐ A on F1–F3 |
| 2026-09-04 | gh-change-sync | `--event plan_reviewed` → #91 Backlog |
| 2026-09-04 | 10x-plan | refine in place: F1–F3 folded into phases; status planned |
| 2026-09-04 | 10x-plan-review | second pass SOUND (0C/0W); LOW one-liners applied |
| 2026-09-04 | gh-change-sync | `--event plan_reviewed` → #91 Backlog |
| 2026-09-04 | git | branch `feature/multi-map-runs` from main |
| 2026-09-04 | 10x-implement p1 | schema/RLS/RPCs; commit `fcfa49c`; status implementing |
| 2026-09-04 | gh-change-sync | `--event implementing` → #91 In progress |
| 2026-09-04 | 10x-impl-review p1 | APPROVED; fold `is_not_banned()` into Phase 2 |
| 2026-09-04 | 10x-implement p2 | writes/loaders/filter + is_not_banned migration; commit `f16c9e2` |
| 2026-09-04 | 10x-impl-review p2 | APPROVED (0 findings) |
| 2026-09-04 | 10x-implement p3 | MapPicker/cards/AGENTS.md; commit `530b14f`; 3.10 YOLO-skipped |
| 2026-09-04 | 10x-impl-review p3 | APPROVED (0 findings) |
| 2026-09-04 | 10x-impl-review | full-plan APPROVED (0 findings); status impl_reviewed |

## Decisions the Crew Lead made (no human)

### Critical
- **plan-q2** — How should multiple maps be stored? Chose **A: junction `run_maps` (run_id, map_id, position)**. Why: FK + uniqueness + ordered positions match `run_participants`/`run_invites`; JSON array loses catalog integrity.
- **plan-q3** — Fate of `runs.map_id` / `map_category`? Chose **A: keep both; sync `map_id` to first attached map (null if empty); category remains category-only fallback**. Why: S-28 lock field and existing verify/`list_player_public_runs` stay intact this slice; category-only cards keep working.
- **plan-q4** — Change clan verified-finish points this slice? Chose **A: no — still award `maps.points` for `runs.map_id` only**. Why: S-27 outcome is attach + show; DEFINER rewrite is a later change; first-map sync avoids `no_map` on new clan runs.
- **archive-3.10** — Archive with Progress 3.10 still open? Chose **yes (YOLO auto-archive)**. Why: only a manual clan-fixture row remains; Verify/Complete code is unchanged vs main; full impl-review APPROVED.
- **review-F1** — Guest Recent cannot read archived public `run_maps`. Chose **A: SELECT = parent visible OR DEFINER `run_is_public` (public incl. archived)**. Why: batch-attach without DROP still works; do not widen `can_view_run` or archived `/runs/{id}`; catalog names on a public archived id are acceptable.
- **review-F2** — Phase 1 setter `p_map_ids default '{}'` would wipe junction on current 12-arg edits. Chose **A: setter default NULL = skip write; `'{}'` or a list replaces; create may default `'{}'`**. Why: same NULL-vs-empty lesson as S-26 on this function; Phase 2 always passes the array.

### Non-obvious
- **research-skip** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the signal is not a “how does X work” map request; `/10x-plan` already researches; 10x-new next-step is plan.
- **parent-link** — gh-change-sync `--parent`. Chose **omit**. Why: change-id equals roadmap Change ID `multi-map-runs` (S-27) → 1:1 link, ignore `--parent`.
- **plan-q1** — Plan complexity? Chose **B: MEDIUM**. Why: new child table + RLS + backfill + invite RPCs + MapPicker + shared cards is S-26-shaped, not a platform redesign and not a form-only LOW.
- **plan-q5** — Category vs map list? Chose **A: keep write XOR** (maps ⇒ category null; category only when list empty). Why: preserves S-14; mixed labels would fight cards; dropping category-only regresses a shipped feature.
- **plan-q6** — Map cap? Chose **B: 8**. Why: enough for one session without unbounded FormData/cards; 4 is too tight; 16 blows list scan.
- **plan-q7** — How cards/detail show the set? Chose **B: cards list names (truncate after 3 +N); detail compact rows**. Why: S-27 outcome is “show the set” without 8×7 catalog dumps.
- **plan-q8** — Untitled title fallback? Chose **A: keep today’s helper (first/synced map name; category-only stays “{nick} run”)**. Why: first-map sync stays honest; joining names overflows; changing S-14 titles is out of outcome.

### Obvious
- YOLO: ritual Phase 1 commit allowed (`COMMIT_OK`). Chose **yes**. Why: user chose YOLO for the full loop; never push / never amend.
- Next stage after `status: new` → `/10x-plan`.
- **review-F3** — Public create is inline `runs.insert()` in the API, not `runs.ts`. Chose **A: name that insert (or a helper it calls) as the replace-all `run_maps` site**. Why: LOW-impact one-line plan fix; invite stays RPC-only.
- **impl-p1-F1** — `run_maps` INSERT/DELETE omit `is_not_banned()`. Chose **fold into Phase 2 follow-up migration**. Why: APPROVED with LOW warning; sibling child-table writes include the helper; Phase 2 is the first app writer.
- PostgREST: after adding `run_maps`, parent embed `map:maps` needed `!runs_map_id_fkey` (two-path). Implementer adapted; Crew accepts.
- YOLO: ritual Phase 2 commit allowed.
- YOLO: ritual Phase 3 and leftover-docs commits allowed.
- YOLO: ritual archive commit allowed.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1.8 guest HTML GET `/runs/{id}` 404: implementer verified via REST + `can_view_run` false, not a live Astro GET. Residual: page mapping unproven in browser.
- Phase 2.4–2.8: SQL/curl against local Astro, not human UI. Residual: live form still posted `map_id` until Phase 3 MapPicker.
- Phase 3.4–3.9: verified via local Astro HTML + authenticated FormData (not a human click-through). Residual: MapPicker ninth *click* not driven in a browser; ninth *submit* returned the cap `?error=`.
- Phase 3.10: skipped (YOLO residual). No completed `clan_only` fixture in local DB; `showVerifyFinish` still `run.map != null`; Complete path untouched.

## Stop / escape hatches

- none

## GitHub

- change-sync: #91 events new, planned, plan_reviewed, implementing → In progress (link-roadmap S-27)
