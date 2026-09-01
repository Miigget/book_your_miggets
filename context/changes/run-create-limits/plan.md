# Capacity 64 and schedule bounds (S-25) Implementation Plan

## Overview

Organizers can set run capacity with default **64** and maximum **64**, and cannot create a start time in the past or more than **1 year** ahead (FR-006, FR-007, US-01). Guards stay on the existing create/edit fields — not under Advanced — so the 1-minute create path stays a single flat form.

## Current State Analysis

Create and edit share `CreateRunForm` (`src/components/runs/CreateRunForm.tsx`) posted to `POST /api/runs` (create) or `POST /api/runs/{id}` (edit → `prepareOwnedActiveRunPatch` in `src/lib/services/runs.ts`). There is no Advanced section.

Capacity is `max_participants`: create default **`"2"`**, client and API require a whole number **> 0**, edit also refuses a drop below the confirmed roster. DB CHECK is only `max_participants > 0` (`supabase/migrations/20260729134008_run_domain_schema.sql`). No default 64, no max 64.

Start is `starts_at`: create default now+1h; create client and API reject `<= Date.now()`. Edit uses `isRunActive` (`src/lib/run-lifecycle.ts`), which **ignores** `startsAt`, so an in-progress run with an elapsed start can still be saved. No 1-year upper bound. Native `datetime-local` has no `min`/`max`. Posted value is ISO via `parseLocalDatetime` / hidden `starts_at`.

Invite-only create is the same POST handler; it validates then calls `createInviteOnlyRun`. Dual client+API validation already exists for title, capacity > 0, and create-not-past. No zod, no test runner. S-24’s 5-active cap is already on the new-run page, create API, and a DB trigger — leave it alone.

## Desired End State

On **create**, capacity initializes to 64 and must be an integer **1–64**. Start must be **after now** and **not after now + 1 calendar year**. On **edit**, capacity 1–64 applies when the organizer **changes** the value; an existing value **> 64** may stay until they change it; the confirmed-roster floor is unchanged. Edit start still must keep the run audience-active (`isRunActive`); it must also be **≤ 1 year ahead**. Past start on edit remains allowed so in-progress Save does not regress. Invite-only create uses the same API checks as public/friends/clan create. No Advanced UI. No migration.

Verify by: creating with default 64; rejecting 65 and past and >1 year on create; rejecting >1 year on edit; saving an in-progress run whose start has elapsed; leaving a grandfathered >64 capacity until it is changed; creating invite-only with the same bounds.

### Key Discoveries:

- Create and edit already share one island — one validation path covers both surfaces (`CreateRunForm.tsx` `edit` prop).
- `isRunActive` does not use `startsAt` (`run-lifecycle.ts`). Applying create’s future-only rule to edit would block Save on in-progress runs. The 1-year check is a **separate** comparison, not a change to `isRunActive`.
- Invite-only is not a second writer of unbounded capacity: `POST /api/runs` validates `max_participants` / `starts_at` before `createInviteOnlyRun`.
- `FormField` has no `min`/`max` props (`src/components/auth/FormField.tsx`). Do not expand that shared auth control for this slice; Capacity uses existing `validate()` + a hint. The raw `datetime-local` input may take `min`/`max` as UX only (`noValidate` on the form).
- `CreateRunForm` already imports from `@/lib/services/runs`. New bound helpers must stay **island-safe** (no Supabase) in a small `src/lib/` module so the form does not grow a service dependency for arithmetic.
- Repo APIs map domain failures to fixed `?error=` strings (`lessons.md`). New copy must be intentional, not `Error.message`.

## What We're NOT Doing

- Advanced settings UI (S-26 team-size lives there later; this slice does not introduce the dump).
- Re-doing the S-24 5-active cap (page gate, API pre-check, SQL trigger).
- Postgres CHECK, trigger, or backfill for capacity ≤ 64 or schedule bounds (no migration).
- Clamping existing `max_participants` > 64 in SQL.
- Changing auto-join full / Accept overfill (soft Accept stays).
- Vitest, Jest, or a one-off assert script.
- Multi-map, poll, owner-delete, join-mode changes.
- Putting these controls only on the client (API must enforce).
- Applying create’s “must be in the future” to edit.

## Implementation Approach

Extract island-safe constants and predicates (capacity 1–64 with grandfather; create future + 1-year; edit 1-year + existing `isRunActive`). Call them from `CreateRunForm.validate`, `POST /api/runs`, and `prepareOwnedActiveRunPatch`. Default create capacity to 64. Document the invariants in `AGENTS.md`. Automated verification is lint + build only.

