# Player labels Implementation Plan

## Overview

Ship S-17 / FR-029 / FR-030 / US-11: an admin maintains a small dictionary of player labels (name + palette color) on `/admin/labels`, assigns them on the existing `/admin/users/{id}` page, and everyone sees those chips on the public `/players/{id}` profile. Labels are not player-authored tags.

## Current State Analysis

S-16 left `/admin/users/{id}` as the identity editor (Astro POST forms → `/api/admin/users/{id}/*`, `AdminError`, `?notice=` / `?error=` banners). Ban/verify stay on `/admin`. Middleware already 404s non-admins on any `/admin*` path; `/api/admin/*` is **not** that 404 — each route still checks `locals.profile?.role === "admin"`.

S-10 public `/players/{id}` is a read-only card (nickname, verification text, KoG points, points source, friends). `getPublicProfile` reads `public_profiles`. There is no label schema, no chip component, and no shadcn Badge. Verification is plain `<dd>` text.

The closest catalog analog is `maps`: guest SELECT, no client writes. Labels need the maps-style public read **plus** admin INSERT/UPDATE/DELETE via `is_admin()`. The closest assignment analog is `run_comment_likes`: composite PK + `ON DELETE CASCADE`.

`PROTECTED_ROUTES` must stay unchanged for `/players/{id}`. No test runner — verification is migrate, `db:types`, lint, build, and UI smoke.

## Desired End State

An admin opens `/admin/labels`, creates labels from a fixed swatch palette (empty dictionary on first visit), can rename or recolor any label (every assigned chip updates), and can delete a label (assignments cascade; notice reports how many players were affected). On `/admin/users/{id}`, a checkbox list of the dictionary plus one Save replaces that player's set. Guests and members opening `/players/{id}` see those chips (name + color). No chips on the `/admin` users table or run rosters.

### Key Discoveries:

- Assignment belongs on `src/pages/admin/users/[id].astro` next to S-16 forms; dictionary CRUD has no analog — new `/admin/labels` under the existing `/admin` prefix
- `/api/admin/*` must repeat the admin role check (`src/pages/api/admin/users/[id]/nickname.ts`)
- Guest-visible identity uses `public_profiles`; labels should be their own tables with anon SELECT, not extra columns on `profiles`
- Isolated load pattern already exists: pending nick and friends fail inline without taking down the page
- Dynamic color cannot be a Tailwind class from the DB — chips use inline `background-color` plus static `cn()` layout classes
- Lessons: only fixed copy in `?error=`; log PostgREST server-side

## What We're NOT Doing

- Player-authored tags, member self-serve labels, or a labels inbox on `/profile`
- Chips on run rosters, nickname links, or the `/admin` users table
- Soft-delete / archive of labels; assignment snapshots of name+color
- Free hex, Tailwind token names in the DB, or a seeded taxonomy (maps-style seed)
- React islands on admin pages; shadcn Badge
- A second topbar item for Labels (link from `/admin` is enough)
- Vitest/Jest, JSON/PATCH APIs, new `PROTECTED_ROUTES` entries
- Email/in-app notify when a label is assigned or deleted

## Implementation Approach

One migration: dictionary table + assignment junction, public SELECT, admin writes, unique `lower(name)`, hex check, `ON DELETE CASCADE`. App-owned palette constant validates color membership (DB only checks `#RRGGBB`). Empty dictionary — no seed.

Services in `src/lib/services/player-labels.ts` (public list + admin mutations throwing `AdminError`). Palette in `src/lib/player-label-palette.ts`. Admin APIs copy the S-16 POST + redirect pattern. `/admin/labels` is plain Astro forms. Assignment is checkboxes named `label_id` posting a replace-set. Public chips are a small Astro component on `/players/{id}` only.

## Critical Implementation Details

**Replace-set must not wipe on a bad POST.** `replacePlayerLabels` loads the dictionary ids first; if any submitted id is missing, throw `AdminError` and do **not** delete. Then DELETE that player's assignments, then INSERT the selected ids. Empty checkbox POST (no `label_id` fields) is a valid unassign-all. Last-write-wins if two admins save the same player.

**Cascade delete is the prune path.** Count assignments, DELETE the dictionary row (assignments go with it), return the count for the notice. Do not unassign in the app first.

**Chip color is inline style.** Palette hex is stored as `#RRGGBB` (normalize uppercase). Render `style={`background-color: ${color}`}` with white text and static layout classes via `cn()`. Never interpolate DB hex into a Tailwind class string.

