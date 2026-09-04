<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Multi-map session (S-27)

- **Plan**: `context/changes/multi-map-runs/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-04
- **Pass**: 2 (re-review after REVISE refine)
- **Verdict**: SOUND
- **Findings**: 0 critical 0 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 14/14 existing paths ✓, 15/15 symbols ✓, brief↔plan ✓, Progress mechanical ✓, no `docs/reference/contract-surfaces.md`.

Existing paths checked: `src/lib/services/runs.ts`, `src/components/runs/MapPicker.tsx`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/[id].astro`, `src/pages/runs/[id]/edit.astro`, `src/pages/api/runs/index.ts`, `src/pages/api/runs/[id]/index.ts`, `src/components/runs/ActiveRunCard.astro`, `src/components/runs/DashboardRunCard.astro`, `src/components/runs/RunPreviewCard.astro`, `src/pages/admin/users/[id].astro`, `src/lib/run-limits.ts`, `AGENTS.md`, `supabase/migrations/20260901140012_run_auto_join_min.sql`. New files correctly absent: `src/lib/run-maps.ts`, `src/components/runs/RunMapsSummary.astro`, `supabase/migrations/<ts>_run_maps.sql`.

Symbols confirmed live: `normalizeRunMapAndCategory` (`runs.ts:871`), `mapRunWriteError` (`:934`, substring match on `message|details|hint`), `RUN_SELECT` (`:64-93`, singular `map:maps` only), `runFieldsFromRow` (`:166`), `matchesMapOrOrganizer` (`:210`, one `row.map?.name`), `runRowFromPublicRpc` (`:508`), `listPlayerProfileRuns` (`:552`), `getOwnedActiveRunForEdit` (`:361`), `prepareOwnedActiveRunPatch` (`:1005`), `createInviteOnlyRun` / `setRunVisibilityAndInvites` (`:1156`, `:1397`, both omit `p_map_ids`), `resolveRunTitle`, `is_run_roster_open_row` (`20260901083008:20-31`, **three timestamptz args**, not uuid), `create_invite_only_run` 9-arg / `set_run_visibility_and_invites` 12-arg live in `20260901140012` (no later redefine), `list_player_public_runs` DEFINER (`20260831131219`, archived public included). `run_is_public` does not exist yet (name free). No `createRun` in `runs.ts`. Public create insert is `src/pages/api/runs/index.ts:235-251`. Brief phases/decisions/scope match the refined plan and crew-locked choices.

Progress mechanical: exactly one `## Progress`; Phase 1–3 headings match; every Success Criteria bullet has a matching Progress checkbox; phase bodies use plain `-` only.

This pass applied four LOW one-liners into `plan.md` (no product re-open): Phase 1 INSERT/DELETE uses the live three-arg `is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)` EXISTS (not a uuid); Progress 1.7 / 1.8 / 2.8 / 3.9 titles aligned to Success Criteria (F1 archived-public UI check restored on 3.9).

## Prior findings (pass 1 REVISE) — verified applied

Pass 1 (same day) was REVISE with F1–F3 Fix A. This pass confirms they are in phases, Critical Implementation Details, success criteria, and Progress — not only in Overview/Decisions.

### F1 — Guest Recent SELECT (`run_is_public`)

- **Required**: SELECT = parent visible OR DEFINER `run_is_public` (public incl. archived); do not widen `can_view_run` / archived `/runs/{id}`.
- **Where**: Implementation Approach §1; Critical Details (function body + SELECT using expression); Phase 1 Grants/RLS contract; Phase 1 Manual SC + Progress **1.8**; Phase 2 loaders (`listPlayerProfileRuns` batch, no second RPC); Phase 3 AGENTS.md + Manual SC / Progress **3.9** (archived public Recent + guest 404).
- **Status**: APPLIED. Settled product choice not re-opened.

### F2 — Setter `p_map_ids` NULL skip

- **Required**: setter default NULL = skip; `'{}'` or list replaces; create may default `'{}'`; no `coalesce` to `'{}'` on the setter.
- **Where**: Key Discoveries; Critical Details (create vs setter defaults; named cardinality exception); Phase 1 Invite RPCs contract; Phase 1 Automated SC + Progress **1.7**; Phase 3 AGENTS.md.
- **Status**: APPLIED. Settled product choice not re-opened.

### F3 — Public create write site

- **Required**: junction write at `src/pages/api/runs/index.ts` insert (or a helper that insert calls); no fictional `createRun`.
- **Where**: Current State; Critical Details F3; Phase 2 Overview + Service writes (“create is not in this file”) + API FormData contract; Phase 2 Manual SC + Progress **2.8**; Phase 3 AGENTS.md.
- **Status**: APPLIED. Live insert remains `:235-251`. Settled product choice not re-opened.

