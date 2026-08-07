<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auto-Join Mode (S-05) Implementation Plan

- **Plan**: `context/changes/auto-join-mode/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-07
- **Verdict**: REVISE → **SOUND after fixes** (F1, F2 applied to plan.md during self-triage)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS (1 observation) |
| Architectural Fitness | PASS |
| Blind Spots | WARNING (1 finding, fixed) |
| Plan Completeness | WARNING (1 finding, fixed) |

## Grounding

9/9 plan-referenced paths exist ✓ (all four cited migrations, `participants.ts`, `apply.ts`, `RunParticipantActions.tsx`, `[id].astro`, `database.ts`); symbols verified ✓ (`"not available yet"` block at `participants.ts:191`, coming-soon UI at `RunParticipantActions.tsx:100`, `loadActiveRunForMutation`, `countConfirmedParticipants`, `Functions`/`ensure_own_profile` in `database.ts`); brief↔plan consistent ✓ (phases, decisions, scope match). `docs/reference/contract-surfaces.md` absent — check skipped per convention.

Deep verification (codebase subagent) confirmed the riskiest claims: `applyToRun` ordering (`ensureOwnProfile` → `loadActiveRunForMutation` → auto-join block → nickname gate → participation pre-check → pending insert, `participants.ts:185-228`); `apply.ts:29` is the sole caller of `applyToRun`; island renders `Status: Confirmed` for confirmed non-organizers (`:162-166`) and denied message (`:153-160`) — no leave button for non-organizers, matching the plan's out-of-scope call; existing RPC pattern `supabase.rpc("ensure_own_profile")` at `runs.ts:217` with `Functions` typing in `database.ts:238-248`; blast radius of `join_mode`/`confirmedCount` confined to files the plan already lists (plus generated `database.ts`, which Phase 1 regenerates); CI runs only `astro sync` + lint + build (no db reset/typegen), and deploy's `supabase db push` applies the new function inertly — the plan's Migration Notes hold.

Progress↔Phase consistency: one `## Progress` heading; phase names match; every Success Criteria bullet has a numbered checkbox; no checkboxes outside Progress. ✓

## Findings

### F1 — Type-regeneration step doesn't name the repo's actual command

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Changes Required #2 / Automated Verification
- **Detail**: The plan said "Regenerate via the Supabase type generator (against local Supabase)" but the repo already has a canonical script: `package.json` → `"db:types": "supabase gen types typescript --local > src/types/database.ts"`. Leaving the command unnamed invites the implementer to improvise flags (remote vs local, schema selection) and produce a diff-noisy `database.ts`.
- **Fix**: Reference `npm run db:types` explicitly in the Intent and in the automated success criterion, noting it requires `npx supabase start`.
- **Decision**: FIXED — plan.md Phase 1 change #2 Intent and success criterion now name `npm run db:types`.

### F2 — `already_confirmed` mapped to an error makes the double-submit race look like a failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Changes Required #1 (outcome → behavior mapping)
- **Detail**: The plan originally mapped RPC outcome `already_confirmed` to the existing "You are already on this run" `ParticipantError`. But the most common way a member hits that outcome is a double-click on "Join run": the run-row lock serializes the two POSTs, the first returns `confirmed`, the second `already_confirmed` — and the user who just successfully joined would land on the page with an error banner. The app-level `getOwnParticipation` pre-check cannot catch this because both requests pass it before either insert lands.
- **Fix A ⭐ Recommended**: Treat `already_confirmed` as success (idempotent join) — redirect to the run page where the member sees their confirmed status. The pre-check still delivers the friendly message on genuine repeat visits.
  - Strength: Correct UX for the race the slice exists to handle; zero extra code — just a different branch target.
  - Tradeoff: A deliberate repeat POST (stale tab) silently succeeds instead of explaining; harmless since the page shows confirmed status.
  - Confidence: HIGH — outcome set is closed and the lock guarantees the second request sees the first's row.
  - Blind spot: None significant.
- **Fix B**: Keep the error mapping and debounce/disable the button client-side after first click.
  - Strength: No semantic change to the mapping table.
  - Tradeoff: Client-side-only mitigation; retried form POSTs (browser re-submit, flaky network) still surface the confusing error.
  - Confidence: MEDIUM.
  - Blind spot: Non-click resubmission paths unhandled.
- **Decision**: FIXED via Fix A — mapping updated; manual verification bullet and Progress step 2.9 (double-submit idempotency) added.

### F3 — Duplicated gates cost an extra round trip per auto-join apply

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 — Changes Required #1
- **Detail**: The auto-join path runs the app-level prelude (profile, active-window select, nickname, participation pre-check) and then the RPC re-validates everything. That is 3-4 extra queries per apply versus letting the RPC be the only validator. The duplication is deliberate: the pre-checks own the friendly per-state messages, the RPC owns authority (DEFINER functions are directly callable via PostgREST). At KoG scale the cost is negligible.
- **Fix**: None required; revisit only if apply latency ever matters.
- **Decision**: ACCEPTED

### F4 — Client-side "full" state can be stale in both directions

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Changes Required #2
- **Detail**: The disabled "This run is full" state renders from the server-side `confirmedCount` at page load. If a slot frees afterwards (organizer leave-team), the visitor must reload to join; if the run fills afterwards, the visitor's POST gets the server's `full` rejection. Both directions degrade gracefully and the plan/brief already record the server as authoritative.
- **Fix**: None; live capacity updates are out of scope for this slice.
- **Decision**: ACCEPTED

## Triage Summary

- Fixed: F1, F2 (Fix A) — applied directly to `plan.md`
- Accepted: F3, F4
- Verdict after fixes: **SOUND**