## Critical Implementation Details

**Create vs edit clocks.** Keep `startsAt.getTime() <= now` as create-only. Edit keeps `isRunActive(newStartsAt, null, existing.extendedUntil)` then adds `startsAt > oneYearAhead(now)` as a second reject. Do not fold the 1-year test into `isRunActive`.

**Grandfather.** Mirror the roster-floor compare: if `maxParticipants === existing.max_participants`, skip the ≤64 check even when the stored value is > 64. If they change the number, the new value must be 1–64 **and** still ≥ confirmed count.

**One-year instant.** Inclusive upper bound using the same `now` as the past check:

```ts
const max = new Date(now);
max.setFullYear(max.getFullYear() + 1);
// reject when startsAt.getTime() > max.getTime()
```

**Invite-only.** Validate in `POST /api/runs` before both `.insert()` and `createInviteOnlyRun`. Do not add a migration to the RPC.

---

## Phase 1: Shared helpers and create/edit wiring

### Overview

Add island-safe capacity/schedule helpers and use them on the shared form, create API, and edit prepare path so every write that today’s organizers can make is bounded.

### Changes Required:

#### 1. Island-safe limits module

**File**: `src/lib/run-limits.ts` (new)

**Intent**: Single source for default/max 64, 1-year horizon, and user-facing messages so the form island and API routes cannot drift.

**Contract**: Export `MAX_RUN_CAPACITY` (64) and `DEFAULT_RUN_CAPACITY` (64). Export predicates (or equivalent functions) the form can call without throwing, plus the same messages the API puts in `?error=`. Capacity: integer 1…`MAX_RUN_CAPACITY`, with an optional `existingCapacity` so unchanged >64 is allowed. Schedule: `isStartsAtInFuture(date, now)` (create); `isStartsAtWithinOneYear(date, now)` using `setFullYear(+1)` inclusive. Optional `now` argument so callers pass `Date.now()`. No Supabase, no React.

#### 2. Create/edit form

**File**: `src/components/runs/CreateRunForm.tsx`

**Intent**: Create initializes capacity to 64; both modes show and enforce the new bounds on the existing Capacity and Starts-at fields (not a new section).

**Contract**: Create default `maxParticipants` state and placeholder use `DEFAULT_RUN_CAPACITY`. `validate()` uses the shared helpers: create → future + ≤1 year; edit → existing `isRunActive` + ≤1 year; capacity 1–64 with grandfather + existing confirmed-roster floor. Optional `min`/`max` on the `datetime-local` input as hints only. Hint on Capacity that the range is 1–64. Do not add an Advanced disclosure.

#### 3. Create API

**File**: `src/pages/api/runs/index.ts`

**Intent**: Server rejects over-capacity and over-horizon creates the same way for public, friends, clan, and invite-only.

**Contract**: After parsing `starts_at` / `max_participants`, apply the shared create rules (future + ≤1 year; capacity 1–64). Fail with the module’s messages via existing `fail()`. Leave the 5-active pre-check and `createInviteOnlyRun` call order as they are — bounds run **before** insert/RPC. Do not change the invite RPC SQL.

#### 4. Edit prepare path

**File**: `src/lib/services/runs.ts` (`prepareOwnedActiveRunPatch`)

**Intent**: Edit Save cannot set start more than 1 year ahead or change capacity outside 1–64, without breaking in-progress Save or grandfathered rows.

**Contract**: After the existing parse/`isRunActive` checks, reject `startsAt` beyond one year with the shared message (`throw new RunError(...)`). Capacity: existing >0 and roster-floor checks remain; add max-64 unless the value is unchanged from `existing.max_participants`. Both `updateRun` and `setRunVisibilityAndInvites` already go through this function — do not duplicate checks in `src/pages/api/runs/[id]/index.ts`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Create: Capacity field defaults to 64; submitting 64 succeeds; 65 (and 0) is rejected on the form and, if posted, via `?error=`
- Create: start in the past is rejected; start ~now+1h succeeds; start more than 1 year ahead is rejected
- Edit: in-progress run with elapsed `starts_at` still saves when start is left as-is (or otherwise still audience-active)
- Edit: start more than 1 year ahead is rejected
- Edit: a run whose stored capacity is > 64 can be saved without changing capacity; changing capacity to 65 is rejected; changing to a value 1–64 (≥ confirmed) succeeds
- Invite-only create is rejected for capacity 65 and for start > 1 year using the same API messages as public create
- `/runs/new` still shows the 5-active banner when at cap; a 6th create is still blocked (S-24 unchanged)
- No Advanced section appears on create or edit

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan. Under YOLO, the click-through is skipped and logged as residual risk; keep this list so a later human can run it.