## Code verification (riskiest claims)

1. **Invite RPC DROP signatures** — Confirmed. Live create GRANT is `(text, uuid, text, timestamptz, integer, integer, join_mode, uuid[], integer)`; setter 12-arg ending `(join_mode, boolean, integer)` (`20260901140012:141-281`). No later DROP/CREATE. Copying that file is not stale. Current TS callers omit `p_map_ids` — F2 NULL-skip is what keeps Phase 1 backfill intact.
2. **`run_is_public` + archived public oracles** — Confirmed. Name unused in `src/` / `supabase/`. `can_view_run` returns false for non-privileged once not audience-active (`20260901083000:48-51`). `runs_select_active_anon` is audience-active + public. `list_player_public_runs` DEFINER selects `visibility = 'public'` with no archive predicate. F1 helper is required for guest Recent batch; plan does not widen `can_view_run`.
3. **F3 create insert** — Confirmed. No `createRun`. Public/friends/clan create is inline `.insert()` at `index.ts:235-251` then redirect; invite branch is `createInviteOnlyRun` only (`:212-232`). Insert writes `map_id` / `map_category` only today.
4. **DTO loaders** — Confirmed. Every `RunListItem` builder uses `RUN_SELECT` or `runRowFromPublicRpc`. Patching `runFieldsFromRow` + embed + profile batch covers list/detail/edit seed. No third orphan loader.
5. **Generated types for RLS helpers** — Confirmed. `Functions` already includes `can_view_run`, `is_run_organizer`, `is_run_roster_open_row`. `Functions["run_is_public"]` after `npm run db:types` matches this repo.

Blast radius beyond the plan’s file list (not extra UI forks): `src/pages/players/[id].astro` and `PlayerProfileRunSections.astro` consume `RunPreviewCard` / `listPlayerProfileRuns` — covered if DTO + card helper land. `Welcome.astro` / `runs/index.astro` / `DashboardRunSection.astro` only wrap named cards. `src/pages/runs/new.astro` mounts CreateRunForm. `enforce_run_update_invariants` does not lock `map_id`. Verify SQL left alone as planned. No other run insert/update APIs.

Sibling pattern: `is_run_roster_open_row` is column-args (not uuid); `run_participants` writes use `EXISTS` + those three columns. S-26 setter omit-to-keep is `p_update_auto_join_min` (F2 mirrors NULL-vs-empty on this function). `run-limits.ts` stays island-safe (no Supabase) — `run-maps.ts` is the same class.

## Findings

None. Prior F1–F3 are applied. Remaining nits were LOW Progress-title / SQL-signature hygiene and were edited into the plan this pass.

## Substance (why SOUND)

- **End-State Alignment**: Walking phases 1→3 reaches attach 0–8 maps, XOR + first-map sync, cards 3+N, compact detail, any-name `?map=`, invite RPC persist, guest Incoming/Recent including archived public without opening archived `/runs/{id}`, verify-finish unchanged. Success criteria cover F1 SQL + UI, F2 setter skip/replace, F3 public create insert.
- **Lean Execution**: Three S-26-shaped phases. No S-28, no verify SUM, no RPC DROP of `list_player_public_runs`, no fictional `createRun`. Shared `run-maps.ts` avoids MapPicker/API drift without a new framework.
- **Architectural Fitness**: Child table + invoker RLS + one DEFINER read helper used only in `run_maps` SELECT. Invite writes stay in-transaction. Public create stays at the live API insert. `runs.map_id` remains the S-28 lock / verify field.
- **Blind Spots**: Rollback drops `run_maps` + `run_is_public` and reverts invite signatures; legacy columns stay. Junction-after-insert failure: do not redirect as success (run row may remain; fallback `[map]`). Anon probe of public archived map names accepted in F1. YOLO skips Progress Manual rows (residual, already in brief).
- **Plan Completeness**: File/function-level contracts, named CHECKs for `mapRunWriteError`, runnable lint/build/`db:types`/SQL checks. No TBD/TODO. Progress↔SC titles match after this pass.

## Previous pass (2026-09-04, overwritten)

Pass 1 verdict was **REVISE** (0 critical / 3 warnings). Crew triaged Fix A on all three. Those findings are summarized under “Prior findings” above; the first-pass full write-up lived in this file until this overwrite. Triage: Fixed F1 (Fix A), F2 (Fix A), F3 (Fix A). Plan edits landed in the subsequent `/10x-plan` refine, then this re-review.
