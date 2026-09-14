# Implementation Plan: Vitest + audience-active lifecycle guards

## Overview

Install Vitest as the first in-repo test runner, pin the product oracle for audience-active (archive stamp vs extend vs 1-hour window) as unit tests, and wire `npm test` into CI. The tests prove Risk #1 from `context/foundation/test-plan.md`: an archived run, or one whose extend has elapsed, is not audience-active — it does not occupy the organizer 5-cap and it is absent from the active list. Join reject is the same boolean; this change does not add an apply/HTTP test.

## Current State Analysis

There is no Vitest config, no `*.test.*` / `*.spec.*`, and no `test` script. CI is `astro sync` + lint + build.

The TypeScript predicate is `isRunActive` in `src/lib/run-lifecycle.ts`. It currently matches AGENTS.md / PRD Guardrails + US-01, but that match is not a spec: tests must encode a frozen truth table against injected `now`, never `expect(isRunActive(x)).toBe(isRunActive(x))`.

The three Risk #1 consequences are consumers of that predicate (plus a SQL twin that stays out of this change):

| Consequence | App seam today | What Phase 1 pins |
|---|---|---|
| 5-cap | `countAudienceActiveRunsForOrganizer` loads `archived_at IS NULL` then `.filter(isRunActive)` | Extracted `countActiveFromRows` that the service must call |
| Active list | `listActiveRuns` `.or(audienceActiveOrFilter)` over-fetches fixture B; `mapRunRow` drops it | Thin `toActiveLifecyclePhaseOrNull` that `mapRunRow` must use |
| Join reject | `loadActiveRunForMutation` → same `isRunActive` + `"Run not found or no longer active"` | Same boolean only — no loader/HTTP test |

`audienceActiveOrFilter` is a known-leaky OR (`extended_until > now` **or** `starts_at` still in the 1-hour window). A row with an **elapsed extend and a still-recent `starts_at`** can be fetched for `/runs` and still sits in the 5-cap query `data` until `isRunActive` runs. Asserting the PostgREST `.or(...)` string would lock in that leak.

SQL `is_run_active_row` / the 5-cap trigger / `auto_join_run` are the twin layer. Worker `Date` vs Postgres `now()` may disagree by seconds (accepted in S-24). No pgTAP, no local Supabase boot.

Home `Welcome.astro` “Recent Runs” is `listActiveRuns` (audience-active public), not Recent-as-archived. Player/clan Recent and dashboard Past are the intentional “listed but not audience-active” surfaces. This plan’s “absent from the active list” means the `mapRunRow` / list-gate drop, not “invisible everywhere.”

## Desired End State

`npm test` (`vitest run`) is green locally and in CI after lint, before build. A frozen-now suite fails if archive or elapsed extend still counts as audience-active (including elapsed extend with a recent `starts_at`), if exact deadline equality stays active, or if a completed-but-still-in-window row is dropped from the 5-cap. Agents following `AGENTS.md` and `test-plan.md` §6.1 add the next unit next to the module as `*.test.ts`.

### Key findings:

- Oracle is AGENTS.md Hard Rules + PRD Guardrails / US-01, not S-24’s plan-brief (that brief dropped the 1-hour clock; live SQL restored it in `20260913132601_restore_in_progress_grace.sql`). FR-013 alone is incomplete (no extend column).
- `isRunActive` uses exclusive deadlines: `t < deadline` and `t < start + RUN_GRACE_MS` (`src/lib/run-lifecycle.ts:27-51`). `now === extended_until` and `now === starts_at + 1h` are **not** audience-active.
- `mapRunRow` is not exported (`src/lib/services/runs.ts:253-259`). Exporting the full mapper would drag `RunRow` / DTO fixtures into the first suite; a thin phase-or-null helper in `run-lifecycle.ts` is the list seam.
- `countAudienceActiveRunsForOrganizer` (`src/lib/services/runs.ts:1415-1430`) does **not** use `audienceActiveOrFilter`; elapsed-extend rows are in `data` until the filter. That is the cheapest 5-cap unit.
- Official Astro path (Context7 `/withastro/docs`): `vitest.config.ts` with `getViteConfig()` from `astro/config`. Script must be `vitest run`, not watch. Vitest 4 peers Vite `^6.4 \|\| ^7 \|\| ^8` and Node `^22.12`; this repo has Vite override `^8.1.5` and Node `22.14.0`.
- `astro.config.mjs` marks `SUPABASE_*` optional, so unit CI does not need those secrets. Build still does.

## What We're NOT Doing