---

## Phase 2: Agent contract

### Overview

Record the new create/edit invariants in `AGENTS.md` so later slices (especially S-26 Advanced) do not move these guards or re-open unlimited capacity.

### Changes Required:

#### 1. Hard rules

**File**: `AGENTS.md`

**Intent**: Future agents treat 64 / 1-year / form-level-only as shipped law, distinct from the 5-cap and from Advanced.

**Contract**: In Hard Rules, add that organizer create/edit capacity is 1–64 (create default 64); create `starts_at` must be in the future and ≤ 1 year ahead; edit `starts_at` must keep the run audience-active and ≤ 1 year ahead; these guards are form + API only (no Advanced dump, no migration). Do not rewrite the 5-active paragraph; do not document a DB CHECK that this slice does not add. Leave `prd.md` v1 FR-006/FR-007 numbering alone (`prd-v2.md` remains the S-25 source).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `AGENTS.md` states default/max 64, create vs edit schedule, and form+API only, without implying a Postgres CHECK or Advanced UI

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding. Under YOLO, skip the eyeball check and log residual risk.

---

## Testing Strategy

### Unit Tests:

- None. No test runner in `package.json`; do not add Vitest or a one-off assert script.

### Integration Tests:

- None. CI remains `astro sync` + `npm run lint` + `npm run build`.

### Manual Testing Steps:

1. Signed-in organizer opens `/runs/new`. Capacity shows 64. Create with default start (~+1h) and 64.
2. Retry with capacity 65 — form error; confirm API `?error=` if JS is bypassed.
3. Retry with start in the past — rejected. Retry with start just over 1 year — rejected.
4. Create invite-only with a friend; same 65 / >1 year rejects.
5. Open edit on an in-progress run whose start has elapsed; change title only; Save succeeds.
6. On edit, set start > 1 year — rejected.
7. If a row with capacity > 64 exists, Save without touching capacity succeeds; then set 65 — rejected; set 32 (if ≥ confirmed) — succeeds.
8. At 5 audience-active runs, `/runs/new` still blocks create (S-24).

## Performance Considerations

None. Same POST + island as today; extra date/integer checks are negligible.

## Migration Notes

No migration. Existing `max_participants` > 64 stay until the organizer changes capacity. Existing `starts_at` more than 1 year ahead (possible because there was no max) **cannot** be saved on edit until the organizer pulls start into the 1-year window — there is no schedule grandfather.

## References

- PRD: `context/foundation/prd-v2.md` FR-006, FR-007, US-01
- Roadmap: `context/foundation/roadmap.md` S-25 (`run-create-limits`)
- Create form: `src/components/runs/CreateRunForm.tsx`
- Create API: `src/pages/api/runs/index.ts`
- Edit prepare: `src/lib/services/runs.ts` (`prepareOwnedActiveRunPatch`)
- Lifecycle (do not change 5-cap): `src/lib/run-lifecycle.ts`
- Prior patterns: `context/archive/2026-07-29-create-and-list-runs/plan.md`, `context/archive/2026-08-20-edit-run/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared helpers and create/edit wiring

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm run build` passes

#### Manual

- [ ] 1.3 Create: Capacity field defaults to 64; submitting 64 succeeds; 65 (and 0) is rejected on the form and, if posted, via `?error=`
- [ ] 1.4 Create: start in the past is rejected; start ~now+1h succeeds; start more than 1 year ahead is rejected
- [ ] 1.5 Edit: in-progress run with elapsed `starts_at` still saves when start is left as-is (or otherwise still audience-active)
- [ ] 1.6 Edit: start more than 1 year ahead is rejected
- [ ] 1.7 Edit: a run whose stored capacity is > 64 can be saved without changing capacity; changing capacity to 65 is rejected; changing to a value 1–64 (≥ confirmed) succeeds
- [ ] 1.8 Invite-only create is rejected for capacity 65 and for start > 1 year using the same API messages as public create
- [ ] 1.9 `/runs/new` still shows the 5-active banner when at cap; a 6th create is still blocked (S-24 unchanged)
- [ ] 1.10 No Advanced section appears on create or edit

### Phase 2: Agent contract

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` passes

#### Manual

- [ ] 2.3 `AGENTS.md` states default/max 64, create vs edit schedule, and form+API only, without implying a Postgres CHECK or Advanced UI
