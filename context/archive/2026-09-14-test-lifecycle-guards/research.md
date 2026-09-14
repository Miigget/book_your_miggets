---
date: 2026-09-14T13:56:35+02:00
researcher: migget
git_commit: faf14bfd719a92cdaacaf9328ee9fb03ba05882d
branch: main
repository: book_your_miggets
topic: "Phase 1 Critical-path coverage — where audience-active is derived and who enforces 5-cap, join reject, and the active list (Risk #1)"
tags: [research, codebase, run-lifecycle, audience-active, 5-cap, join, vitest, test-plan-phase-1]
status: complete
last_updated: 2026-09-14
last_updated_by: migget
last_updated_note: "Added follow-up research for parallel codebase sweeps (deadline equality, 5-cap vs list query, transfer/archive SQL-only, Welcome naming trap)"
---

# Research: Phase 1 Critical-path coverage — audience-active, 5-cap, join, active list

**Date**: 2026-09-14T13:56:35+02:00
**Researcher**: migget
**Git Commit**: [faf14bfd719a92cdaacaf9328ee9fb03ba05882d](https://github.com/Miigget/book_your_miggets/commit/faf14bfd719a92cdaacaf9328ee9fb03ba05882d)
**Branch**: main
**Repository**: book_your_miggets

## Research Question

Ground test-plan Phase 1 / Risk #1 so `/10x-plan` can write unit tests + a CI `npm test` gate without treating current helper return values as the spec.

1. What is the product oracle for audience-active (archive stamp vs extend vs 1-hour window) from PRD / AGENTS.md?
2. Where does the app (and SQL) actually derive that boolean today, and who enforces 5-cap, join reject, and “absent from the active list”?
3. Why “listed on `/runs`” is not the same as audience-active.
4. What is the cheapest unit seam that proves the three consequences without implementation-mirroring `isRunActive`.
5. What test runner / CI gap Phase 1 must close.

## Summary

**Oracle (product, not code):** a run is audience-active iff `archived_at` is null **and** either `extended_until` is still in the future **or** (`extended_until` is null and `starts_at` is still within 1 hour). Stamped archive and an elapsed extend both exit. An unelapsed extend keeps the run active past the default 1-hour window. `completed_at` does **not** exit audience-active and does **not** free the 5-cap.

**Where the failure would live (research, not the test-plan’s guess):** the shared TypeScript predicate is [`src/lib/run-lifecycle.ts`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/run-lifecycle.ts) `isRunActive`. The three Risk #1 consequences are **consumers** of that predicate (plus a parallel SQL helper):

| Consequence | App seam | SQL dual |
|---|---|---|
| Does not consume the 5-cap | [`countAudienceActiveRunsForOrganizer`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/runs.ts#L1415-L1430) → create API | `enforce_organizer_active_run_cap` counts `is_run_active_row` |
| Join is rejected | [`loadActiveRunForMutation`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/participants.ts#L160-L181) → `applyToRun` | `auto_join_run` → `not_active` via `is_run_roster_open_row` |
| Absent from the active list | [`listActiveRuns`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/runs.ts#L382-L423) + `mapRunRow` | RLS `runs_select_active_*` + `is_run_active_row` |

**Must-cover edge (query vs predicate):** `audienceActiveOrFilter` is an **OR** of `extended_until > now` and `starts_at > now - 1h`. A row with **elapsed extend and a still-recent `starts_at`** can be **fetched** for `/runs`; `mapRunRow` then drops it. The 5-cap pre-count does **not** use that OR — it loads `archived_at IS NULL` then filters with `isRunActive` — so elapsed-extend still sits in `data` until the helper runs. Tests that only assert the PostgREST `.or(...)` string, or only a happy-path upcoming public run, miss Risk #1. Strict deadline: `now === extended_until` is **not** audience-active (TS `t < deadline`, SQL `extended_until > now()`).

**Do not use S-24 plan-brief as the oracle.** That brief dropped the 1-hour clock. Live product restored it in `20260913132601_restore_in_progress_grace.sql`. Current AGENTS.md + PRD Guardrails / US-01 are the spec.

**Phase 1 infra:** no Vitest, no `*.test.*`, no `test` script. CI is `astro sync` + lint + build. Install Vitest via Astro `getViteConfig()`, `"test": "vitest run"`, add `npm test` to CI. Do not boot Postgres or Playwright in this phase.

## Detailed Findings

### Oracle from PRD / AGENTS.md (not from helper returns)

[`AGENTS.md`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/AGENTS.md) Hard Rules (single long paragraph):

> Audience-active ⇔ `archived_at` null and (unelapsed `extended_until`, or `extended_until` null and `starts_at` still within 1 hour). Default in-progress window is 1 hour after `starts_at`; organizer/admin Archive stamps earlier; organizer Extend (1/2/3/6h, one-shot) keeps the run until `extended_until`. Max 5 audience-active runs per organizer.

Also: Complete ≠ archive — Complete does not stamp `archived_at`, does not free the 5-cap.

[`context/foundation/prd.md`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/context/foundation/prd.md) Guardrails + US-01:

- Unextended runs leave 1 hour after start; organizer/admin can archive earlier; optional extend ≤ 6 hours then derived exit; archived, not deleted; at most 5 audience-active runs.
- US-01: remains on the active list for 1 hour after start unless archived earlier or the extend elapses.

FR-013 still describes only the 1-hour grace then archive (no extend column). Prefer Guardrails + US-01 + AGENTS over FR-013 alone.

**Frozen truth table for tests** (`now` injected; do not call the helper to compute the expected boolean):

| Fixture | `archived_at` | `extended_until` | `starts_at` | Audience-active? | Why |
|---|---|---|---|---|---|
| A stamped archive | set | anything | anything | **no** | Archive stamp wins |
| B elapsed extend | null | past | even recent | **no** | Extend clock elapsed |
| C unelapsed extend | null | future | even older than 1h | **yes** | Extend keeps the run |
| D default window open | null | null | within 1h (incl. upcoming) | **yes** | Default grace |
| E default window elapsed | null | null | more than 1h ago | **no** | Unextended derived exit |
| F completed, still in window | null | null | within 1h | **yes** | Complete does not exit (out of Risk #1 assertions except “still counts toward 5-cap”) |

Consequences when **no**: does not occupy the 5-cap; join/apply is rejected (“Run not found or no longer active”); not on the **active** list (dashboard Incoming / `/runs` sections that come from `listActiveRuns` / `mapRunRow`).

### App predicate (what the code does today — evidence, not spec)

[`src/lib/run-lifecycle.ts`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/run-lifecycle.ts#L27-L51):

```27:51:src/lib/run-lifecycle.ts
export function isRunActive(
  startsAt: string | Date,
  archivedAt: string | Date | null | undefined,
  extendedUntil: string | Date | null | undefined,
  now?: Date | number,
): boolean {
  if (archivedAt != null) return false;
  const t = resolveNow(now);
  if (extendedUntil != null) {
    const deadline = instantMs(extendedUntil);
    if (Number.isNaN(deadline)) return false;
    return t < deadline;
  }
  const start = startsAtMs(startsAt);
  if (Number.isNaN(start)) return false;
  return t < start + RUN_GRACE_MS;
}

export function audienceActiveOrFilter(now?: Date | number): string {
  const t = resolveNow(now);
  const nowIso = new Date(t).toISOString();
  const windowIso = new Date(t - RUN_GRACE_MS).toISOString();
  return `extended_until.gt."${nowIso}",starts_at.gt."${windowIso}"`;
}
```

Clock source: `Date.now()` (injectable `now`). `RUN_GRACE_MS = 3_600_000`. `getRunLifecyclePhase` maps `!isRunActive` → `"archived"` (including elapsed extend with no stamp).

This currently **matches** the AGENTS formula. Phase 1 tests must still encode the table above as expected values, not `expect(isRunActive(x)).toBe(isRunActive(x))`.

**Query dual-defense is weaker than the predicate.** `audienceActiveOrFilter` does not encode “if extend is set, ignore `starts_at`”. Fixture **B** with a recent `starts_at` matches the `.or(...)` via the starts_at branch.

### SQL predicate (parallel, not Phase 1 unit target)

Latest signature in [`supabase/migrations/20260913132601_restore_in_progress_grace.sql`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/supabase/migrations/20260913132601_restore_in_progress_grace.sql#L12-L27):

`is_run_active_row(archived_at, extended_until, starts_at)` → `archived_at is null AND (extended_until > now() if set ELSE starts_at > now() - 1 hour)`.

`is_run_roster_open_row` = that **and** `completed_at is null` (join/roster freeze, not 5-cap).

Worker `Date` vs Postgres `now()` may disagree by seconds (accepted in S-24). Unit tests should freeze `now` in TS; do not add a DB suite in Phase 1.

Older 2-arg `is_run_active_row(archived_at, extended_until)` was dropped at the end of that migration. App types / generated SQL wrappers should be the 3-arg form.

### Who enforces the 5-cap

**App pre-check (UX):** [`countAudienceActiveRunsForOrganizer`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/runs.ts#L1415-L1430) loads `starts_at, archived_at, extended_until` where `organizer_id` match and `archived_at` **IS NULL**, then `.filter(isRunActive)`. Used by [`src/pages/api/runs/index.ts`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/pages/api/runs/index.ts#L104-L113) and [`src/pages/runs/new.astro`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/pages/runs/new.astro). Cap = [`MAX_ACTIVE_RUNS_PER_ORGANIZER = 5`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/run-lifecycle.ts#L1). Message: `ACTIVE_RUN_CAP_MESSAGE`.

Because the query only drops stamped archive, **elapsed-extend rows are in `data`** until `isRunActive` filters them. If that filter is removed or inverted, the 5-cap stays occupied. That is the cheapest 5-cap unit: fixture rows with `archived_at: null` + elapsed vs unelapsed extend.

**SQL hard cap:** trigger `enforce_organizer_active_run_cap` counts `is_run_active_row(...)` under advisory lock `8724`. Invite-only create and transfer also refuse at 5. Transfer recipient uses the same count ([`restore_in_progress_grace.sql` around L843–L852](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/supabase/migrations/20260913132601_restore_in_progress_grace.sql#L843-L852)). Phase 1 unit will not execute this trigger.

### Who rejects join

[`loadActiveRunForMutation`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/participants.ts#L160-L181): `.is("archived_at", null)` then `!isRunActive` → `ParticipantError("Run not found or no longer active")`. Then `completed_at` → separate completed freeze (Risk #5, not Phase 1).

[`applyToRun`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/participants.ts#L231-L238) always calls that loader first. [`POST /api/runs/{id}/apply`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/pages/api/runs/%5Bid%5D/apply.ts) maps `ParticipantError` to `?error=`.

SQL: `auto_join_run` returns `not_active` when `not is_run_roster_open_row(...)` (audience-active **and** not completed) or `not can_view_run`. Approval-mode pending insert is still gated by the app loader + RLS `run_participants_insert_self_pending` (roster-open).

Same `isRunActive` gate: withdraw/leave/decide/kick (other callers of `loadActiveRunForMutation`), comments write (`requireActiveRun` in [`comments.ts`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/comments.ts#L89-L91)), edit (`updateRun` / `getOwnedActiveRunForEdit`). Phase 1 join assertion: apply path / loader, not the whole mutation set.

### Active list vs “listed on `/runs`”

[`src/pages/runs/index.astro`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/pages/runs/index.astro#L31-L35) calls `listActiveRuns` (guests: `publicOnly: true`) then `partitionActiveRuns` into Invite / Friends / Clan / Public / admin Restricted.

`listActiveRuns`: `.is("archived_at", null).or(audienceActiveOrFilter(now))` then `mapRunRow`, which returns **null** when `!isRunActive`. So `/runs` “Active runs” is intended to be audience-active **and** visible to the viewer — not the definition of audience-active.

**Counterexamples (challenge the false equation):**

1. **Restricted audience-active run** — consumes 5-cap and accepts join for the audience; guests never see it on Public `/runs`. Signed-in friends/invitees/clan members see it in other sections. Admin Restricted is still audience-active, still not “the public list”.
2. **`list_player_public_runs` / `list_clan_runs` have no time predicate.** Showcase RPCs return public / clan_only rows including archived and elapsed-extend. [`listPlayerProfileRuns`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/runs.ts#L708-L720) and [`listClanRuns`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/lib/services/runs.ts#L788-L798) split Incoming vs Recent with `isRunActive`. A guest can see an archived public run on a player **Recent** card — listed, not audience-active.
3. **Privilege SELECT** (organizer / admin / confirmed) is unbounded. Dashboard Past and archived `/runs/{id}` exist because the app splits on `isRunActive`, not because RLS hid the row.
4. **Completed clan-only** stays audience-active → still on Clan `/runs` section and dashboard Incoming, still occupies 5-cap, join frozen for another reason. Do not treat “Completed chip” as archive in Phase 1.

“Absent from the active list” in Risk #1 means: `mapRunRow` / organizer-participant **Incoming** filters treat the run as archived (`lifecyclePhase === "archived"` / not in `listActiveRuns` result), not “the row is invisible everywhere.”

### Call-site map (`isRunActive`)

| Area | File | Role |
|---|---|---|
| Predicate + cap constant + list `.or` | `src/lib/run-lifecycle.ts` | Source of TS boolean |
| `mapRunRow` / `mapArchivedRunRow` | `src/lib/services/runs.ts` ~253–264 | Active DTO vs archived DTO |
| `listActiveRuns` / `getActiveRunById` | `runs.ts` ~382–445 | `/runs` + detail active |
| `getOwnedActiveRunForEdit` / `updateRun` | `runs.ts` ~452, ~1251 | Edit only while audience-active |
| Inventory splits | `listRunsForOrganizer` / `ForParticipant` / `listPlayerProfileRuns` / `listClanRuns` | Incoming vs Past/Recent |
| 5-cap count | `countAudienceActiveRunsForOrganizer` | Create + `/runs/new` |
| Delete organizer | `deleteRunAsOrganizer` ~1478 | Audience-active only |
| Join family | `participants.ts` `loadActiveRunForMutation` | Apply + roster mutations |
| Comments write | `comments.ts` `requireActiveRun` | Writable until archive |
| Inbox run invites | `inbox.ts` ~116 | Skip non-audience-active invites |
| Edit form client | `CreateRunForm.tsx` ~162 | `starts_at` must keep `isRunActive` |

`completed_at` is checked **beside** `isRunActive` on mutation/edit, never folded into it.

### Test infra (Phase 1 must install)

- [`package.json`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/package.json): no `test` script; no vitest; Astro `^7.1.3`; Vite override `^8.1.5`.
- [`/.github/workflows/ci.yml`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/.github/workflows/ci.yml): `astro sync`, `npm run lint`, `npm run build`. No test step.
- Zero `*.test.*` / `*.spec.*` in the repo.
- [`AGENTS.md`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/AGENTS.md) still says do not assume Vitest until a config and script exist — Phase 1 should replace that sentence after install.
- Cookbook in `test-plan.md` §6.1 is still TBD.
- Official Astro path (already checked in the test-plan stack row): `vitest.config.ts` with `getViteConfig()` from `astro/config`; script **`vitest run`** (not watch).

### Lessons already on file

[`context/foundation/lessons.md`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/context/foundation/lessons.md): default branch is `main`; do not put raw PostgREST in `?error=`. Join reject copy is already a domain string (`Run not found or no longer active`) — unit tests should assert that string if they touch `applyToRun`, not a SQL blob.

## Code References

- `src/lib/run-lifecycle.ts:27-51` — `isRunActive` + `audienceActiveOrFilter`
- `src/lib/services/runs.ts:253-264` — `mapRunRow` / `mapArchivedRunRow`
- `src/lib/services/runs.ts:382-423` — `listActiveRuns`
- `src/lib/services/runs.ts:1415-1430` — 5-cap count
- `src/lib/services/participants.ts:160-181` — join loader
- `src/pages/api/runs/index.ts:104-113` — create cap
- `src/pages/api/runs/[id]/apply.ts` — apply HTTP
- `src/pages/runs/index.astro:31-35` — `/runs` uses `listActiveRuns`, not raw SQL
- `src/components/Welcome.astro` — home “Recent Runs” is still audience-active public `listActiveRuns`
- `supabase/migrations/20260913132601_restore_in_progress_grace.sql:12-27` — live SQL oracle twin
- `supabase/migrations/20260913132601_restore_in_progress_grace.sql:362-382` — 5-cap trigger
- `supabase/migrations/20260913132601_restore_in_progress_grace.sql:412-417` — `auto_join_run` `not_active`
- `supabase/migrations/20260914093400_clan_run_showcase.sql:75-115` — `list_clan_runs` has no time filter
- `.github/workflows/ci.yml:19-21` — no `npm test`
- `context/foundation/test-plan.md` — Phase 1 row, Risk #1 response, anti-patterns

## Architecture Insights

- **One TS predicate, many consumers, one SQL twin.** A regression can be “helper wrong” or “a consumer stopped calling the helper and only used `archived_at IS NULL`.” Risk #1 names three user-visible consequences; the second failure mode is as likely as the first. Phase 1 should pin the **truth table** on `isRunActive` **and** at least one consumer that still sees elapsed-extend rows after the `archived_at IS NULL` query (count and/or `mapRunRow`).
- **Do not test `audienceActiveOrFilter`’s string as the oracle.** It is an optimization/dual-defense and is known-incomplete for fixture B. Asserting it would implementation-mirror a leaky query.
- **Do not extract expected booleans from today’s helper.** Write ISO timestamps relative to a frozen `now` from the table in this document.
- **SQL stays out of Phase 1** (cost × signal). Document dual-layer drift as an open risk; later phases / integration can hit the trigger if needed.
- **`mapRunRow` is not exported.** Planning can export a tiny pure helper, test `isRunActive` plus a local replica of the count filter, or use a fake `from("runs")` client. Prefer not to boot Astro/Worker.

## Historical Context (from prior changes)

- `context/archive/2026-08-31-manual-archive-and-extend/` (S-24) — introduced stamp + extend + 5-cap; plan-brief **dropped** the 1-hour auto-archive (`isRunActive` ignored `starts_at`). **Superseded** for the clock by `20260913132601_restore_in_progress_grace.sql`. Keep S-24 for: DEFINER-only `archived_at` / `extended_until`, lock `8724`, elapsed extend is derived (no cron), `list_player_public_runs` has no time predicate on purpose.
- `context/archive/2026-08-07-run-archival-lifecycle/` — original derived 1h window; no extend/cap.
- `context/archive/2026-09-01-complete-clan-run/` — Complete stays audience-active; 5-cap not freed; `is_run_roster_open_row` is the join freeze. Do not fold `completed_at` into Phase 1 audience-active tests except as a non-exit control.
- `context/archive/2026-09-01-run-create-limits/` — S-25 capacity/schedule; explicitly out of scope for changing `isRunActive`; 5-cap already shipped.
- `context/archive/2026-09-01-verified-finish-clan-points/` — `verified_at` is not part of audience-active / 5-cap.
- `context/archive/2026-09-11-transfer-run-ownership/` / `owner-delete-run` — transfer/delete require audience-active; recipient 5-cap. Not Phase 1 assertions unless needed to explain cap SQL.

## Related Research

- `context/archive/2026-08-31-manual-archive-and-extend/research.md` — pre-S-24 lifecycle map (1h-only; historically useful, not live).
- `context/foundation/test-plan.md` — Phase 1 goal, Risk #1 response, Vitest stack row.
- `context/foundation/health-check.md` — earlier Vitest + CI recommendation (same `getViteConfig()` / `vitest run` shape).

## Open Questions

1. **Consumer coverage vs helper-only.** Cheapest proof of 5-cap/join/list without a Worker: (recommended) truth table on `isRunActive` + unit of the count filter (fake supabase or extracted `countActiveFromRows(rows, now)` used by `countAudienceActiveRunsForOrganizer`) + `mapRunRow` null for fixture B (export or test via a thin exported `toActiveRunOrNull`). Skip HTTP apply in Phase 1 unless planning wants one mocked `applyToRun`.
2. **Do not revive S-24 “clock must not end in-progress.”** That would fail fixture E and contradict current AGENTS/PRD.
3. **SQL twin untested in Phase 1.** Accept drift risk; do not add `pgTAP` / live Supabase just for Risk #1.
4. **Cookbook + AGENTS.** After implement, fill `test-plan.md` §6.1 and replace AGENTS “no test runner” with `npm test`.

## Follow-up Research 2026-09-14T13:59+02:00

Parallel codebase sweeps confirmed the summary above and added seams planning should not miss.

### Deadline and clocks

- Equality at `extended_until`: inactive. TS uses `now >= deadline` → false (`t < deadline`); SQL uses `extended_until > now()`. Invalid/NaN timestamps → `false`.
- TS clock is injectable `Date.now()`; SQL is `now()`. Seconds of skew at the boundary are accepted (S-24); freeze `now` in unit tests.

### 5-cap vs list query (correction)

- **Count** (`countAudienceActiveRunsForOrganizer`): `.is("archived_at", null)` only, then `isRunActive`. No `audienceActiveOrFilter`. Aligned with SQL CASE semantics once the filter runs; still depends on that filter for elapsed extend.
- **List** (`listActiveRuns`): `.or(audienceActiveOrFilter)` **over-fetches** fixture B with a recent `starts_at`; `mapRunRow` is the drop.
- SQL hard cap is the BEFORE INSERT trigger + invite-create RPC raise + transfer RPC return. **No CHECK**, no cap view, **no TS pre-count on transfer** (recipient cap is SQL-only). App maps `active_run_cap` / `'active_run_cap'` to the fixed strings.
- Create UX: `302` to `/runs/new?error=` with `ACTIVE_RUN_CAP_MESSAGE` (not JSON).

### Join HTTP and SQL-only mutations

- Apply domain reject: **400** `{ error }` when `Accept: application/json`, else **302** `?error=` — not 409/422. Copy: `"Run not found or no longer active"`. Completed-but-still-active is a **different** string (`CLAN_RUN_COMPLETED_FROZEN`); do not use that as the Risk #1 oracle.
- Transfer / Complete / Extend have **no** TS `isRunActive` call — RPCs only. Archive RPC checks `archived_at is null` only (does not call `is_run_active_row`). Out of Phase 1 unit scope.
- Pending insert RLS still uses `is_run_roster_open_row` (active ∧ `completed_at` null).

### List surfaces and naming traps

- There is **no** `list_active_*` SQL RPC. `/runs` is PostgREST + `listActiveRuns` + `partitionActiveRuns`.
- Home [`Welcome.astro`](https://github.com/Miigget/book_your_miggets/blob/faf14bfd719a92cdaacaf9328ee9fb03ba05882d/src/components/Welcome.astro) “Recent Runs” is `listActiveRuns(..., { publicOnly: true })` — **audience-active public**, not Recent-as-archived. Do not treat that label as the active-list oracle.
- Dashboard Past / player Recent / clan Recent are the intentional “listed but not audience-active” surfaces.
- A confirmed seat can still place a restricted run in a `/runs` section after unfriend; that is visibility ACL, not the lifecycle boolean.
- Completed clan-only can be **on `/runs` and hold a 5-cap seat** while join is frozen. Phase 1 must not treat “on `/runs`” as “joinable.”

### Historical landmines (do not copy into assertions)

- S-24 `plan.md` / `crew-decisions.md`: `startsAt` unused; unbounded in-progress. **Superseded.**
- Later archive `team-size-scope/research.md` still describes S-24 as “no 1-hour grace.” Ignore for the truth table.
- Predecessor `context/archive/2026-08-07-run-archival-lifecycle/` is the original FR-013 1h window, pre-extend.

### Extra call sites (not Phase 1 assertions)

Inbox incoming invites (`inbox.ts`) and client edit `starts_at` (`CreateRunForm.tsx`) also call `isRunActive`. Comments write uses the active predicate and **does not** read `completed_at`.