## Phase 1: Schema, services, and APIs

### Overview

Land tables, RLS, generated types, the palette constant, service mutations, and POST routes. No admin or public UI yet — SQL/service smoke proves the contract.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_player_labels.sql` (timestamp at apply time; suffix stable)

**Intent**: Guest-readable dictionary + assignments with admin-only writes, so public profiles can show chips without exposing a member write path.

**Contract**: Two tables:

- `player_labels`: `id uuid PK default gen_random_uuid()`, `name text not null` (trimmed nonempty check), `color text not null` (check `^#[0-9A-Fa-f]{6}$`), `created_at` / `updated_at`. Unique index on `lower(name)`.
- `player_label_assignments`: PK `(profile_id, label_id)`, both FKs `ON DELETE CASCADE` to `profiles` and `player_labels`, `created_at`.

RLS enabled. For both tables: `REVOKE ALL ON TABLE … FROM public` (and from `anon` before re-granting SELECT), matching `friend_requests` / `run_invites` hygiene. Then `GRANT SELECT` both tables to `anon, authenticated`. `GRANT INSERT, UPDATE, DELETE` on `player_labels` and `GRANT INSERT, DELETE` on `player_label_assignments` to `authenticated`. Policies: `*_select_anon` / `*_select_authenticated` `using (true)`; insert/update/delete (labels) and insert/delete (assignments) `to authenticated` `using (is_admin())` / `with check (is_admin())`. No member write policies. No seed. No change to `public_profiles`.

#### 2. Generated types

**File**: `src/types/database.ts` via `npm run db:types`

**Intent**: Callers type against the new tables.

**Contract**: Run `npm run db:types` against local Supabase. Do not hand-edit. Tables `player_labels` and `player_label_assignments` appear.

#### 3. Palette

**File**: `src/lib/player-label-palette.ts` (new)

**Intent**: One list of swatches so admin radios and service validation cannot drift.

**Contract**: Export `PLAYER_LABEL_PALETTE` as ~10 entries `{ hex, name }` and `isPaletteHex(value: string): boolean` (trim, case-insensitive match, canonical `#RRGGBB` uppercase). Exact hexes (names are admin-only labels):

```
#6D28D9 Violet
#1D4ED8 Blue
#0E7490 Cyan
#047857 Emerald
#B45309 Amber
#B91C1C Red
#BE185D Pink
#C2410C Orange
#4338CA Indigo
#475569 Slate
```

Do not store the English name in the DB.

#### 4. Player-label service

**File**: `src/lib/services/player-labels.ts` (new)

**Intent**: One choke point so APIs and pages never speak PostgREST. Public reads return data; admin writes throw `AdminError` with fixed copy.

**Contract**:

- `PlayerLabel`: `id`, `name`, `color` (canonical hex).
- `parseLabelName(raw)`: trim; reject empty / over 24 chars with fixed copy; do not unique-check here.
- `listDictionary(supabase)`: all labels ordered by `name` ascending.
- `listAssignedLabels(supabase, profileId)`: join assignments → labels for that profile, same order; invalid UUID → `[]`.
- `createLabel(supabase, name, color)`: parse name; palette hex or `AdminError`; INSERT; unique `23505` → “That label name is already used.”
- `updateLabel(supabase, id, name, color)`: same validation; UPDATE name+color+`updated_at`; missing row → `AdminError`; unique clash → same taken copy.
- `deleteLabel(supabase, id)`: count assignments, DELETE label, return `{ name, assignedCount }`; missing → `AdminError`.
- `replacePlayerLabels(supabase, profileId, labelIds: string[])`: invalid profile UUID → `AdminError`; unique the ids; if any id is not in the dictionary → `AdminError` “Unknown label” and **no writes**; then delete all assignments for that profile; insert remaining ids (no-op insert when empty). Unknown player (FK) → `AdminError`.
- Log raw errors; never put PostgREST text in thrown messages. Reuse `isUuid` from `runs.ts` and `AdminError` from `admin.ts`.

#### 5. Admin APIs

**Files**: `src/pages/api/admin/labels.ts` (create); `src/pages/api/admin/labels/[id].ts` (update); `src/pages/api/admin/labels/[id]/delete.ts` (delete); `src/pages/api/admin/users/[id]/labels.ts` (replace-set)

