---
change_id: multi-map-runs
mode: YOLO
started: 2026-09-04
updated: 2026-09-04
status: in-progress
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

## Decisions the Crew Lead made (no human)

### Critical
- **plan-q2** — How should multiple maps be stored? Chose **A: junction `run_maps` (run_id, map_id, position)**. Why: FK + uniqueness + ordered positions match `run_participants`/`run_invites`; JSON array loses catalog integrity.
- **plan-q3** — Fate of `runs.map_id` / `map_category`? Chose **A: keep both; sync `map_id` to first attached map (null if empty); category remains category-only fallback**. Why: S-28 lock field and existing verify/`list_player_public_runs` stay intact this slice; category-only cards keep working.
- **plan-q4** — Change clan verified-finish points this slice? Chose **A: no — still award `maps.points` for `runs.map_id` only**. Why: S-27 outcome is attach + show; DEFINER rewrite is a later change; first-map sync avoids `no_map` on new clan runs.
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
- Intent seeded from roadmap S-27 outcome + FR-009 + keep independent of S-28.
- Next stage after `status: new` → `/10x-plan`.
- **review-F3** — Public create is inline `runs.insert()` in the API, not `runs.ts`. Chose **A: name that insert (or a helper it calls) as the replace-all `run_maps` site**. Why: LOW-impact one-line plan fix; invite stays RPC-only.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync: #91 events new, planned, plan_reviewed → Backlog (link-roadmap S-27)
