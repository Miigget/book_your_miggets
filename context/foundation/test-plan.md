# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-14

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src` (92 commits / 30d). Highest churn directories: `src/pages`, `src/components/runs`, `src/pages/api`, `src/pages/runs`, `src/lib/services`.

The product has Vitest for unit tests (`npm test`). Phase 1 defends Risk #1. Later phases add join/create guards, restricted-run ACL, then a short e2e smoke — not an admin Playwright suite.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                              | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A run that is archived or whose extend window has elapsed still counts as audience-active: it occupies the organizer 5-cap, still accepts join, and still appears on the active list | High   | High       | Interview Q1–Q3; PRD Guardrails + US-01 + FR-013; roadmap S-24; archive `2026-08-31-manual-archive-and-extend`; hot-spot dirs `src/lib/services` (56/30d), `src/pages/api` (74/30d) |
| 2   | A guest or signed-in stranger can read a friends-only, invite-only, or clan-only run (body, roster, comments) instead of a not-found page                                            | High   | Medium     | Abuse/auth lens; PRD FR-027/FR-028; US-08/US-09; AGENTS.md restricted-run rule; roadmap S-21; hot-spot `src/pages/runs` (59/30d)                                                    |
| 3   | After the auto-join band is filled, the next applicant is confirmed immediately instead of waiting for approval (`band_full` treated as still auto-join)                             | High   | Medium     | Roadmap S-26; PRD US-02 / FR-014; AGENTS.md overlay rule; hot-spot `src/lib/services`, `src/pages/api`                                                                              |
| 4   | Create/edit API accepts capacity outside 1–64 or a `starts_at` that is in the past (create) / no longer audience-active (edit) / more than 1 year ahead                              | Medium | Medium     | Roadmap S-25; AGENTS.md form+API-only guards (no DB CHECK); hot-spot `src/pages/api`, `src/components/runs` (78/30d)                                                                |
| 5   | After a clan-only run is marked complete, players can still join, leave, decide, kick, edit, or extend it                                                                            | High   | Medium     | Roadmap S-22; AGENTS.md complete-freeze rule; hot-spot `src/pages/api`                                                                                                              |
| 6   | An unauthenticated visitor opens `/dashboard` or `/runs/new` and sees the signed-in hub instead of being sent to sign-in                                                             | High   | Low        | AGENTS.md `PROTECTED_ROUTES`; PRD Authentication FR-001/FR-002. Low likelihood: middleware is old and stable. Cheap e2e later, not Phase 1                                          |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                     | Must challenge                                                                           | Context `/10x-research` must ground                                                                                                                         | Likely cheapest layer                           | Anti-pattern to avoid                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| #1   | Given archived_at set, or extended_until in the past, the run is not audience-active: it does not consume the 5-cap, join is rejected, it is absent from the active list. Edge: extended_until still in the future stays active | "Listed on /runs" equals audience-active; archived and expired-extend are the same clock | Derived audience-active rule (archive stamp vs extend vs 1-hour window); who enforces 5-cap and join; oracle from PRD/AGENTS not from current return values | unit                                            | Asserting the helper returns whatever it returns today; happy-path-only upcoming public run |
| #2   | Requesting a restricted run as guest or non-audience user yields the same not-found outcome as a missing id — never a body, roster, or 403                                                                                      | Login alone is enough; 403 is an acceptable substitute for hide                          | Route/page vs RLS vs list sections; public vs friends vs invite vs clan; comment/screenshot ACL stays closed                                                | HTTP integration or thin e2e                    | Full admin Playwright; asserting 403; widening can_view_run "to make the test pass"         |
| #3   | When confirmed count has reached auto_join_min, the next apply is pending, not confirmed. Organizer seat counts toward the band. Unset auto_join_min does not invent a band                                                     | join_mode=auto-join still auto-joins after the band; overlay is cosmetic                 | Overlay vs join_mode; confirmed vs pending; freeze of both fields after first non-organizer participant                                                     | hermetic integration (roster fixture or stub)   | Mocking the overlay calculator to echo production; testing only empty-run auto-join         |
| #4   | API rejects capacity outside 1–64 and illegal starts_at even if the form is bypassed. Existing capacity > 64 may remain until the organizer changes it                                                                          | Client validation is sufficient; Postgres will CHECK it                                  | Create vs edit rules; audience-active edit allowing past start while still in window; 1-year horizon                                                        | unit on shared guards + one API-level assertion | Snapshot of the whole create form; testing `cn()`                                           |
| #5   | After completed_at is set, join/leave/decide/kick/edit/extend fail; delete and transfer still allowed; archive is a separate stamp                                                                                              | Complete equals archive; comments freeze at complete                                     | completed_at vs archived_at; which mutations are frozen; clan-owner-only complete                                                                           | integration on the mutation boundary            | Awarding clan points in a Complete test                                                     |
| #6   | Unauthenticated GET `/dashboard` and `/runs/new` redirects to sign-in; `/runs` stays public                                                                                                                                     | Every `/runs/*` path is protected                                                        | Middleware allow/deny list vs public run list/detail                                                                                                        | thin e2e                                        | Playwright for every admin screen                                                           |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name             | Goal (one line)                                                                                         | Risks covered | Test types                                                        | Status        | Change folder         |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------- | ------------- | --------------------- |
| 1   | Critical-path coverage | Install Vitest, prove Risk #1 (archived / expired-extend is not audience-active), wire `npm test` in CI | #1            | unit + CI gate                                                    | change opened | test-lifecycle-guards |
| 2   | Join and create guards | Prove auto-join band vs pending, and that create/edit API repeats capacity and schedule guards          | #3, #4        | unit + hermetic integration                                       | not started   | —                     |
| 3   | Restricted-run ACL     | Prove guest/stranger gets not-found for friends/invite/clan runs, not a body or 403                     | #2            | HTTP integration (e2e only if research says the page is the seam) | not started   | —                     |
| 4   | Session smoke          | Prove complete-freeze (#5) and unauthenticated dashboard/new-run redirect (#6). Short suite only        | #5, #6        | integration + thin e2e                                            | not started   | —                     |

Phase 1 is the Builder certificate bar (named risk ↔ real test). Phases 2–4 are post-5/5 unless we choose to continue. Do not open a Playwright admin suite in any phase.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer              | Tool       | Version                                       | Notes                                                                                                           |
| ------------------ | ---------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| unit + integration | Vitest     | `npm test` (`vitest run`, `vitest.config.ts`) | Astro 7 SSR; `getViteConfig()` from `astro/config`. Script is `vitest run` so CI does not hang in watch mode    |
| API mocking        | none yet   | —                                             | Prefer hermetic fixtures over mocking internals. Add a network-edge mock only if Phase 2/3 research requires it |
| e2e                | Playwright | none yet — see Phase 4                        | Optional after ACL. `webServer` on `astro dev`. No layout snapshots                                             |
| accessibility      | none       | —                                             | Not in this rollout                                                                                             |
| AI-native          | not in v1  | n/a                                           | Cursor browser MCP exists; do not put a vision model on lifecycle or ACL assertions                             |

**Stack grounding tools (current session):**

- Docs: Context7 (`/withastro/docs`, `/vitest-dev/vitest`) — confirmed Astro `getViteConfig()` + Vitest `test` script; checked: 2026-09-14
- Search: not available in current session; checked: 2026-09-14
- Runtime/browser: Cursor IDE browser MCP — possible later verification of e2e flows; not used for Phase 1; checked: 2026-09-14
- Provider/platform: Supabase MCP ready (not used for this plan); Cloudflare docs MCP ready; Cloudflare account MCP needsAuth; checked: 2026-09-14

Test-base profile: **Vitest unit** (`vitest.config.ts`, co-located `*.test.ts`, `npm test` in CI after lint and before build). Playwright is not in this rollout until a `playwright.config.ts` exists.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                               | Where                                   | Required?                 | Catches                                                                               |
| ---------------------------------- | --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| lint                               | local (Husky + lint-staged) + CI        | required now              | syntactic / lint drift                                                                |
| unit                               | local + CI                              | required after §3 Phase 1 | Risk #1 regressions; later phases add more unit/integration files to the same command |
| HTTP integration / thin e2e on ACL | local + CI when the suite is short      | required after §3 Phase 3 | restricted-run leak (body or 403)                                                     |
| thin e2e session smoke             | CI on PR when suite is short and stable | required after §3 Phase 4 | completed-run mutations; unauthenticated dashboard                                    |

No visual-diff gate (interview Q5). No per-edit agent hooks in this rollout (existing pre-commit lint is enough for v1).

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

Co-locate `*.test.ts` next to the module (example: `src/lib/run-lifecycle.test.ts`). Command: `npm test` (`vitest run` via `vitest.config.ts`, not watch).

Freeze `now` (a number or `Date`) and inject it into `isRunActive` / `countActiveFromRows` / `toActiveLifecyclePhaseOrNull`. Encode expected booleans, counts, and phases from AGENTS.md / PRD Guardrails / research truth tables — never by calling the helper under test to compute the answer.

Do not assert `audienceActiveOrFilter` (the PostgREST `.or(...)` string over-fetches elapsed-extend rows whose `starts_at` is still in the 1-hour window). Do not boot Postgres or Playwright for a lifecycle boolean.

5-cap tests must include elapsed-extend with a **recent** `starts_at` (fixture B). A row that is only an old `starts_at` plus elapsed extend can pass even if someone swaps the filter for that leaky `.or(...)`.

### 6.2 Adding an integration test

TBD — see §3 Phase 2 for join-band and create/edit API guard patterns.

### 6.3 Adding an e2e test

TBD — see §3 Phase 4. Not for admin screens or layout snapshots.

### 6.4 Adding a test for a new API mutation

TBD — see §3 Phase 2. Prefer the shared guard or service boundary over a full Worker boot unless research says the route is the seam.

### 6.5 Adding a test for a visibility/ACL failure

TBD — see §3 Phase 3 for the not-found-vs-body pattern.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, /10x-implement appends a 2–3 line note here.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Layout / card snapshots** — high churn, weak signal for run lifecycle or ACL. Re-evaluate if a visual regression actually shipped to users. (Source: Phase 2 interview Q5.)
- **`cn()` and other class/format helpers** — they do not own product risk. Re-evaluate never, unless a helper starts encoding business rules. (Source: Phase 2 interview Q5.)
- **Full Playwright on every admin screen** — few trusted admins, large radius of flake. A single ACL or session smoke is enough. Re-evaluate if admin becomes a public surface. (Source: Phase 2 interview Q5.)
- **Generated `src/types/database.ts`** — the generator is the test. Re-evaluate if hand-edited types start shipping. (Source: Phase 1 discovery / Q5 adjacent.)
- **Changelog / Welcome chrome** — low blast radius. Re-evaluate if those pages start gating access. (Source: Phase 1 discovery.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-14
- Stack versions last verified: 2026-09-14
- AI-native tool references last verified: 2026-09-14

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
