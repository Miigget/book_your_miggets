# Capacity 64 and schedule bounds — Plan Brief

> Full plan: `context/changes/run-create-limits/plan.md`

## What & Why

Organizers need a meaningful capacity (default 64, max 64) and must not schedule a run in the past or more than 1 year ahead (prd-v2 FR-006, FR-007, US-01). The 1-minute create path stays a flat form: these guards sit on the existing Capacity and Starts-at fields, not under Advanced.

## Starting Point

Shared `CreateRunForm` already posts create and edit. Capacity defaults to **2** with only **> 0** checks. Create already rejects a past start; edit only requires `isRunActive` (past start allowed for in-progress). No 1-year cap. No Advanced UI. S-24’s 5-active cap is already shipped.

## Desired End State

Create: capacity starts at 64 and must be 1–64; start is after now and ≤ 1 calendar year ahead. Edit: 1-year cap on start; past start still allowed so in-progress Save works; capacity > 64 is grandfathered until changed. Invite-only uses the same API checks. No migration, no Advanced.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Scope | Form-level 64 + schedule only; no Advanced, no 5-cap, no S-26 | Roadmap S-25 risk + Crew cut | Roadmap / Crew |
| Complexity | LOW | Bounded field-tighten on a shipped form | Plan |
| Edit schedule | Create = future + ≤1y; edit = `isRunActive` + ≤1y | Future-on-edit would block in-progress Save | Plan |
| Defense | Client + API helpers; no CHECK / migration | Matches “form-level only” and today’s dual layer | Plan |
| Existing >64 | Grandfather until capacity changes | Same compare as roster floor; no backfill | Plan |
| 1-year clock | `setFullYear(+1)`, inclusive, same `now` as past check | Leap-aware “one year from now” | Plan |
| Verification | lint + build; documented manual list | No test runner; YOLO skips click-through | Plan |

## Scope

**In scope:** Default/max 64; create not-past + ≤1 year; edit ≤1 year; grandfather >64; shared helpers; AGENTS.md; invite-only via the same create API.

**Out of scope:** Advanced UI; S-24 5-cap; DB CHECK/backfill; Vitest; team-size (S-26); Accept overfill; changing `isRunActive`.

## Architecture / Approach

New island-safe `src/lib/run-limits.ts` (constants + predicates + messages). `CreateRunForm.validate`, `POST /api/runs` (before insert **and** `createInviteOnlyRun`), and `prepareOwnedActiveRunPatch` all call it. HTML `datetime-local` min/max are hints only (`noValidate`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Helpers + wiring | Form default 64, create/edit/API bounds | Applying future-only to edit; skipping invite-only POST |
| 2. Agent contract | `AGENTS.md` invariants | Implying a DB CHECK that was not added |

**Prerequisites:** Shipped run create/edit (already on `main`).
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- Direct PostgREST/SQL can still write capacity > 64 or far-future `starts_at` (accepted: no CHECK).
- A far-future existing start has **no** grandfather — edit Save fails until start is pulled in.
- YOLO skips the manual click-through (residual risk); the Progress Manual rows stay for a later human.
- JS `setFullYear` on 29 Feb lands on 1 Mar the next year — accepted calendar behavior.

## Success Criteria (Summary)

- Create cannot use capacity 65, a past start, or a start more than 1 year ahead; default capacity is 64.
- Edit cannot set start > 1 year ahead but can still save an in-progress run with elapsed start; >64 capacity stays until changed.
- Invite-only create and the 5-active cap behave as today except for the new bounds.
