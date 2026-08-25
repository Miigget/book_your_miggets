# Player labels — Plan Brief

> Full plan: `context/changes/player-labels/plan.md`

## What & Why

Admin maintains a dictionary of player labels (name + color) and assigns them so everyone sees those chips on the player's public profile (US-11, FR-029, FR-030). A small admin-owned dictionary avoids one-off free text and player-authored tags.

## Starting Point

S-16 already ships identity editors on `/admin/users/{id}` (Astro POST + `AdminError`). S-10 public `/players/{id}` shows nickname, verification, points, and friends — no labels schema or chips. `maps` is guest-readable but seed-only; likes/participants show the CASCADE junction shape.

## Desired End State

Admin creates labels on `/admin/labels` from a fixed swatch palette, assigns them with checkboxes on the existing player page, and guests see those chips on `/players/{id}`. Rename/recolor updates every chip; deleting a label unassigns it everywhere.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Scope | Admin dictionary; not player tags | Roadmap S-17 / PRD | Crew |
| Assignment surface | Existing `/admin/users/{id}` | Same page as S-16 | Crew |
| Dictionary CRUD | New `/admin/labels` | Keep S-16 assignment-only | Plan |
| Delete in use | Cascade + count in notice | Small dictionary; FK CASCADE | Plan |
| Color | ~10 swatches, store hex | Readable chips; no free-hex a11y | Plan |
| Display | Public `/players/{id}` only | FR-030; no roster/admin-list chips | Plan |
| Seed | Empty dictionary | Community-specific, not a catalog | Plan |
| Edits | Live rename/recolor via FK | Dictionary, not snapshots | Plan |
| Assign UX | Checkboxes + one Save (replace set) | Matches S-16 Astro forms | Plan |
| Phases | Schema/APIs → admin UI → public chips | Contract smoke before click-through | Plan |

## Scope

**In scope:** Tables + RLS; palette const; admin CRUD APIs + `/admin/labels`; replace-set assignment on the player page; public chips; README/AGENTS one-liners.

**Out of scope:** Player-authored tags; roster/admin-list chips; `/profile` editor; soft-delete; seed taxonomy; React admin islands; Vitest.

## Architecture / Approach

```text
player_labels (name, color hex)  ──1:N──  player_label_assignments (profile_id, label_id)
  SELECT: anon + authenticated
  WRITE:  is_admin() only
  DELETE label → CASCADE assignments

POST /api/admin/labels            → create  → /admin/labels
POST /api/admin/labels/{id}       → update  → /admin/labels
POST /api/admin/labels/{id}/delete → cascade + count
POST /api/admin/users/{id}/labels → replace set (validate ids, then delete, then insert)

GET /players/{id} → listAssignedLabels → PlayerLabelChip (inline background-color)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema + services + APIs | Tables, RLS, types, mutations | Member write leak; replace-set wiping on unknown id |
| 2. `/admin/labels` + assignment form | FR-029/030 admin click-through | Cluttering S-16; empty-dict Save wiping |
| 3. Public chips + docs | Guest-visible chips | Adding `/players` to `PROTECTED_ROUTES`; Tailwind class from DB hex |

**Prerequisites:** S-09 / S-10 / S-16 shipped; SQL-promoted admin; local Supabase for `db reset` + `db:types`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- YOLO may skip Progress manuals; residual risk is the guest/member 404 matrix, cascade notice copy, and isolated load failures.
- Replace-set is last-write-wins; insert failure after a successful delete can leave the player with no labels until retry.
- Palette membership is app-enforced; DB only checks hex format — a future palette shrink will not rewrite stored rows.
- Public chips use white text on the contracted 10 hexes; do not add free hex later without a contrast pass.

## Success Criteria (Summary)

- Admin can create/edit/delete the dictionary on `/admin/labels` and assign via checkboxes on `/admin/users/{id}`
- Guests see assigned chips on `/players/{id}`; live rename/recolor and cascade delete are visible there
- Members cannot write labels; `/players/{id}` stays public; no chips on rosters or `/profile`
