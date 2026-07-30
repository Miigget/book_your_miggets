# Create and list runs — Implementation Plan

## Overview

Ship S-01: organizers create runs (optional KoG map + optional custom title, capacity, min points, join mode, future start time) and guests browse active runs on a public list and detail page. Land a seeded `maps` catalog from [KoGmaps `mapinfo.txt`](https://github.com/Gamer12120/KoGmaps/blob/main/mapinfo.txt), add `profiles.nickname`, and replace free-text `runs.map` with a nullable `map_id` FK.

## Current State Analysis

- F-01 is implemented: `profiles`, `runs`, `run_participants` with RLS; anon can SELECT non-archived runs; members can INSERT own runs (`supabase/migrations/20260729134008_run_domain_schema.sql`).
- `runs.map` is required `text`; there is no maps catalog; `supabase/seed.sql` is a stub.
- Auth works (email/password, cookie SSR, form-POST + redirect + `?error=`). Only `/dashboard` is in `PROTECTED_ROUTES`. No run pages or product API routes.
- `profiles` has role/ban/verified only — no public player name for title fallbacks.
- No test runner yet (`AGENTS.md`); verification is lint, build, local Supabase reset, and manual UI.

## Desired End State

- Local (and remote) DB has a `maps` table populated from a vendored KoGmaps mapinfo snapshot; unparseable release dates stored as null.
- `runs` use nullable `map_id` → `maps`, optional `title`, and no free-text `map` column; display title resolves as: custom title → `{map.name} run by {nickname}` → `{nickname} run`.
- Members with a `nickname` can create a run via `/runs/new` (search + filters for maps; map optional) in under ~1 minute perceived time.
- Guests can open `/runs` and `/runs/[id]` without logging in and see run fields, map metadata when present, and an empty participants shell (no apply).
- `npm run lint` and `npm run build` pass; types regenerated from local schema.

### Key Discoveries:

- Create/list UI should follow auth island pattern: React form → `POST` API → redirect (`src/pages/api/auth/signin.ts`).
- Prefer Astro for list/detail SSR; React islands for map picker + create form (`AGENTS.md`).
- KoGmaps provides `mapinfo_to_csv.py` / `mapinfo_to_json.py` — adapt/vendor; do not fetch GitHub at seed time (offline reset).
- Community points scale to 25k+; `min_points` stays `integer >= 0` with no low upper bound; do not prefill from map `pts` (organizer-set).
- Open Roadmap Q1 resolved for S-01: import KoGmaps mapinfo (manual vendor + loader; automate pulls later).

## What We're NOT Doing

- Apply / accept / deny / real roster population (S-02)
- Full active-list search/filter for guests (S-03) — create-form map filters only in this slice
- Archive / in-progress grace UX (S-04)
- Auto-join confirmation on apply (S-05) — storing `join_mode` at create is in scope
- My-runs dashboard (S-08); admin moderation UI (S-06)
- Live fetch of KoGmaps on every reset/deploy (document future automation only)
- Discord OAuth, in-game stats sync, Vitest (unless repo adds a runner later)
- `service_role` on the Worker

## Implementation Approach

Additive migration for `maps`, `nickname`, and `runs` reshape → vendor mapinfo + import script into seed path → regenerate `Database` types → SSR public list/detail → auth-gated create form + API. Title resolution lives in a small shared helper used by list, detail, and create redirect. RLS: maps are world-readable; writes only via seed/service path (no anon/authenticated INSERT on maps).

## Critical Implementation Details

- **Runs without a map:** `map_id` must be nullable. Create validation requires at least one of: non-empty `title`, or a valid `map_id`, or a non-empty organizer `nickname` (always required for create) so the `{nickname} run` fallback always works.
- **Prose dates:** when parsing DATE from mapinfo, accept ISO `YYYY-MM-DD` only; values like `Released during a sunset` → `released_on = null` (unknown).
- **Nickname gate:** if `profiles.nickname` is null/blank, `/runs/new` collects it before/with the first create (or blocks submit until set); do not invent names from email.

## Phase 1: Maps catalog + schema migration

### Overview

Introduce the catalog and reshape runs/profiles so later UI can select maps, omit maps, and render titles with nicknames.

### Changes Required:

#### 1. Migration — maps + nickname + runs reshape

**File**: `supabase/migrations/<timestamp>_maps_catalog_and_run_title.sql` (via `npx supabase migration new …`)

**Intent**: Persist KoG map metadata and support optional-map / titled runs with player nicknames.

**Contract**:
- Table `maps`: at least `id uuid PK`, `name text NOT NULL UNIQUE`, `difficulty text NOT NULL`, `stars text NOT NULL` (preserve source glyphs), `points int NOT NULL CHECK (points >= 0)`, `length text NULL` (store null when source is `-`), `creator text NOT NULL`, `released_on date NULL`, timestamps. Index on `name`; optional index on `difficulty`.
- `profiles.nickname text NULL` (unique when not null — prefer unique index on `lower(nickname)` where not null). Allow members to UPDATE own `nickname`; anon no write; SELECT of nickname needed for public title display (narrow public SELECT of `id, nickname` or join-safe policy — do not dump ban/role to anon).
- `runs`: drop `map text`; add `map_id uuid NULL REFERENCES maps(id)`; add `title text NULL`; keep `starts_at`, `max_participants`, `min_points` (no upper cap), `join_mode`, `archived_at`.
- RLS: `maps` SELECT for `anon` + `authenticated`; no INSERT/UPDATE/DELETE for those roles (seed/SQL only).
- Preserve existing runs RLS semantics (active = `archived_at IS NULL`).

#### 2. Vendor mapinfo + import/seed loader

**Files**: `supabase/seed-data/kog-mapinfo.txt` (vendored snapshot); `scripts/import-kog-maps.*` (Node or Python adapted from KoGmaps `mapinfo_to_json.py`); wire into `supabase/seed.sql` or a generated SQL fragment included by seed; short note in `change.md` Notes for future automated pulls from GitHub.

**Intent**: Make `db reset` load ~1k maps offline and keep the source refreshable.

**Contract**:
- Parse pipe table; skip header/separator; normalize length `-` → null; date parse fail → null.
- Idempotent upsert on `maps.name` preferred for re-runs.
- Do not commit credentials; do not download at seed runtime in CI.
- Document one-liner to re-vendor from https://raw.githubusercontent.com/Gamer12120/KoGmaps/main/mapinfo.txt for later automation.

#### 3. Regenerate types

**Files**: `src/types/database.ts`; optionally keep `npm run db:types`

**Intent**: TypeScript matches the new schema for `.from('maps'|'runs'|'profiles')`.

**Contract**: Generate from local DB after reset; commit the file.

### Success Criteria:

#### Automated Verification:

- Migration file exists with AGENTS naming; `npx supabase db reset` exits 0
- `maps` row count ≈ mapinfo data rows; sample prose-date map has `released_on IS NULL`
- `src/types/database.ts` includes `maps`, `runs.map_id`, `runs.title`, `profiles.nickname`
- `npm run lint` and `npm run build` pass

#### Manual Verification:

- Spot-check Studio: map fields populated; `runs` no longer has `map` text column
- Anon can SELECT maps; cannot INSERT maps

**Implementation Note**: Pause after Phase 1 for human confirmation of seed quality before UI work if catalog quirks need fixing.

---

## Phase 2: Public list + run detail (read)

### Overview

Expose guest-readable active runs and a detail page that shows map metadata and a non-functional participants shell.

### Changes Required:

#### 1. Title helper + run queries

**Files**: `src/lib/services/runs.ts` (or similar); optionally thin DTO in `src/types.ts`

**Intent**: Single place for display-title rules and active-run fetches used by pages.

**Contract**:
- `resolveRunTitle({ title, mapName, nickname })` implements the three-way fallback.
- List query: active runs (`archived_at IS NULL`) ordered by `starts_at` ascending, join map + organizer nickname as needed via Supabase select embeds.
- Detail query: one run by id (404 if missing or archived for guests — archived visibility stays organizer/admin until later slices; guests only see active).

#### 2. Public pages

**Files**: `src/pages/runs/index.astro`; `src/pages/runs/[id].astro`; nav/CTA updates (`Topbar` / home) linking to `/runs` and (when signed in) `/runs/new`

**Intent**: FR-006 browse without login; prepare S-02 shell on detail.

**Contract**:
- List shows at least: resolved title, start time, capacity, min points, join mode, map name when set (plus useful map bits if space — e.g. difficulty/points).
- Detail shows full run fields + all map catalog fields when `map_id` present + “Participants (0)” empty shell; CTA copy that apply is not available yet / sign-in for later — **no apply POST**.
- Empty list state when no active runs.
- Prefer Astro SSR with `createClient`; no auth required for these routes.

#### 3. shadcn primitives as needed for read UI

**File**: `src/components/ui/*` via `npx shadcn@latest add …` only if list/detail need them

**Intent**: Stay consistent with new-york style without inventing one-off cards unless interaction requires them.

**Contract**: Prefer existing layout/typography patterns; add components only when necessary for Phase 2.

### Success Criteria:

#### Automated Verification:

- Routes exist: `/runs`, `/runs/[id]` (dynamic)
- `npm run lint` and `npm run build` pass

#### Manual Verification:

- Guest browser (logged out) can open `/runs` and a detail URL for an active run (insert a smoke run via SQL/Studio if create UI not ready yet)
- Detail shows map metadata when linked; empty participants section visible; no apply mutation

**Implementation Note**: If no runs exist yet, verify empty states, then re-check after Phase 3.

---

## Phase 3: Create run flow

### Overview

Auth-gated create experience with map search/filters, nickname onboarding, server validation, and redirect to the new detail page.

### Changes Required:

#### 1. Protect create route + nickname API/update

**Files**: `src/middleware.ts` (`PROTECTED_ROUTES` includes `/runs/new`); profile nickname update via form POST API (e.g. `src/pages/api/profile/nickname.ts`) or combined into create flow

**Intent**: Only signed-in non-banned members create; nickname exists before title fallbacks run.

**Contract**:
- Unauthenticated `/runs/new` → sign-in redirect (existing middleware pattern).
- Member can set/update own `nickname` (unique); banned users fail run INSERT via existing RLS.

#### 2. Create page + map picker island

**Files**: `src/pages/runs/new.astro`; React island under `src/components/runs/` (create form + searchable/filterable map picker)

**Intent**: Meet FR-003 and the &lt;1 min guardrail for organizers who know or browse maps; allow map-less titled runs.

**Contract**:
- Fields: optional title, optional map (search + filters e.g. difficulty; clear selection), `starts_at` (datetime), `max_participants`, `min_points` (default 0, allow large values), `join_mode`.
- Map optional; if neither map nor title, server still accepts and stores nulls — display uses `{nickname} run`.
- Prefill nothing from map `points` into `min_points`.
- Follow auth form pattern: client validate → POST form → redirect `?error=` on failure.
- Add shadcn pieces as needed (Input, Select, Command/Combobox, etc.).

#### 3. Create API

**File**: `src/pages/api/runs/index.ts` (or `create.ts`) exporting `POST`

**Intent**: Persist run under RLS with server-side validation.

**Contract**:
- Require authenticated user with non-empty `nickname` (else redirect error asking to set nickname).
- Validate: `starts_at` strictly in the future; `max_participants > 0`; `min_points >= 0`; `join_mode` in enum; `map_id` null or existing map id.
- Insert `organizer_id = auth.uid()`, `archived_at` null.
- Success redirect to `/runs/{id}`; failures redirect back to `/runs/new?error=…`.

### Success Criteria:

#### Automated Verification:

- `PROTECTED_ROUTES` covers `/runs/new`
- `npm run lint` and `npm run build` pass

#### Manual Verification:

- Signed-in user sets nickname, creates run with map → appears on `/runs` and detail shows map fields
- Create with custom title only (no map) → list/detail show custom title
- Create with neither title nor map → shows `{nickname} run`
- Guest sees the new run without logging in
- Reject past `starts_at`; allow `min_points` like 20000
- Create completes comfortably under ~1 minute when searching a known map name

**Implementation Note**: After Phase 3 automated checks, pause for human confirmation of the create→list→detail path before marking the change implemented.

---

## Testing Strategy

### Unit Tests:

- None required unless a runner is added; if helper is pure, optional tiny tests are nice-to-have only — do not add Vitest solely for this change.

### Integration Tests:

- `db reset` + seed maps count/smoke SQL
- Lint + build for SSR/types

### Manual Testing Steps:

1. Reset DB → confirm maps seeded; prose dates null.
2. Sign up / sign in → set nickname → create run with map search.
3. Incognito: list + detail visible; participants shell empty.
4. Create map-less titled run and nickname-only fallback run.
5. Attempt past start time → error; high min_points accepted.
6. Push migration to linked remote when ready (same workflow as F-01); re-run map seed/import on remote as documented.

## Performance Considerations

- Load map catalog for the picker once (SSR prop or single fetch); filter/search client-side is acceptable at ~1k rows.
- List query should select only needed columns; avoid N+1 (use embed joins).
- Index `maps(name)` / `maps(difficulty)` already noted in Phase 1.

## Migration Notes

- Additive migration after F-01; empty `runs` assumed (or migrate any existing rows carefully if present — drop `map` only when no production data depends on it).
- Remote: `db push` for schema; run import script/seed for maps (seed may be excluded from push — document explicit remote import).
- Future: automate re-pull from KoGmaps raw URL + re-import (out of scope beyond a Notes reminder).

## References

- Roadmap S-01: `context/foundation/roadmap.md`
- PRD FR-003, FR-006, US-01: `context/foundation/prd.md`
- Prior schema: `context/changes/run-domain-schema/plan.md`
- KoGmaps mapinfo: https://github.com/Gamer12120/KoGmaps/blob/main/mapinfo.txt
- KoGmaps converters: `mapinfo_to_csv.py`, `mapinfo_to_json.py`
- Auth pattern: `src/pages/api/auth/signin.ts`, `src/components/auth/*`
- Client: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Maps catalog + schema migration

#### Automated

- [x] 1.1 Migration file exists with AGENTS naming; `npx supabase db reset` exits 0 — 689045c
- [x] 1.2 `maps` row count ≈ mapinfo data rows; sample prose-date map has `released_on IS NULL` — 689045c
- [x] 1.3 `src/types/database.ts` includes `maps`, `runs.map_id`, `runs.title`, `profiles.nickname` — 689045c
- [x] 1.4 `npm run lint` and `npm run build` pass — 689045c

#### Manual

- [x] 1.5 Spot-check Studio: map fields populated; `runs` no longer has `map` text column — 689045c
- [x] 1.6 Anon can SELECT maps; cannot INSERT maps — 689045c

### Phase 2: Public list + run detail (read)

#### Automated

- [x] 2.1 Routes exist: `/runs`, `/runs/[id]` — 5a0a28a
- [x] 2.2 `npm run lint` and `npm run build` pass — 5a0a28a

#### Manual

- [x] 2.3 Guest can open `/runs` and an active run detail URL — 5a0a28a
- [x] 2.4 Detail shows map metadata when linked; empty participants section; no apply mutation — 5a0a28a

### Phase 3: Create run flow

#### Automated

- [ ] 3.1 `PROTECTED_ROUTES` covers `/runs/new`
- [ ] 3.2 `npm run lint` and `npm run build` pass

#### Manual

- [ ] 3.3 Create with map → visible on public list/detail with map fields
- [ ] 3.4 Create title-only and nickname-only fallback titles resolve correctly
- [ ] 3.5 Guest sees new runs without logging in
- [ ] 3.6 Past `starts_at` rejected; high `min_points` (e.g. 20000) accepted
- [ ] 3.7 Known-map create comfortably under ~1 minute