- Postgres, pgTAP, `npx supabase start`, or asserting SQL `is_run_active_row` / the 5-cap trigger / transfer recipient cap
- Playwright, Worker boot, HTTP `POST /api/runs/{id}/apply`, or a mocked `applyToRun` / `loadActiveRunForMutation`
- Testing `audienceActiveOrFilter`’s string, `cn()`, layout snapshots, or generated `src/types/database.ts`
- Folding `completed_at` into `isRunActive` (Complete ≠ archive; join freeze is Risk #5 / rollout Phase 4)
- Reviving S-24 “clock must not end in-progress” (would fail fixture E)
- Coverage reporters, Vitest UI, husky `npm test` on commit, or updating `health-check.md` / `stack-assessment.md` (those stay on `/10x-test-plan --refresh`)
- Changing product behavior of `isRunActive` unless a test vs the oracle proves a bug — then fix the helper to the oracle, do not rewrite the table to match the bug

## Implementation Approach

Vertical, cheapest layer: one pure module owns the clock math; the 5-cap and list consumers call named helpers this suite owns. Vitest via Astro `getViteConfig()` so `@/` aliases and Vite 8 stay aligned. CI is the same job, after `astro sync` + lint, before build.

Extract before asserting consumers so the tests hit the functions `countAudienceActiveRunsForOrganizer` and `mapRunRow` must call, not a replica that can drift.

## Critical Implementation Details

- **Clock and equality.** Inject `now` as a number or `Date` into every assertion. Do not drive the oracle with `vi.useFakeTimers()` as the source of expected booleans — timestamps in the table are ISO strings relative to one frozen instant. Both clocks are exclusive: `now === extended_until` → inactive; `now === starts_at + RUN_GRACE_MS` → inactive. Invalid/NaN timestamps are already `false` in the helper; they are **not** named tests in this change.
- **Fixture B vs the list query.** The 5-cap and list-gate tests for elapsed extend **must** use a row whose `starts_at` is still inside the 1-hour window. A test that only uses an old `starts_at` plus elapsed extend can pass even if someone swaps the filter for `audienceActiveOrFilter`.
- **`getViteConfig` + Cloudflare.** Default environment is Node. If the Cloudflare adapter loaded through `astro.config.mjs` blows up Vitest, keep `getViteConfig()` and set `test.environment: "node"` (do not drop the Astro helper for a hand-rolled Vite config).

## Phase 1: Install Vitest

### Overview

Add the runner and `vitest run` script so later phases have a command. An empty suite may exit non-zero (`No test files found`); that is acceptable until Phase 2. Do not set `passWithNoTests: true`.

### Required changes:

#### 1. Vitest config

**File**: `vitest.config.ts` (repo root, new)

**Goal**: Load the Astro/Vite project settings so unit files can import `@/lib/run-lifecycle` without a second alias map.

**Contract**: Default export is `getViteConfig()` from `astro/config`, with a `test` object. Include `/// <reference types="vitest/config" />`. Do not add coverage, UI, or `globals: true` (import `describe` / `it` / `expect` from `vitest`).

#### 2. Package scripts and dependency

**File**: `package.json` (and lockfile)

**Goal**: CI and agents have one non-watch command.

**Contract**: `"test": "vitest run"` under `scripts`. `vitest` in `devDependencies` (current Vitest 4.x line; must satisfy Node 22.14 and the existing Vite `^8.1.5` override). Install with `npm install -D vitest` so the lockfile updates. Do not add a `test:watch` script in this change.

### Success criteria:

#### Automated verification:

- `vitest.config.ts` exists and default-exports `getViteConfig` from `astro/config`
- `package.json` `"test"` is `vitest run` and `vitest` is listed in `devDependencies`
- `package-lock.json` includes `vitest`

#### Manual verification:

- `npx vitest run` starts using this config (a “no test files” exit is OK until Phase 2)

**Implementation note**: After this phase and automated checks, stop for a human to confirm the runner boots before Phase 2.

---

## Phase 2: Extract seams and pin Risk #1

### Overview

Lift the 5-cap filter and the active-list null gate into `run-lifecycle.ts`, point the existing service functions at them, and add co-located units whose expected values come from the table below — not from calling `isRunActive` to compute the answer.

### Oracle table (frozen `now`; write ISO relative to that instant)

| Id | `archived_at` | `extended_until` | `starts_at` | Audience-active? |
|---|---|---|---|---|
| A | set | anything | anything | **no** |
| B | null | past | **still within 1h** | **no** |
| C | null | future | older than 1h | **yes** |
| D | null | null | within 1h (including upcoming) | **yes** |
| E | null | null | more than 1h ago | **no** |
| Eq-extend | null | **equal to `now`** | anything | **no** |
| Eq-grace | null | null | **`now - RUN_GRACE_MS` exactly** | **no** |
| F | null | null | within 1h, `completed_at` set | **yes** (still counts toward 5-cap) |

### Required changes:

#### 1. Pure 5-cap counter

**File**: `src/lib/run-lifecycle.ts`

**Goal**: The 5-cap consequence is a named function tests own, not an inline `.filter` that can disappear while tests still pass against `isRunActive`.

**Contract**: Export `countActiveFromRows(rows, now?): number` where each row has `starts_at`, `archived_at`, `extended_until` (extra fields such as `completed_at` are ignored). Count is the number of rows for which `isRunActive(...)` is true at `now`.

#### 2. Pure list gate

**File**: `src/lib/run-lifecycle.ts`

**Goal**: The active-list drop is the same clock rule `mapRunRow` uses, without importing `RunRow` / building a full `RunDetail` in the first suite.

**Contract**: Export `toActiveLifecyclePhaseOrNull(startsAt, archivedAt, extendedUntil, now?): ActiveRunLifecyclePhase | null`. Return `null` when the run is not audience-active; otherwise return `getRunLifecyclePhase(...)` (which will be `"upcoming"` or `"in_progress"`). Do not change `isRunActive`’s public signature.

#### 3. Wire the 5-cap service

**File**: `src/lib/services/runs.ts`

**Goal**: Production 5-cap cannot silently revert to “count every `archived_at IS NULL` row.”

**Contract**: `countAudienceActiveRunsForOrganizer` keeps the existing PostgREST query (`organizer_id` + `archived_at IS NULL`). After a successful fetch it returns `countActiveFromRows(data, now)` — no parallel `.filter(isRunActive)` beside it.

#### 4. Wire the list mapper

**File**: `src/lib/services/runs.ts`

**Goal**: `mapRunRow` cannot drop its audience-active check while `isRunActive` tests stay green.

**Contract**: `mapRunRow` obtains the phase from `toActiveLifecyclePhaseOrNull(...)`. If that is `null`, return `null`. Otherwise build the DTO with that phase (no second `if (!isRunActive)` / `if (phase === "archived")` that can diverge). Leave `mapArchivedRunRow` using `isRunActive` as today; do not expand this change into archived DTO tests.

#### 5. Unit file

**File**: `src/lib/run-lifecycle.test.ts` (new, co-located)

**Goal**: One file proves the oracle and the two extracted consumers. Import from `vitest` and `@/lib/run-lifecycle` only.

**Contract**: Shared frozen `now`. Expected booleans/counts are literals from the table (or named constants derived from `now` + `RUN_GRACE_MS`), never from `isRunActive`. Must include:

- `isRunActive` cases A–E
- Eq-extend and Eq-grace
- `countActiveFromRows`: B with recent `starts_at` contributes 0; C contributes 1; a mix of elapsed + unelapsed counts only the unelapsed; F (completed, in window) contributes 1
- `toActiveLifecyclePhaseOrNull`: B with recent `starts_at` is `null`; C is non-null (`"upcoming"` or `"in_progress"` per that fixture’s `starts_at`)

Do not import `runs.ts`. Do not assert `audienceActiveOrFilter`.

### Success criteria:

#### Automated verification:

- `countAudienceActiveRunsForOrganizer` returns `countActiveFromRows(data, now)`
- `mapRunRow` uses `toActiveLifecyclePhaseOrNull` for the null/phase gate
- `npm test` exits 0 covering A–E, Eq-extend, Eq-grace, 5-cap mix including B-recent and F, list-gate null for B-recent
- `npm run lint` passes on the new/changed TS files

#### Manual verification:

- Sabotage: temporarily make `isRunActive` always return `true`, run `npm test`, confirm the Risk #1 cases fail, revert. If the suite stays green, the assertions are empty.

**Implementation note**: After this phase and automated checks, stop for the sabotage confirmation before Phase 3.

---

## Phase 3: CI gate and agent docs

### Overview

Make `npm test` a required CI step and replace “there is no runner” instructions with the real command and cookbook so the next unit follows the same pattern.

### Required changes:

#### 1. CI

**File**: `.github/workflows/ci.yml`

**Goal**: A Risk #1 regression fails the PR before build.

**Contract**: Same `ci` job, after `npm run lint`, before `npm run build`: `- run: npm test`. No extra env/secrets on that step. Do not split a parallel test job.

#### 2. AGENTS.md

**File**: `AGENTS.md`

**Goal**: Agents stop assuming there is no runner, and learn where tests live.

**Contract**:

- Under **Commands**, add `npm test` — Vitest (`vitest.config.ts`), `vitest run` (not watch).
- Under **Commits & CI**, replace “No test runner or `test` script…” with: Tests: `npm test` runs Vitest (`vitest.config.ts`). Co-locate unit tests next to the module as `*.test.ts`. Do not add Playwright until a `playwright.config.ts` exists. Mention that CI runs `npm test` after lint and before build.

#### 3. Cookbook

**File**: `context/foundation/test-plan.md` §6.1

**Goal**: The next unit (rollout Phase 2+) copies this pattern instead of inventing a Worker harness.

**Contract**: Replace the TBD line. State: co-locate `*.test.ts`; command `npm test`; freeze `now`; encode expected values from AGENTS/PRD/research tables, never from the helper under test; inject `now` into `isRunActive` / `countActiveFromRows` / `toActiveLifecyclePhaseOrNull`; do not assert `audienceActiveOrFilter`; do not boot Postgres or Playwright for a lifecycle boolean; 5-cap tests must include elapsed-extend with a recent `starts_at`. Leave §6.2–§6.5 as TBD. Do not edit `health-check.md` or `stack-assessment.md`.

### Success criteria:

#### Automated verification:

- `.github/workflows/ci.yml` runs `npm test` after lint and before build
- `AGENTS.md` Commands lists `npm test` and the “do not assume Vitest” sentence is gone
- `context/foundation/test-plan.md` §6.1 is no longer TBD and names the co-locate + frozen-`now` + fixture-B-recent rules

#### Manual verification:

- Reading §6.1 + AGENTS Commands is enough to add another unit without opening this plan

**Implementation note**: After this phase, the change is ready for `/10x-implement` close-out / review. No product UI to click; CI on the eventual PR is the live gate.

---

## Testing Strategy

### Unit tests:

- Audience-active truth table on `isRunActive` (A–E)
- Exclusive equality at extend deadline and at `starts_at + 1h`
- `countActiveFromRows` 5-cap: B-recent → 0, mix, F still counts
- `toActiveLifecyclePhaseOrNull` list drop for B-recent; C still present

### Integration tests:

- None in this change (no fake Supabase client, no HTTP)

### Manual testing steps:

1. `npx vitest run` boots (Phase 1)
2. Sabotage `isRunActive` → suite fails → revert (Phase 2)
3. Confirm AGENTS + §6.1 describe `npm test` and `*.test.ts` co-location (Phase 3)

## Performance Considerations

First `getViteConfig()` load may pull the Astro + Cloudflare config; acceptable for a tiny unit file. Do not add a second Vite config to micro-optimize.

## Migration Notes

None. No schema, no data backfill. Existing CI secrets unchanged.

## References

- Research: `context/changes/test-lifecycle-guards/research.md`
- Test plan: `context/foundation/test-plan.md` (Risk #1, §3 Phase 1, stack row)
- `src/lib/run-lifecycle.ts:27-51` — `isRunActive` / `audienceActiveOrFilter`
- `src/lib/services/runs.ts:253-259` — `mapRunRow`
- `src/lib/services/runs.ts:1415-1430` — 5-cap count
- `.github/workflows/ci.yml` — current gate
- Astro testing: Context7 `/withastro/docs` (`getViteConfig`)
- Vitest: Context7 `/vitest-dev/vitest` (`vitest run`, Vite 8 peer)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Install Vitest

#### Automated

- [x] 1.1 vitest.config.ts default-exports getViteConfig from astro/config — f0bccf8
- [x] 1.2 package.json test script is vitest run and vitest is a devDependency — f0bccf8
- [x] 1.3 package-lock.json includes vitest — f0bccf8

#### Manual

- [x] 1.4 npx vitest run starts against this config (no-test-files exit OK until Phase 2) — f0bccf8

### Phase 2: Extract seams and pin Risk #1

#### Automated

- [x] 2.1 countAudienceActiveRunsForOrganizer returns countActiveFromRows(data, now) — 9eb0707
- [x] 2.2 mapRunRow uses toActiveLifecyclePhaseOrNull for the null/phase gate — 9eb0707
- [x] 2.3 npm test exits 0 for A–E, equality clocks, 5-cap B-recent + F, list-gate B-recent — 9eb0707
- [x] 2.4 npm run lint passes on new/changed TS files — 9eb0707

#### Manual

- [x] 2.5 Sabotage isRunActive always-true fails Risk #1 tests; revert — 9eb0707

### Phase 3: CI gate and agent docs

#### Automated

- [x] 3.1 ci.yml runs npm test after lint and before build — 231d7a5
- [x] 3.2 AGENTS.md Commands lists npm test; do-not-assume-Vitest sentence removed — 231d7a5
- [x] 3.3 test-plan.md §6.1 documents co-locate, frozen now, and fixture-B-recent — 231d7a5

#### Manual

- [x] 3.4 AGENTS + §6.1 are enough to add the next unit without this plan — 231d7a5
