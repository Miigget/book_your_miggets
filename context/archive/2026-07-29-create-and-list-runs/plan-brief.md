# Create and list runs — Plan Brief

> Full plan: `context/changes/create-and-list-runs/plan.md`

## What & Why

Ship the first user-visible product slice: members create runs and guests browse them on a public list/detail. This proves FR-003/FR-006 and unlocks the S-02 apply loop.

## Starting Point

F-01 schema/RLS and auth are live, but `runs.map` is free text, there is no map catalog, no nickname, and no run UI — only a stub dashboard.

## Desired End State

Organizers with a `nickname` create runs from `/runs/new` (optional KoG map via search/filters, optional custom title). Guests open `/runs` and `/runs/[id]` without login, see requirements + map metadata, and an empty participants shell. Catalog is seeded from vendored KoGmaps mapinfo.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Catalog source | Import KoGmaps `mapinfo.txt` | Real community map data; scripts exist upstream |
| Seed strategy | Vendor file + loader (offline) | Reliable `db reset`; note future auto-pull |
| Map on run | Nullable `map_id` FK; drop `map` text | Integrity when set; allow map-less runs |
| Unparseable dates | `released_on` null | Prose dates are not dates |
| Run title | Optional `title` + fallbacks | Custom named sessions and auto labels |
| Player name | `profiles.nickname` | Needed for “run by …” / `{nickname} run` |
| Create entry | `/runs/new` auth-gated | Clear member vs guest surfaces |
| List depth | List + detail + empty roster shell | Ready for S-02 without apply logic |
| Map picker | Search + filters; map optional | Known-map speed and browse-to-pick |
| Validation | Future `starts_at`; free `min_points` | No pts prefill; support 20k+ thresholds |

## Scope

**In scope:**
- `maps` table + seed/import; `nickname`; `runs` reshape
- Public `/runs`, `/runs/[id]`; create `/runs/new` + POST API
- Title resolution helper; map search/filters on create

**Out of scope:**
- Apply/approve (S-02), guest list filters (S-03), archive (S-04), auto-join apply (S-05)
- My-runs (S-08), live GitHub fetch at seed time, Discord/stats

## Architecture / Approach

```text
vendored mapinfo → import script → maps (public SELECT)
profiles.nickname ← member update
runs.map_id? → maps; runs.title?
resolveRunTitle(title | map+nickname | nickname)
Astro SSR /runs + /runs/[id] (anon)
POST /api/runs ← React create island (auth)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Catalog + schema | Migration, seed ~1k maps, types | Date/name quirks; nickname RLS for public titles |
| 2. List + detail | Guest browse + empty roster shell | Empty-state UX until creates exist |
| 3. Create flow | `/runs/new`, picker, validation | Picker UX vs &lt;1 min guardrail |

**Prerequisites:** F-01 applied locally/remotely; Docker for local Supabase  
**Estimated effort:** ~2–3 sessions across 3 phases

## Open Risks & Assumptions

- Remote map seed may need an explicit import step if `db push` skips seed
- Unique `nickname` collisions need clear create-time errors
- Client-side filter of ~1k maps is assumed fine for MVP

## Success Criteria (Summary)

- Guest sees a newly created active run on the public list/detail without logging in
- Organizer can create with map, title-only, or nickname-only fallback under ~1 minute for known maps
- Catalog fields show on detail; participants shell is empty; apply not wired
