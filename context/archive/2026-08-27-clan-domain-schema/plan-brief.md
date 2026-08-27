# Clan-domain schema and RLS contract — Plan Brief

> Full plan: `context/changes/clan-domain-schema/plan.md`

## What & Why

Foundation F-02: the smallest clan tables plus guest/member/admin RLS so a verified member can insert a clan, guests can read directory/details, and friends-only / invite-only runs cannot leak through clan rows. Without this contract, north-star S-18 cannot create a public clan surface on the publishable Supabase key.

## Starting Point

Auth, profiles, runs, friends, and restricted-run RLS are live. There are no clan tables. Later slices add tables with per-operation `TO anon`/`TO authenticated` policies, verified gates via `public_profiles`, and owner seating via a DEFINER AFTER INSERT trigger on runs.

## Desired End State

Local Supabase has `clans` + `clan_members`: verified insert seats the owner as the only member; guests SELECT name, tag, member user ids, and `points = 0`; clients cannot write membership or points; admin can delete a clan (cascade). No UI. Types regenerated. Production schema waits for a `v*` release.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Cardinality | At most one clan per player (`clan_members.user_id` PK) | S-19 “the clan” and S-23 points need a single home |
| Owner encoding | `clans.owner_id` + seating trigger; no role enum | Copies the run seating trigger **without** `ON CONFLICT` — membership PK aborts a second clan; officers stay S-21 |
| Columns now | `name`, `tag`, `points` default 0; no picture | Guest directory must be human-identifiable; upload is S-18 |
| Tag uniqueness | Unique `lower(btrim(tag))`; name not unique | Tags clash like in-game; names may collide |
| Insert path | Direct `INSERT` on `clans` under RLS | Matches public-run create; no RPC until a caller exists |
| Membership SELECT | World-readable `USING (true)` | FR-017 guests see members; UUID roster does not join runs |
| Writes | Insert-only; freeze points; admin DELETE | S-18/S-19/S-23 own rename, invites, and points |
| Helpers | No new DEFINER helpers | Trigger-only; helpers wait until UPDATE policies would recurse |

## Scope

**In scope:**
- `clans` + `clan_members`, constraints, owner-seat trigger
- Guest SELECT, verified INSERT, admin DELETE, frozen points
- Local `db reset`, `db:types`, lint, build, RLS smoke

**Out of scope:**
- Create UI / picture / invites / officers / clan runs / points rules
- Any join to `runs` / `run_participants` / `run_invites`
- `create_clan()` RPC; remote `db push` (CD on `v*`)

## Architecture / Approach

```text
verified member ──INSERT RLS──► clans (owner_id, name, tag, points=0)
                                      │ AFTER INSERT DEFINER trigger
                                      ▼
                               clan_members (user_id PK → one clan)

anon/authenticated SELECT both tables (USING true)
no client INSERT on clan_members; no UPDATE on either table
admin DELETE clans ──CASCADE──► clan_members (child DELETE policy required)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Author schema migration | SQL: tables, trigger, grants, RLS | Over-broad policies or a run-table join |
| 2. Local verify + typed client | `db reset`, RLS smoke, `database.ts` | CASCADE blocked by missing child DELETE policy |

**Prerequisites:** Docker for local Supabase  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- Admin PostgREST could delete the owner’s `clan_members` row without deleting the clan; no app path; leave/transfer stay later slices
- S-18 still `ALTER`s in picture/storage; uniqueness on tag is enforced before any UI validation
- Remote schema apply is `/gh-release`, not this change

## Success Criteria (Summary)

- Verified member inserts one clan and appears as its only member; a second clan or a nonzero `points` insert fails
- Guests can SELECT clans and member user ids; they cannot write; restricted runs are untouched
- Types, lint, and build pass after local reset