**Intent**: Same authz and `?error=` mapping as S-16, with redirects back to the right admin page.

**Contract**: Uppercase `POST`. Cookie client. No supabase → configured copy. `!locals.user` → `/auth/signin`. Non-admin → `/`. Catch `AdminError` → message; other errors `console.error` + fixed copy. Never interpolate `err.message`.

- Create: form `name`, `color` → redirect `/admin/labels?notice=` / `?error=`
- Update: same fields, invalid UUID → “Invalid label”
- Delete: no extra fields; notice includes assignment count (including zero)
- Replace: `form.getAll("label_id")` as strings; invalid user UUID → “Invalid user”; success redirect `/admin/users/{id}?notice=Labels saved`

No `window.confirm`. Do not change ban/verify/S-16 redirect targets.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with both tables, unique `lower(name)`, hex check, CASCADE FKs, per-operation per-role RLS, and grants as contracted
- `npx supabase db reset` (or project-equivalent apply) succeeds locally
- `npm run db:types` regenerates `src/types/database.ts` including `player_labels` and `player_label_assignments`
- `src/lib/player-label-palette.ts` and `src/lib/services/player-labels.ts` exist with the helpers above
- The four admin API routes exist and check `locals.profile?.role === "admin"`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- SQL: `anon`/`authenticated` SELECT both tables; a member session INSERT/UPDATE/DELETE is denied; an admin session can INSERT/UPDATE/DELETE labels and INSERT/DELETE assignments
- SQL: deleting a label removes its assignment rows; inserting two names that differ only by case fails the unique index
- Service: `replacePlayerLabels` with an unknown id does not delete existing assignments; empty id list unassigns all; palette-invalid color and blank name error with fixed copy

**Implementation Note**: After this phase and automated verification, pause for the SQL/service smoke above before Phase 2. Phase blocks use plain bullets; checkboxes live in `## Progress`.

---

## Phase 2: Admin dictionary page and assignment form

### Overview

Put FR-029 on `/admin/labels` and FR-030 assignment on the S-16 player page. Public chips wait until Phase 3.

### Changes Required:

#### 1. Dictionary page

**File**: `src/pages/admin/labels.astro` (new)

**Intent**: Admin can see the whole dictionary, create, live-edit name/color, and prune.

**Contract**: Middleware already gates `/admin/*`. Load `listDictionary` in try; config/load failure → inline friendly error (not `err.message`). `Banner` for `?notice=` / `?error=`. Back link `← Users` to `/admin`. Empty state: short copy that labels show on public profiles, plus the create form. Create form: name text + radio swatches from `PLAYER_LABEL_PALETTE` (color input shows the swatch and English name). Each existing label: swatch, name, edit form (name + swatches preselected), delete form showing “Used by N” (count from a cheap assignment aggregate or a per-row count in the loader — no N+1 of other player fields). Plain HTML POST, no `client:*`. Do not list which nicknames have the label.

#### 2. Assignment on the player page

**File**: `src/pages/admin/users/[id].astro`

**Intent**: Assign without a second profile URL, without touching S-16 editors.

**Contract**: After identity editors and before the archive list, a “Labels” section. Load dictionary + assigned ids in their **own try** (do not fold into `getProfileForAdmin`). On failure: `console.error`, keep nick/points/request editors, inline fixed copy, omit the form. Empty dictionary: copy + link to `/admin/labels`, no Save. Otherwise: checkbox per label (`name="label_id"` `value={id}`, checked if assigned) with swatch + name, one Save posting to `/api/admin/users/{id}/labels`. Unchanged S-16 forms, archive list, 404/500 behavior.

#### 3. Discovery from `/admin`

**File**: `src/pages/admin/index.astro`

**Intent**: Admins can find the dictionary without a topbar item.

**Contract**: Add a text link to `/admin/labels` (header or subtitle). Subtitle may mention labels. Do **not** render chips in the users table. Topbar Admin link stays `/admin`.

### Success Criteria:

#### Automated Verification:

- `src/pages/admin/labels.astro` exists and posts to the create/update/delete APIs
- `/admin/users/[id].astro` posts `label_id` checkboxes to `/api/admin/users/{id}/labels`
- `/admin` index links to `/admin/labels`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Admin creates a label from a swatch, renames and recolors it, deletes it; delete notice reports assignment count
- Empty dictionary: labels page still shows create; player page links to `/admin/labels` and has no Save
- Player page: check two labels, Save, reload shows them checked; uncheck all, Save, none checked
- Guest `/admin/labels` → sign-in; member → 404; S-16 editors still work when the labels load fails
- http://localhost:4321/admin/labels and a known http://localhost:4321/admin/users/{uuid} (after `npm run dev` + local Supabase)

