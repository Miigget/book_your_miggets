# Vitest + audience-active lifecycle guards — Plan brief

> Full plan: `context/changes/test-lifecycle-guards/plan.md`
> Research: `context/changes/test-lifecycle-guards/research.md`

## What and why

A run that is archived, or whose extend window has elapsed, must stop counting as audience-active: it must not occupy the organizer 5-cap and must not appear on the active list. The product has no test runner, so that rule can regress silently. This change installs Vitest, pins the AGENTS/PRD oracle as units, and makes `npm test` a CI gate.

## Starting point

`isRunActive` in `src/lib/run-lifecycle.ts` already matches the live formula, but nothing asserts it. The 5-cap query only drops stamped archive then filters in TS; the `/runs` list `.or(...)` can still fetch an elapsed-extend row with a recent `starts_at` until `mapRunRow` returns null. Join uses the same boolean; SQL twins stay untested here.

## Desired end state

`npm test` fails if archive or elapsed extend (including elapsed extend + recent `starts_at`) still counts as active, if the exact deadline instant stays active, or if a completed-in-window run is dropped from the 5-cap. Agents add the next unit next to the module as `*.test.ts`.

## Key decisions

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Oracle | AGENTS + PRD Guardrails/US-01; not S-24 plan-brief | S-24 dropped the 1-hour clock; live product restored it | Research |
| Coverage | Truth table + 5-cap filter + list gate; join = same boolean | Cheapest proof of the three consequences without HTTP | Plan |
| Seams | `countActiveFromRows` + `toActiveLifecyclePhaseOrNull`; service/mapper must call them | Inline `.filter` / private `mapRunRow` can drift while helper tests stay green | Plan |
| Edges | Exclusive `now ===` extend and grace; completed still counts toward 5-cap | Equality is visible on cap/list; Complete ≠ archive | Plan |
| SQL / apply HTTP | Out of this change | Cost × signal; dual-layer drift accepted until a later phase | Research |
| CI | Same job, after lint, before build; no extra secrets | Unit file does not need `SUPABASE_*`; fail before the expensive build | Plan |
| Docs | AGENTS + test-plan §6.1; leave health-check/stack-assessment | Cookbook is the next-unit path; `--refresh` owns those snapshots | Plan |

## Scope

**In scope:** Vitest via `getViteConfig()`, `vitest run`, extracted pures, Risk #1 units, CI step, AGENTS + §6.1.

**Out of scope:** Postgres/Playwright/Worker, apply HTTP, `audienceActiveOrFilter` string tests, folding `completed_at` into `isRunActive`, husky test hook, health-check/stack-assessment edits.

## Architecture / Approach

Clock math stays in `run-lifecycle.ts`. `countAudienceActiveRunsForOrganizer` queries unarchived rows then `countActiveFromRows`. `mapRunRow` uses `toActiveLifecyclePhaseOrNull` instead of a private `isRunActive` + phase pair. Tests import only that module, with one frozen `now` and literal expected values.

## Phases at a glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Install Vitest | Config + `test` script + lockfile | `getViteConfig` + Cloudflare adapter surprises |
| 2. Seams + Risk #1 units | Extracted helpers, wired callers, green `npm test` | Empty assertions (helper mirroring) or skipping B-recent |
| 3. CI + docs | `npm test` in CI; AGENTS + cookbook | Docs that still say “no runner” |

**Prerequisites:** Node 22.14; no product behavior change expected.
**Estimated effort:** ~1 session in 3 phases (infra is small; Phase 2 is the certificate bar).

## Open risks and assumptions

- SQL `is_run_active_row` can drift from TS; accepted for Phase 1.
- First Vitest run loads full Astro config; Node environment should be enough.
- `isRunActive` already matches the oracle; if a test fails, fix the helper to the table, not the table to the helper.

## Success criteria (summary)

- Archive or elapsed extend (with recent `starts_at`) does not increment 5-cap and does not pass the list gate.
- Exact extend/grace instants are inactive; completed-in-window still occupies a cap seat.
- `npm test` is the command agents and CI run.
