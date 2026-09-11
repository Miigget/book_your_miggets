---
project: "Book Your Miggets"
checked_at: 2026-08-27T09:44:13Z
health_status: critical-issues
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 9
  moderate: 1
  low: 0
test_runner_detected: false
ci_provider: GitHub Actions
recommended_fixes: 4
---

## Dependency Health

### Lockfile

Status: present (`package-lock.json`)
Package manager: npm

### Security Audit

Tool: `npm audit --json`
Summary: 0 CRITICAL, 9 HIGH, 1 MODERATE, 0 LOW
Direct vs transitive: 1 direct HIGH (`wrangler`); 8 HIGH and 1 MODERATE transitive. All 10 report `fixAvailable: true`.

#### HIGH findings

- **wrangler** (direct, installed 4.113.0, range `4.16.0 - 4.113.0`) — inherits HIGH from `miniflare` (`sharp`, `undici`). Fix: update the direct dependency, e.g. `npm install wrangler@4.127.0 --save-dev` (latest on this run), then re-run `npm audit`.
- **miniflare** (transitive) — HIGH via `sharp` and `undici`; pulled by `wrangler` / `@cloudflare/vite-plugin`.
- **@cloudflare/vite-plugin** (transitive) — HIGH via `miniflare` and `wrangler`.
- **undici** `7.0.0 - 7.28.0` (transitive) — GHSA-4cwx-7wf7-3272 (HIGH, CVSS 7.4) plus several MODERATE cache/CRLF advisories. Fix: newer `undici` via `wrangler`/`miniflare` bump.
- **sharp** `<0.35.0` (transitive) — GHSA-f88m-g3jw-g9cj: inherited libvips CVEs. Fix: `sharp` ≥ 0.35.0 via `miniflare`/`wrangler`.
- **brace-expansion** (transitive) — GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895: DoS via unbounded expansion (CVSS 7.5). Fix: `npm audit fix` after reviewing the lockfile diff.
- **fast-uri** `3.0.0 - 3.1.4` (transitive) — GHSA-7p8r-x3mc-p8w7: host confusion via backslash authority (CVSS 7.5).
- **js-yaml** `4.0.0 - 4.3.0` (transitive) — GHSA-5p4m-2wfm-xmqj: quadratic CPU in `!!omap` (CVSS 7.5).
- **nanoid** `<3.3.18` (transitive) — GHSA-2v37-7h3g-55p8: infinite loop when custom generator size is zero (npm severity HIGH; CVSS 5.9).

MODERATE (1): **postcss** `<=8.5.22` — GHSA-fxqj-rqcc-2cmp: incomplete sourceMappingURL path fix when `from` is unset.

### Outdated Dependencies

Packages with major version gaps: 3

- **typescript**: 5.9.3 → 7.0.2 (2 major versions behind). Wanted stays 5.9.3 — do not jump to TypeScript 7 without a dedicated change; Astro 7 and `typescript-eslint` 8 expect the 5.x line.
- **eslint**: 9.39.4 → 10.9.1 (1 major). Wanted 9.39.5.
- **@eslint/js**: 9.39.4 → 10.0.1 (1 major). Wanted 9.39.5.

Other direct packages have wanted/latest on the same major (including `astro` 7.1.3 → 7.2.8, `wrangler` 4.113.0 → 4.127.0).

## Test Suite

Test runner: not detected
Tests found: not applicable
Test execution: not attempted