**Implementation Note**: After this phase and automated verification, pause for the UI smoke above.

---

## Phase 3: Public profile chips and docs

### Overview

Show assigned labels on `/players/{id}` (FR-018 / FR-030) and document the new admin surface. `/players/{id}` stays public.

### Changes Required:

#### 1. Chip component

**File**: `src/components/PlayerLabelChip.astro` (new)

**Intent**: One chip markup for the public profile (admin pages may reuse it for swatch+name if handy).

**Contract**: Props `name: string`, `color: string`. Span with `cn()` for padding/rounded/text-xs/font-medium/text-white, inline background from `color`. Render `name`. No links, no dismiss control.

#### 2. Public profile

**File**: `src/pages/players/[id].astro`

**Intent**: Everyone who can see the profile sees the same chips — including guests and the player themselves via this URL.

**Contract**: After a successful `getPublicProfile`, load `listAssignedLabels` in its **own try**. On failure: `console.error`, keep identity + friends, omit chips (optional one-line friendly error). Zero labels: omit the labels row/section (do not show “No labels”). Non-zero: chips in name order as a **new `<dl>` row inside the existing Public profile card** (same layout as nickname/verification/points). Do not add `/players` to `PROTECTED_ROUTES`. Do not show labels on `/profile`.

#### 3. Docs

**Files**: `README.md` (Admin access step 4); `AGENTS.md` (Hard Rules `/admin` sentence)

**Intent**: Later agents must not invent player-authored tags or roster chips.

**Contract**: README: `/admin/labels` is the dictionary; assignment is on `/admin/users/{id}`; chips appear on public `/players/{id}`. AGENTS.md: keep `/players/{id}` public; mention S-17 dictionary at `/admin/labels` via `POST /api/admin/labels*`; assignment `POST /api/admin/users/{id}/labels`. Do not rewrite unrelated sections.

### Success Criteria:

#### Automated Verification:

- `/players/[id].astro` calls `listAssignedLabels` and renders `PlayerLabelChip` when labels exist
- `PROTECTED_ROUTES` still does not include `/players`
- AGENTS.md and README mention `/admin/labels` and public chips
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest and member both see chips on `/players/{id}` with palette colors; a player with no labels looks as today minus a labels block
- Rename/recolor on `/admin/labels` updates chips on reload without re-assigning
- Delete a used label: chip gone on public profile; other labels remain
- Forced labels-load failure: nickname/points/friends still render
- `/profile` has no label editor; `/admin` users table and run rosters still have no chips
- http://localhost:4321/players/{uuid} as guest

