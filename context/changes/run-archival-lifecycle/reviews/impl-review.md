<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Run archival lifecycle

- **Plan**: context/changes/run-archival-lifecycle/plan.md
- **Scope**: Phase 1–3 of 3 (full plan)
- **Date**: 2026-08-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Raw Auth/DB errors echoed from dev-quick-login

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/dev-quick-login.ts:54
- **Detail**: Unplanned local quick-login path pipes createError/updateError/signInError/nickError/catch messages into `?error=` on `/auth/signin`, reintroducing the info-leak class tracked in lessons.md. Mutation run APIs already use opaque fallbacks.
- **Fix**: Map failures to fixed user strings; log raw errors server-side only.
- **Decision**: FIXED

### F2 — Unplanned local-only dev quick-login (3 files)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/dev-quick-login.ts
- **Detail**: Feature commit also added `dev-quick-login.ts`, `/api/auth/dev-quick-login`, and sign-in buttons. Unrelated to FR-013 but gated to `import.meta.env.DEV` + localhost Supabase URL. Useful local DX; not a production surface.
- **Fix A ⭐ Recommended**: Keep; harden (opaque errors + split secrets from page-imported gate). Document as accepted EXTRA in review.
- **Fix B**: Remove the three files and revert signin changes.
- **Decision**: FIXED via Fix A (kept + hardened)

### F3 — Service-role key co-located with page-imported gate

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/dev-quick-login.ts:6
- **Detail**: Well-known local demo `service_role` JWT and account passwords live in the same module as `isDevQuickLoginEnabled()`, which `signin.astro` imports. Runtime gate is sound; residual risk is a future client import bundling the admin key.
- **Fix**: Split page-safe gate into `dev-quick-login.ts`; move accounts + service-role client to API-only `dev-quick-login-server.ts`.
- **Decision**: FIXED

### F4 — Incomplete lessons.md entry for redirect error leaks

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/lessons.md:26
- **Detail**: Lesson lists apply/withdraw/decide as leak sites but Rule/Applies-to are empty. Those mutation APIs already sanitize; the incomplete lesson wastes future agent tokens.
- **Fix**: Complete Rule and Applies-to for opaque `?error=` redirects at auth/mutation boundaries.
- **Decision**: FIXED
