<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Admin Moderation Tools (S-06) Implementation Plan

- **Plan**: `context/changes/admin-moderation-tools/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-07
- **Verdict**: SOUND (REVISE before triage fixes — two WARNINGs, both fixed in plan)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING (F1 — fixed) |
| Plan Completeness | WARNING (F2 — fixed) |

## Grounding

8/8 paths ✓ (`src/middleware.ts`, `src/env.d.ts`, `src/pages/runs/new.astro`, `src/pages/runs/index.astro`, `src/components/Topbar.astro`, `src/components/Banner.astro`, `src/lib/services/participants.ts`, `README.md`), 4/4 symbols ✓ (`runs_delete_admin` @ `20260729134008:245`, `profiles_update_admin` @ `:179`, `enforce_profile_privileged_columns` @ `:116-137`, `Banner` imported in `src/layouts/Layout.astro`), brief↔plan ✓ (phases, decisions, scope match).

Codebase verification of riskiest claims (done inline against source, building on the two research subagent reports):

- `runs_delete_admin` is the only DELETE policy on `runs`; `run_participants.run_id → runs ON DELETE CASCADE` — confirmed. No migration needed.
- Admin ban/verify via plain RLS UPDATE works: `profiles_update_admin` + privileged-columns trigger allows admin writes, blocks member writes — confirmed.
- `profiles_update_own` has no ban check (nickname gap the middleware gate closes) — confirmed.
- `/runs` list page (`src/pages/runs/index.astro`) has no `searchParams`/`Banner` handling today — Phase 2 change 4 (notice rendering) is genuinely required, not duplicative.
- `src/lib/safe-return-to.ts` whitelists only `/runs/{uuid}` — NOT reusable for the ban-gate redirect (led to F1).
- No `src/pages/404.astro` exists — `context.rewrite("/404")` would fail (led to F2).
- Progress↔Phase consistency: one `## Progress` heading; all 3 phase names match; every Success Criteria bullet has a matching numbered Progress row; no checkboxes outside Progress — PASS.
- Contradiction / promise-gap scan: every Desired End State capability (delete, ban/unban, verify/unverify, friendly ban UX, 404 on `/admin`, Topbar link, README runbook) is backed by a phase change; no "NOT doing" item reappears in phases — PASS.

## Findings

### F1 — Ban-gate Referer redirect underspecified; existing safe-redirect helper cannot be reused

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, change 2 (middleware) + Critical Implementation Details
- **Detail**: The plan said "redirect to safe same-origin Referer path (else `/`)" without defining "safe". The obvious candidate helper, `src/lib/safe-return-to.ts`, whitelists only `/runs/{uuid}` paths — reusing it would break redirects from `/runs/new` or `/`, and a naive `Referer` passthrough is an open-redirect vector. The implementer would have to guess the contract.
- **Fix**: Specify the exact rule in the middleware contract: parse `Referer` with `new URL`; accept only when `origin === context.url.origin` and redirect to its `pathname`; otherwise `/`. Explicitly note `safe-return-to.ts` is not reusable here.
- **Decision**: FIXED (applied to plan.md — Phase 1 change 2 contract and Critical Implementation Details now carry the exact same-origin rule)

### F2 — `/admin` 404 mechanism ambiguous; no 404 page exists to rewrite to

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change 2 (middleware)
- **Detail**: The plan said "404 (rewrite/response, not redirect)" — but the repo has no `src/pages/404.astro`, so `context.rewrite("/404")` would itself 404 into Astro's fallback and the ambiguity leaves the implementer choosing between two mechanisms, one of which half-works.
- **Fix**: Specify returning `new Response("Not found", { status: 404 })` directly from middleware.
- **Decision**: FIXED (applied to plan.md — Phase 1 change 2 contract names the exact response)

### F3 — Banned-notice UI partially duplicates the middleware POST gate

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1, change 3
- **Detail**: Banned notices on run detail and `/runs/new` overlap with the middleware gate — a banned user who submitted the forms would already be friendly-blocked. However, the GET-time notices prevent users from filling forms that are guaranteed to fail, which is the better UX and only two small branches.
- **Fix**: None required — keep both layers; the duplication is intentional (gate = enforcement, notices = UX).
- **Decision**: ACCEPTED

### F4 — Banning an admin also disables their admin endpoints

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, change 2 (gate scope includes `/api/admin/*`)
- **Detail**: The ban gate covers all non-auth POST APIs, so a banned admin (banned by another admin) loses moderation abilities too. This is the desirable outcome for a compromised/rogue admin account; recovery is the same SQL runbook used for promotion.
- **Fix**: None — intended behavior, documented here for the implementer.
- **Decision**: ACCEPTED

## Triage Summary

- Fixed: F1, F2 (2) — edits applied directly to `plan.md`
- Accepted: F3, F4 (2)
- Skipped/Dismissed: none

**Verdict after fixes: SOUND** — all dimensions PASS; safe to hand to `/10x-implement`.
