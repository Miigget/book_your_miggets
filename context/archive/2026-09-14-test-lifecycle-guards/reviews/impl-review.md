<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Vitest + audience-active lifecycle guards

- **Plan**: context/changes/test-lifecycle-guards/plan.md
- **Scope**: Phase 1–3 of 3
- **Date**: 2026-09-14
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Cloudflare skip lives in astro.config.mjs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: astro.config.mjs:18
- **Detail**: Plan's Cloudflare fallback was only `test.environment: "node"` inside `getViteConfig()`. `environment: "node"` still booted `@cloudflare/vite-plugin` workerd (`ReferenceError: module is not defined`). Implementation skips the adapter when `process.env.VITEST` is set. Production `astro build` / `wrangler` do not set `VITEST`; a leaked `VITEST` on build would fail "server needs an adapter," not ship without Cloudflare. `getViteConfig()` was kept.
- **Fix A ⭐ Recommended**: Keep the env-gated skip. Document it as the Phase 1 adaptation (Astro issue #15878 workaround).
  - Strength: Runner boots, `@/` aliases still come from project config, no second alias map.
  - Tradeoff: Production config file has a test-only branch.
  - Confidence: HIGH — Vitest sets `VITEST`; sabotage and 13 units passed with this seam.
  - Blind spot: Have not run `astro build` with a stray `VITEST` in the environment.
- **Fix B**: Isolate the skip in `vitest.config.ts` (`getViteConfig` second arg / `configFile: false`) and revert `astro.config.mjs`.
  - Strength: Production config stays Cloudflare-only.
  - Tradeoff: Must re-declare `@/` or lose tsconfig aliases (verified when `configFile: false`).
  - Confidence: MEDIUM — earlier experiment lost `configAlias` aliases without an explicit `@` map.
  - Blind spot: Would re-test `@/` imports after the move.
- **Decision**: FIXED via Fix A — keep env-gated adapter skip in astro.config.mjs

### F2 — Vitest 5.x instead of planned 4.x line

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package.json:58
- **Detail**: Plan named "current Vitest 4.x line" and also `npm install -D vitest`, which resolved to `^5.0.0`. Node `22.14` and Vite `^8.1.5` peers are still satisfied. No coverage/UI/`globals` used.
- **Fix**: Leave 5.x; pin `vitest@4` only if a 5.x-specific failure appears.
- **Decision**: FIXED — leave Vitest 5.x

### F3 — test-plan.md §1 and §4 edited beyond §6.1

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:32, :83, :96
- **Detail**: Phase 3 contract was §6.1 only. §1 and §4 still said "no test runner." Those lines were updated in the same turn (lessons.md: update stale docs). `health-check.md` / `stack-assessment.md` were left for `--refresh`. §6.2–§6.5 remain TBD.
- **Fix**: Keep the stale-doc updates; they match the lesson and prevent the next agent from rediscovering "no runner."
- **Decision**: FIXED — keep §1/§4 stale-doc updates
