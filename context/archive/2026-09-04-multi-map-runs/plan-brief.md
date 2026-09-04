# Multi-map session (S-27) — Plan Brief

> Full plan: `context/changes/multi-map-runs/plan.md`

## What & Why

Organizer can attach multiple maps to one run for a single session; the active list and detail show that set (prd-v2 FR-009 / US-01). Category-only runs must still render a coherent card when the list is empty. Poll (S-28) stays a separate tool.

## Starting Point

A run has one optional `map_id` and/or `map_category` (app XOR; both-null legal). No junction. MapPicker is single-select on the default form. Cards, detail, `list_player_public_runs`, and `verify_clan_run_finish` all assume that one FK. Invite-only writes the same two columns via RPCs. Public create is an inline `runs.insert()` in `src/pages/api/runs/index.ts` (no `createRun` in `runs.ts`). Guests cannot SELECT archived parents; the profile RPC still returns archived public.

## Desired End State

Create/edit accept 0–8 distinct catalog maps (add-order). First map syncs to `runs.map_id`; category is stored only when the list is empty. Cards list `name · difficulty · pts` (first 3 + `+N more`); detail stacks compact rows. Untitled titles still use the first map name. Search matches any attached name. Verify-finish still awards the synced `map_id` only. Guest Incoming/Recent show the set for public runs, including archived public, without opening archived `/runs/{id}` for non-participants.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Scope | S-27 only; no poll | PRD: poll and multi-map are separate tools | Crew / Roadmap |
| Storage | Junction `run_maps` (position, unique, FK) | Matches `run_invites` / participants; JSON loses catalog integrity | Plan |
| Legacy columns | Keep `map_id` / `map_category`; sync `map_id` to first list map | S-28 lock field; verify + guest RPC keep current shape | Plan |
| Verify this slice | Unchanged — award `runs.map_id` only | S-27 outcome is attach + show, not points | Crew / Plan |
| Category | Write XOR; empty list may be category-only | Preserves S-14; mixed labels fight cards | Plan |
| Cap | 8 + CHECK | Enough for a session; unbounded blows cards/FormData | Plan |
| Cards / detail | Names on cards (truncate 3); compact rows on detail | List shows the set without a 7-field dump | Plan |
| Title | Keep `resolveRunTitle` (first map / `{nick} run`) | First-map sync stays honest; joined names overflow | Plan |
| Guest RPC | Do not DROP `list_player_public_runs`; batch-attach `run_maps` | S-26: RETURNS TABLE DROP is the expensive path | Plan |
| F1 SELECT | Parent visible **or** DEFINER `run_is_public` (public incl. archived) | Guest Recent batch-read; do not widen `can_view_run` or archived `/runs/{id}` | Plan-review |
| F2 setter | `p_map_ids` default NULL = skip; `'{}'` or list replaces; create may default `'{}'` | Same omit-to-keep as S-26; `'{}'` on setter would wipe backfill on 12-arg edits | Plan-review |
| F3 create write | Junction after the live insert in `src/pages/api/runs/index.ts` (or a helper it calls) | There is no `createRun` in `runs.ts`; invite stays RPC-only | Plan-review |
| Invite writes | `p_map_ids` on both RPCs; DROP + re-GRANT EXECUTE | Invite-only must persist the list in one transaction | Plan |

## Scope

**In scope:** `run_maps` + F1 RLS + backfill; invite RPC args (F2); normalize/XOR/sync; create/edit FormData; public create junction at the API insert (F3); DTO + loaders + `?map=` any-name; MapPicker multi-select; shared card/detail summary; `AGENTS.md`.

**Out of scope:** S-28 poll; verify SUM; officer Complete / verify queue; dropping `map_id`; category+maps together; title joins; 7-field × N detail; widening `can_view_run`; Vitest; clan page run lists.

## Architecture / Approach

New child table beside the existing two columns. App normalize produces `mapIds` + synced `mapId` + XOR `mapCategory`. Public/friends/clan: insert/update the run then replace `run_maps` in the same request as the live writer (`index.ts` insert or `updateRun`). Invite RPCs write the junction in-transaction. SELECT on `run_maps` is parent-visible or `run_is_public`. Cards share one display helper; `RUN_SELECT` embeds the ordered list; guest Incoming/Recent batch-loads the junction.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema, RLS, backfill, invite RPCs, types | Table + F1 SELECT + backfill + F2 `p_map_ids` | EXECUTE lost after DROP; setter `'{}'` wipe; guest Recent if SELECT is exists-only |
| 2. Normalize, APIs, loaders, filter | Persist list; `maps[]` on every DTO; F3 create insert | Public create skipped if implementer only touches `runs.ts` |
| 3. MapPicker, cards, detail, AGENTS.md | Organizer UX + list/detail set | Blank Map row on category-only; card/detail fork |

**Prerequisites:** Shipped create/edit + category-only (on `main`); local Supabase for Phase 1.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Anon who knows a public archived run id can read its `run_maps` catalog names even when `/runs/{id}` 404s — accepted (F1); map names are catalog data.
- Public create is run insert then junction replace; if the second write fails, do not redirect as success; synced `map_id` still makes a coherent single-map card if the run row remains.
- Verify awards only the first map until a later slice; accepted for S-27.
- YOLO skips Progress Manual rows (residual risk).
- S-28, when built, must write `map_id` only and leave `run_maps` alone.

## Success Criteria (Summary)

- Organizer can attach 1–8 maps (or category-only / empty) on create/edit, including invite-only and public create via the API insert.
- `/runs` cards and `/runs/{id}` show the set; category-only cards never show a blank Map line.
- Restricted runs still 404; guests do not read those `run_maps`. Guest Recent can show maps on archived public. Clan verify-finish and Complete stay as shipped.