⚠ No test runner detected. The agent cannot verify its own changes.
Recommended: Vitest, using Astro’s `getViteConfig()` helper ([Astro testing guide](https://docs.astro.build/en/guides/testing/)):

```bash
npm install -D vitest
```

Add `vitest.config.ts`:

```ts
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    environment: "node",
  },
});
```

Add to `package.json` scripts: `"test": "vitest run"`. Then add `npx vitest run` to `.github/workflows/ci.yml` after lint. Update `AGENTS.md` to replace the “do not assume Vitest” sentence with the real command.

## CI/CD

Provider: GitHub Actions
Configuration: `.github/workflows/ci.yml` (push/PR to `main`); `.github/workflows/deploy.yml` (tags `v*`)

| Stage      | Status | Notes                                                                 |
| ---------- | ------ | --------------------------------------------------------------------- |
| Lint       | ✓      | `npm run lint` (ESLint + type-checked TypeScript rules)               |
| Test       | ✗      | not configured — no test runner, no CI test step                      |
| Build      | ✓      | `npm run build` with `SUPABASE_URL` / `SUPABASE_KEY` secrets          |
| Type check | ✓      | covered by type-aware ESLint; `npx astro sync` first; no `astro check` |
| Security   | ✗      | no `npm audit`, CodeQL, or Dependabot in `.github/`                   |

## Configuration

### High severity

None. `tsconfig.json` extends `astro/tsconfigs/strict`. `.gitignore` is present and excludes `.env`, `.dev.vars`, `node_modules/`, `dist/`.

### Medium severity

None. `.prettierrc.json` and `eslint.config.js` are present. Formatter and linter are configured.

### Low severity

- **`.editorconfig`** — editors (and some agents) will not share indent/charset defaults without it. Fix: add a root `.editorconfig` with `indent_size = 2` to match Prettier (`tabWidth: 2`). `.env.example` is already present (`SUPABASE_URL`, `SUPABASE_KEY`).

## Stack Assessment Cross-Reference

Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready

No quality-gate failures on the chosen stack. Operational health still flags the residual gap stack-assess already named (no test runner).

| Quality Gate Gap                                      | Health-Check Finding                                      | Status     |
| ----------------------------------------------------- | --------------------------------------------------------- | ---------- |
| none (typed / convention / training / docs all pass)  | `tsconfig` strict + type-aware ESLint in CI               | Aligned    |
| residual: test runner not detected                    | no runner, no tests, CI Test stage missing                | Reinforced |
| compensation: AGENTS.md “do not assume Vitest”        | `AGENTS.md` and `CLAUDE.md` present with that rule        | Mitigated  |

Recommended instruction-file additions from stack-assess: none required. After Vitest lands, replace the “do not assume” sentence with the real `npm test` command (stack-assess already drafted that block).

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. No test runner

**Impact**: The agent cannot verify its own changes. Brownfield work (run lifecycle, clans, screenshots) will land without an automated safety net.
**Severity**: critical
**Effort**: significant (> 1 hour)
**Fix**:

```bash
npm install -D vitest
```

Add `vitest.config.ts` with `getViteConfig()` from `astro/config` and `"test": "vitest run"` in `package.json`. Put a first test next to a pure helper (for example `src/lib/utils.ts`). Add `npm test` to `.github/workflows/ci.yml`. Update `AGENTS.md` with the real test command.

#### 2. HIGH dependency advisories (1 direct, 8 transitive)

**Impact**: Agents will keep pulling the same vulnerable lockfile. The only direct HIGH is `wrangler` (dev/deploy toolchain via `miniflare` → `sharp`/`undici`), not application runtime — still review before touching Worker or image-processing paths.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

```bash
npm install wrangler@4.127.0 --save-dev
npm audit
```

If HIGH remains on `brace-expansion`, `fast-uri`, `js-yaml`, `nanoid`, or `postcss`, inspect `npm audit` then apply a reviewed `npm audit fix` (do not use `audit fix --force` unless you accept major upgrades). Re-run `npm run lint` and `npm run build` after the lockfile changes.

#### 3. TypeScript two majors behind latest

**Impact**: `npm outdated` shows TypeScript 5.9.3 vs latest 7.0.2. Jumping majors will fight Astro 7 and `typescript-eslint` 8.
**Severity**: low
**Effort**: significant (> 1 hour) if done now — **do not treat as a prerequisite**
**Fix**: Stay on TypeScript 5.x for this change. If you later want 7, open a dedicated change after Astro/eslint peer ranges allow it. Ignoring `latest` here is the safe call.

#### 4. Missing `.editorconfig`

**Impact**: Convenience only. Prettier already pins style; agents may still emit mixed indent in non-Prettier files.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: Add `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

### Addressed in upcoming lessons (Category B)

None. CI, agent instruction files (`AGENTS.md`, `CLAUDE.md`), and deployment config (`wrangler.jsonc`, tag-based deploy workflow) are already in place. Remaining CI gaps (no test step, no audit/Dependabot) are covered by Category A items 1 and 2, not by a later “add CI from scratch” lesson.

## Summary

Health status: critical-issues

The stack is agent-friendly and local config is strong (strict TypeScript, ESLint, Prettier, lockfile, instruction files, GitHub Actions lint+build, Worker deploy). Two operational gaps dominate: there is no test runner, so the agent cannot check its own work, and `npm audit` reports 9 HIGH issues, one of them the direct `wrangler` pin. Those are addressable; they are not a reason to change Astro/React/Supabase.

Next step: add Vitest (and a CI test step) before expecting smooth agent-assisted implementation of the brownfield PRD; bump `wrangler` and re-audit; then continue with agent-assisted work on the existing instruction files.