**Implementation Note**: After this phase and automated verification, pause for the public-profile smoke above.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`

### Integration Tests:

- `npx supabase db reset`, `npm run db:types`, `npm run lint`, `npm run build` per phase
- SQL smoke for RLS + cascade + unique name (Phase 1 manuals)

### Manual Testing Steps:

1. Start local Supabase + `npm run dev`; open [http://localhost:4321/admin/labels](http://localhost:4321/admin/labels)
2. Create two labels with different swatches; rename one; recolor the other
3. Open [http://localhost:4321/admin/users/{uuid}](http://localhost:4321/admin/users/{uuid}), assign both, Save; open that player's [http://localhost:4321/players/{uuid}](http://localhost:4321/players/{uuid}) as a guest
4. Uncheck all, Save; public profile has no labels section
5. Assign again, delete one label from `/admin/labels`; confirm notice count and the remaining chip
6. Guest `/admin/labels` → sign-in; member → 404; `/profile` unchanged

## Performance Considerations

Dictionary is small (tens of rows, not thousands). Public profile adds one assignments query filtered by `profile_id` (PK prefix). Admin labels page may count assignments per label in one grouped query — do not N+1 player nicknames. No new caching.

## Migration Notes

- Additive tables only; empty dictionary; no backfill
- Rollback locally: `db reset` to the previous migration; production revert would drop the two tables (CASCADE removes assignments)
- Deploy is the usual `v*` tag CD (`db push` then Worker); no new secrets; do not add a maps-style seed path

## References

- PRD US-11, FR-018, FR-029, FR-030: `context/foundation/prd.md`
- Roadmap S-17: `context/foundation/roadmap.md`
- S-16 admin player page: `context/archive/2026-08-24-admin-profile-edits/`
- S-10 public profile: `context/archive/2026-08-20-user-profile/`
- Lessons (`?error=` copy): `context/foundation/lessons.md`
- Ban/verify / S-16 API pattern: `src/pages/api/admin/users/[id]/nickname.ts`
- Admin service: `src/lib/services/admin.ts`
- Maps public SELECT: `supabase/migrations/20260729163802_maps_catalog_and_run_title.sql`
- Junction PK analog: `supabase/migrations/20260820092809_run_comments.sql` (`run_comment_likes`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, services, and APIs

#### Automated

- [x] 1.1 Migration file exists under supabase/migrations/ with both tables, unique lower(name), hex check, CASCADE FKs, per-operation per-role RLS, and grants as contracted — bd51290
- [x] 1.2 npx supabase db reset (or project-equivalent apply) succeeds locally — bd51290
- [x] 1.3 npm run db:types regenerates src/types/database.ts including player_labels and player_label_assignments — bd51290
- [x] 1.4 src/lib/player-label-palette.ts and src/lib/services/player-labels.ts exist with the helpers above — bd51290
- [x] 1.5 The four admin API routes exist and check locals.profile?.role === "admin" — bd51290
- [x] 1.6 npm run lint passes — bd51290
- [x] 1.7 npm run build passes — bd51290

#### Manual

- [x] 1.8 SQL: anon/authenticated SELECT both tables; a member session INSERT/UPDATE/DELETE is denied; an admin session can INSERT/UPDATE/DELETE labels and INSERT/DELETE assignments — YOLO skipped manual — bd51290
- [x] 1.9 SQL: deleting a label removes its assignment rows; inserting two names that differ only by case fails the unique index — YOLO skipped manual — bd51290
- [x] 1.10 Service: replacePlayerLabels with an unknown id does not delete existing assignments; empty id list unassigns all; palette-invalid color and blank name error with fixed copy — YOLO skipped manual — bd51290

### Phase 2: Admin dictionary page and assignment form

#### Automated

- [x] 2.1 src/pages/admin/labels.astro exists and posts to the create/update/delete APIs — ca20899
- [x] 2.2 /admin/users/[id].astro posts label_id checkboxes to /api/admin/users/{id}/labels — ca20899
- [x] 2.3 /admin index links to /admin/labels — ca20899
- [x] 2.4 npm run lint passes — ca20899
- [x] 2.5 npm run build passes — ca20899

#### Manual

- [x] 2.6 Admin creates a label from a swatch, renames and recolors it, deletes it; delete notice reports assignment count — YOLO skipped manual — ca20899
- [x] 2.7 Empty dictionary: labels page still shows create; player page links to /admin/labels and has no Save — YOLO skipped manual — ca20899
- [x] 2.8 Player page: check two labels, Save, reload shows them checked; uncheck all, Save, none checked — YOLO skipped manual — ca20899
- [x] 2.9 Guest /admin/labels → sign-in; member → 404; S-16 editors still work when the labels load fails — YOLO skipped manual — ca20899
- [x] 2.10 http://localhost:4321/admin/labels and a known http://localhost:4321/admin/users/{uuid} — YOLO skipped manual — ca20899

### Phase 3: Public profile chips and docs

#### Automated

- [ ] 3.1 /players/[id].astro calls listAssignedLabels and renders PlayerLabelChip when labels exist
- [ ] 3.2 PROTECTED_ROUTES still does not include /players
- [ ] 3.3 AGENTS.md and README mention /admin/labels and public chips
- [ ] 3.4 npm run lint passes
- [ ] 3.5 npm run build passes

#### Manual

- [ ] 3.6 Guest and member both see chips on /players/{id} with palette colors; a player with no labels looks as today minus a labels block
- [ ] 3.7 Rename/recolor on /admin/labels updates chips on reload without re-assigning
- [ ] 3.8 Delete a used label: chip gone on public profile; other labels remain
- [ ] 3.9 Forced labels-load failure: nickname/points/friends still render
- [ ] 3.10 /profile has no label editor; /admin users table and run rosters still have no chips
- [ ] 3.11 http://localhost:4321/players/{uuid} as guest
