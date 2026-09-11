---
project: "Book Your Miggets"
assessed_at: 2026-08-27T09:40:25Z
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript
  framework: Astro 7 (SSR) + React 19 islands
  build_tool: Astro CLI / Vite
  test_runner: null
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: Cloudflare Workers
gates_passed: 7
gates_failed: 0
---

## Stack Components

**Language.** TypeScript 5.9 (`package.json` `devDependencies.typescript`) on Node 22.14.0 (`.nvmrc`). `tsconfig.json` extends `astro/tsconfigs/strict` and sets `jsx: react-jsx`. ESLint uses `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked` (`eslint.config.js`). Typed: yes.

**Framework.** Astro 7.1.3 with `output: "server"` (`astro.config.mjs`), file-based routes under `src/pages/`, React 19 islands (`@astrojs/react`), Tailwind 4 (`@tailwindcss/vite`), shadcn/ui (`components.json` style `new-york`). Auth and data via Supabase (`@supabase/ssr`, `@supabase/supabase-js`). Brownfield PRD (`context/foundation/prd-v2.md`) keeps this stack: run-loop deltas and a new clans module land as pages, API routes, and Postgres — not a new framework.

**Build tool.** `astro build` / `astro dev` / `astro preview` (`package.json`). Vite is the bundler underneath (`overrides.vite: ^8.1.5`). Cloudflare adapter `@astrojs/cloudflare` 14.1.4.

**Test runner.** Not detected. No `test` script in `package.json`; no Vitest/Jest/Playwright config files. `AGENTS.md` already tells agents not to assume a test runner.

**Package manager.** npm (`package-lock.json`).

**CI/CD.** GitHub Actions: `.github/workflows/ci.yml` (`astro sync`, lint, build on push/PR to `main`); `.github/workflows/deploy.yml` on tags `v*` (Supabase migrations, Worker deploy).

**Deployment.** Cloudflare Workers via `wrangler.jsonc` (`@astrojs/cloudflare/entrypoints/server`, `nodejs_compat`). Production URL recorded in `AGENTS.md`.

**Instruction files.** `AGENTS.md` (canonical), `CLAUDE.md` (points at `AGENTS.md`), `.cursor/rules/` (workflow + product rules). Conventions for pages vs islands, API route exports, RLS migrations, and protected routes are already written down.

## Quality Gate Assessment

| Component   | Typed | Convention | Training Data | Documented | Verdict       |
| ----------- | ----- | ---------- | ------------- | ---------- | ------------- |
| Language    | ✓     | —          | —             | —          | pass          |
| Framework   | —     | ✓          | ✓             | ✓          | pass          |
| Build tool  | —     | ✓          | ✓             | ✓          | pass          |
| Test runner | —     | —          | —             | —          | not detected  |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

Applicable gates scored: 7 passed, 0 failed. Test runner is absent, so its training-data and docs cells are not scored.

### Gate Details

**Typed (language) — pass.** Evidence: `tsconfig.json` extends `astro/tsconfigs/strict`; `package.json` includes `typescript` and `@astrojs/check`; `eslint.config.js` extends `tseslint.configs.strictTypeChecked`. An agent can read types at function and module boundaries without running the app.

**Convention-based (framework) — pass.** Evidence: Astro file-based routing (`src/pages/` → URLs; API routes as uppercase `GET`/`POST` — `AGENTS.md` + `src/pages/api/`). Island split is explicit: Astro for layout, React only for interactive islands. Criteria reference names Astro as a convention-based example (file-based routes + island architecture). Project conventions are also written in `AGENTS.md` (protected routes, RLS migration naming, `cn()` for Tailwind).

**Popular in training data (framework) — pass.** Assessed inside the JS/TS family, not against other languages. Astro, React, and Tailwind are mainstream in that family. React 19 islands on Astro SSR is a documented Astro pattern, not a niche fork. Supabase + Cloudflare Workers are common companions in the same family; they are not the primary framework score.

**Well-documented (framework) — pass.** Official Astro docs are current and URL-addressable (`https://docs.astro.build`): pages/routing, on-demand rendering, Cloudflare adapter/deploy guides. Context7 `/withastro/docs` matches this project’s adapter shape (`@astrojs/cloudflare` in `astro.config.mjs`, `wrangler.jsonc` assets + `nodejs_compat`).

**Convention-based (build tool) — pass.** Evidence: single `astro.config.mjs` for output mode, integrations, adapter, and env schema; `src/pages/` as the route root; `wrangler.jsonc` as the Worker entry. Agents do not invent a custom bundler layout.

**Popular in training data (build tool) — pass.** Astro CLI + Vite are the default JS/TS web build path for this framework. `npm` + `astro build` is the documented production command.

**Well-documented (build tool) — pass.** Astro CLI and Vite have versioned official docs; this repo’s scripts match those names (`dev` / `build` / `preview`).

**Test runner — not detected.** No config file and no `test` script. Not a failed gate on an existing component; it is a missing component. `AGENTS.md` already compensates: “No test runner or `test` script in `@package.json` — do not assume Vitest/Jest until both config and a script exist.”

## Gaps & Compensation

No quality-gate failures on detected components. Compensation below is optional residual risk, not a failed-gate patch.

**Missing automated tests.** Agents may still invent Vitest/Jest unless they read `AGENTS.md`. That instruction is already present. Adding a runner is a health-check / later change decision, not a stack replacement.

**Astro 7 vs older training snapshots.** The project is on Astro `^7.1.3`. Official docs cover SSR and the Cloudflare adapter. `AGENTS.md` already pins Astro 7 SSR, islands, and “never add Next.js directives.” No extra rule required for this assessment.

**Brownfield change scope (`prd-v2.md`).** Clans, screenshots, archive/extend, map poll, and ownership stay on this stack (Astro pages + React islands + Supabase). No new runtime. Existing `AGENTS.md` rules (RLS per operation/role, comment ACL, 404-not-403 on restricted runs) remain the right steering for those features.

### Recommended Instruction File Additions

None required. Detected components pass the four criteria; `AGENTS.md` already covers the only residual gap (no test runner).

If a test runner is added later, replace the current “do not assume” sentence with the real command and config path, for example:

```markdown
- Tests: `npm test` runs Vitest (`vitest.config.ts`). Co-locate unit tests next to the module as `*.test.ts`. Do not add Playwright until a `playwright.config.ts` exists.
```

## Summary

The stack is agent-ready as it stands: TypeScript with strict checking, Astro’s file-based conventions, mainstream JS/TS training data, and current official docs. Instruction files already encode project-specific rules (islands vs pages, API routes, RLS, protected routes, deploy-on-tag).

Strengths: typed end-to-end, opinionated routing, CI lint+build, Worker deploy config on disk, dense `AGENTS.md`.

Gaps: no test runner (documented, not a failed criterion). Downstream `/10x-health-check` should treat that as a health item, not a stack-replacement signal.

Recommended next step: `/10x-health-check`.
