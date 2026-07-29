# Run-domain schema and RLS baseline — Plan Brief

> Full plan: `context/changes/run-domain-schema/plan.md`

## What & Why

Establish the first Postgres migration for Book Your Miggets: profiles (role, verified, ban), runs, and join participants with RLS for guest / member / admin. Without this contract, S-01 cannot create or list runs safely under the publishable Supabase key.

## Starting Point

Auth and cookie SSR work against `auth.users` only. There is no `supabase/migrations/` directory, no seed file (despite `config.toml`), no generated DB types, and no product tables.

## Desired End State

Local and remote Supabase both have the minimal schema + RLS; signup creates a member profile; TypeScript `Database` types are wired into `createClient`; a documented SQL one-liner promotes the first admin. No product UI yet — foundation only.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Migration scope | Minimal product contract | Unlocks S-01 without F-01 over-modeling risk |
| Applications model | One `run_participants` + status | Single state machine for S-02/S-05 |
| Role storage | `profiles` table SoT | Queryable; avoids user_metadata authz |
| First admin | Manual SQL promote | No seeded credentials in git |
| Guest access | Real `anon` SELECT policies | Matches PRD browse; fits publishable key |
| Profile create | `auth.users` trigger | Every Auth user gets a profile |
| Types | Generate + wire `Database` | Ready for S-01 `.from()` calls |
| Workflow proof | Local reset + remote `db push` | Meets F-01 “local and deploy” outcome |

## Scope

**In scope:**
- Enums + `profiles` / `runs` / `run_participants`
- Signup trigger, grants, RLS matrix
- `seed.sql` stub, local reset, gen types, typed client
- Remote `db push` + admin promote runbook

**Out of scope:**
- Map catalog / KoG seed data
- Create/list/apply APIs or UI
- Archive cron / in-progress UX
- Auto-join race / capacity enforcement
- Admin moderation UI; Discord roles
- `service_role` on the Worker

## Architecture / Approach

```text
auth.users ──trigger──► profiles (role, is_verified, is_banned)
                              ▲
runs.organizer_id ────────────┘
run_participants ──► runs + profiles
         status: pending | confirmed | denied

PostgREST (anon key) ──► RLS (TO anon | authenticated + is_admin())
Astro SSR createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Author schema migration | SQL: tables, trigger, RLS, seed stub | Over-broad policies or privileged self-update |
| 2. Local verify + typed client | `db reset`, RLS smoke, `database.ts`, typed client | Docker/local Auth backfill edge cases |
| 3. Remote push + admin runbook | Linked `db push` + promote SQL docs | One-way schema apply; wrong project linked |

**Prerequisites:** Docker for local Supabase; linked remote project + CLI login for Phase 3  
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- Pre-trigger Auth users need a one-off profile backfill locally/remotely
- Archive visibility for FR-015/016 is intentionally incomplete until S-04/S-07/S-09
- `archived_at` stub assumes S-04 may still prefer derived status — column is nullable only
- Remote push requires human credentials; agent must not invent service_role Worker secrets

## Success Criteria (Summary)

- Migration applies cleanly locally and on the linked remote project
- Anon can read active runs / confirmed roster and cannot write; members cannot self-promote
- New signup gets a member profile; TypeScript client is typed against the schema
