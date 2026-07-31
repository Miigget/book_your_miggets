# Apply and Approve Participants — Plan Brief

> Full plan: `context/changes/apply-and-approve-participants/plan.md`

## What & Why

Complete the north-star loop: a player registers, applies to an approval-required run, and the organizer accepts or denies; confirmed players show on the public roster and count toward filled slots. This is S-02 (FR-004/008/009 + exercising existing auth).

## Starting Point

Schema/RLS for `run_participants` and create/list/detail already exist; the detail page still has an empty Participants shell. No app code writes participations yet; DELETE and organizer auto-seat are missing from the DB contract.

## Desired End State

Organizer is seated on the team at create (and can leave the team while staying organizer). Members with a nickname apply on `/runs/[id]`; organizer manages pending there; guests see confirmed nicknames and filled/capacity. Auto-join apply stays “coming soon” until S-05.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Withdraw | Applicant deletes own `pending` | Lets players bail before a decision | Plan |
| Capacity on Accept | Soft warn, allow overfill | Organizer flexibility; hard races deferred to S-05 | Plan |
| `min_points` | Display only | No live stats yet; validation later with profile work | Plan |
| Nickname | Required before Apply | Readable public roster; matches create-run | Plan |
| Organizer on roster | Auto-`confirmed` at create; can leave team | Organizer plays by default but can host-only | Plan |
| After Deny | Same row; organizer may later Accept | Honors UNIQUE; no second Apply | Plan |
| Pending inbox | On run detail only | Avoids my-runs (S-08) scope creep | Plan |
| Auto-join in S-02 | Coming-soon; no apply | Clear S-02 vs S-05 split | Plan |
| Organizer seat mechanism | DB trigger + backfill | INSERT RLS only allows self-`pending` | Plan |

## Scope

**In scope:**
- Migration: DELETE policies, organizer seat trigger, backfill
- Participants service + apply/withdraw/decide/leave-team APIs
- Detail (and list counts) UI; auth return URL to the run

**Out of scope:**
- Auto-join confirm (S-05), `min_points` enforcement, list filters (S-03), archive (S-04), my-runs (S-08), non-organizer leave when confirmed

## Architecture / Approach

```text
runs INSERT → trigger → organizer confirmed seat
member → POST apply (pending) → organizer decide (confirmed|denied)
public SELECT confirmed (+ nicknames)
DELETE: own pending withdraw | organizer leave own confirmed
Astro SSR roster + React islands for mutations (form POST + ?error=)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema leave + seat | DELETE RLS, trigger, backfill | Wrong DELETE rules reopening denied→Apply |
| 2. Service + API | apply/withdraw/decide/leave | Edge cases around UNIQUE + status transitions |
| 3. Detail/list UI | Roster, CTAs, soft warn, return URL | Auth return open-redirect; apply under 30s UX |

**Prerequisites:** S-01 done locally; Docker/Supabase for migrations  
**Estimated effort:** ~2–3 sessions across 3 phases

## Open Risks & Assumptions

- Soft overfill means filled counts can exceed `max_participants` by design until a later hard rule
- After organizer leaves the team, re-joining via Apply → self-Accept is allowed and slightly awkward but acceptable for MVP
- Sign-in/sign-up need a minimal safe `returnTo` for the guest→apply path

## Success Criteria (Summary)

- Guest can authenticate, return to a run, set nickname if needed, and apply in under ~30 seconds
- Organizer accepts/denies on the run page; confirmed nicknames are public; deny can later become accept without a second Apply
- Organizer starts on the roster and can leave the team while remaining visible as organizer
