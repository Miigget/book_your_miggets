<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Apply and Approve Participants Implementation Plan

- **Plan**: context/changes/apply-and-approve-participants/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-07-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — No organizer UI path to Accept a denied applicant

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/runs/RunParticipantActions.tsx:178-226; src/pages/runs/[id].astro:46
- **Detail**: Desired end state and Manual criteria 2.5 / 3.8 require organizer to later Accept a denied row. Service/API support `denied → confirmed` (`decideParticipant`), but the detail UI only loads/renders **pending** applicants. Denied applicants disappear from the organizer queue with no Accept control — Progress 3.8 is marked done without an observable UI path.
- **Fix A ⭐ Recommended**: Add a small “Denied” organizer list (or reopen control) that POSTs `status=confirmed` to the existing decide route
  - Strength: Closes the documented product path without new API surface; matches copy already shown to denied users.
  - Tradeoff: Extra UI state/query for denied rows on detail.
  - Confidence: HIGH — decide endpoint already allows the transition.
  - Blind spot: Whether denied rows should stay forever or be filtered/paginated later.
- **Fix B**: Narrow plan/Progress wording to “API/Studio can Accept denied; UI deferred”
  - Strength: Cheap; acknowledges Phase 3 Changes Required only specified a pending queue.
  - Tradeoff: Leaves a documented north-star path unfinished in the product UI.
  - Confidence: MEDIUM — depends whether S-02 acceptance requires the UI path.
  - Blind spot: Roadmap/PRD reviewers may still expect the UI.
- **Decision**: FIXED via Fix A

### F2 — Nickname redirect allowlist weaker than `safeRunReturnTo`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/profile/nickname.ts:8-9; src/components/runs/RunParticipantActions.tsx:111
- **Detail**: Phase 3 hardened auth with `safeRunReturnTo` (`/runs/{uuid}` only). The apply nickname gate posts `redirect=/runs/{uuid}` into `/api/profile/nickname`, which only checks `startsWith("/") && !startsWith("//")` — any same-origin path (and some open-redirect edge cases) can be injected by tampering the hidden field.
- **Fix**: Validate `redirect` with `safeRunReturnTo` (fallback `/` or `/runs`) so apply + auth share one allowlist.
- **Decision**: FIXED

### F3 — Confirmed counts load full rows; detail double-fetches roster

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/runs.ts:124-146,169-185; src/pages/runs/[id].astro:34-38
- **Detail**: `confirmedCountsForRuns` selects every confirmed `run_id` and counts in JS (no aggregate/`head` count). Detail also calls `getActiveRunById` (count query) and `listConfirmedParticipants` (full roster) — duplicate confirmed fetch. Fine for MVP volumes, but diverges from the plan’s “prefer one efficient query / avoid N+1” note. `countConfirmedParticipants` exists unused.
- **Fix**: On detail, set `confirmedCount` from `confirmed.length` and skip the extra count; for list, use head counts or a single grouped query / embed.
- **Decision**: FIXED

### F4 — Unexpected errors echo raw DB/PostgREST messages into `?error=`

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/runs/[id]/apply.ts:34 (and withdraw / leave-team / decide)
- **Detail**: Non-`ParticipantError` paths redirect with `err.message`, rendered via `ServerError`. Matches create-run habit, but multiplies the surface. Risk is information leakage / ugly UX, not authz bypass.
- **Fix**: Map unexpected failures to a generic user string; log the real error server-side.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Do not echo raw infrastructure errors into user-facing redirects

### F5 — `decideParticipant` UPDATE is not status-CAS

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/participants.ts:302-308
- **Detail**: Status is checked in app code, then UPDATE matches only `id`/`run_id`. Concurrent Accept/Deny is last-write-wins. Soft overfill is planned; this is a small reliability gap, not a capacity hard-block miss.
- **Fix**: Add `.in("status", ["pending", "denied"])` (or expected-from status) on UPDATE; treat 0 rows as conflict.
- **Decision**: FIXED

### F6 — Guests never see auto-join “coming soon” copy

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/runs/RunParticipantActions.tsx:69-100
- **Detail**: Guest early-return always shows “Sign in to apply…”. Auto-join coming-soon copy only appears for signed-in users. Plan wanted clear auto-join state; guests may expect apply after auth.
- **Fix**: For `auto_join` guests, show coming-soon (optionally still offer sign-in for browsing account features).
- **Decision**: SKIPPED — guest must auth to join anyway; coming-soon after sign-in is enough
