# Map poll (S-28) — Plan Brief

> Full plan: `context/changes/map-poll/plan.md`
> Research: `context/changes/map-poll/research.md`

## What & Why

Organizer creates a map poll whose options are specific catalog maps; confirmed participants vote; organizer close locks the winning map onto the run. FR-010 / US-01: poll and multi-map are separate tools. Close writes `runs.map_id` and must not replace `run_maps`.

## Starting Point

Session maps live in `run_maps`; `runs.map_id` is the synced first/legacy/S-28 lock field. Every edit re-syncs `map_id` from `run_maps[0]`. Votes should copy comment **write** ACL. No poll tables exist.

## Desired End State

One poll per run (2–8 catalog options, not tied to the playlist). Confirmed voters change-vote with no live counts. Close with ≥1 vote locks the winner (tie → add-order); zero votes refused. After close, edit can still change the playlist but cannot unlock `map_id`. Detail/edit show Locked map beside the session list.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Lock target | `runs.map_id` + XOR-clear category; never `replaceRunMaps` | Dual identity; verify-finish awards `map_id` only | Research / Crew |
| Vote ACL | Comment write (confirmed + not banned + audience-active) | “Same bar as comments” is write, not read | Research / Crew |
| Create/close RPC | DEFINER, `not_found` leak family | Restricted-run 404; close must work after Complete | Research / Crew |
| Poll SELECT | Authenticated comment-read; no `run_is_public` | Guests must not PostgREST archived ballots | Research / Crew |
| Edit after close | Freeze first-map sync (app omit + trigger + setter skip) | Otherwise next save unlocks the winner | Research / Crew |
| Tie-break | Lowest option `position` | Deterministic, no close UI; same as `run_maps` add-order | Plan |
| Reopen | One poll per run, `UNIQUE(run_id)` | FR-010 singular; lock stays frozen vs verify | Plan |
| Create window | `is_run_roster_open_row` (after start OK) | Same gate as edit; Complete/Archive cannot create | Plan |
| Option cap | 2–8 | Reuse `RUN_MAPS_MAX` / MapPicker | Plan |
| Zero-vote close | Refuse `no_votes` | No lock without a ballot; UNIQUE would trap a null lock | Plan |
| Tallies | Hide until close; own vote visible | No bandwagon; RLS must match (not just UI) | Plan |

## Scope

**In scope:** schema + three RPCs; vote RLS (own row until close); map_id freeze; APIs; RunPoll island; Locked map on detail/edit; MapPicker without category XOR; `AGENTS.md` poll routes.

**Out of scope:** replacing `run_maps`; reopen; live tallies; admin close; verify SUM; comment/screenshot ACL; clans ranking; team-size; ownership transfer; test runner; card redesign.

## Architecture / Approach

DEFINER `create_map_poll` / `vote_map_poll` / `close_map_poll` (RPC-only writes). Close tallies then writes `map_id` **before** stamping `closed_at` so the freeze trigger does not reject the winner. Invite setter keeps its signature and skips `map_id` when closed. Page loads poll only after `/runs/{id}` 404 chain; island gated like comments.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema / RPCs / freeze | Tables, RLS, RPCs, trigger, setter skip | Close-vs-trigger order; vote SELECT leak |
| 2. Services / APIs / edit omit | HTTP + wrappers + edit does not unlock | Invite path still writing `p_map_id` |
| 3. Island / Locked map / AGENTS | UI + picker props + docs | Mixing playlist and lock in one field |

**Prerequisites:** local Supabase; shipped S-27 `run_maps` + comment ACL + organizer RPCs.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Unseated organizer cannot vote to unstick a zero-vote poll (close stays refused until someone confirmed votes).
- Cards still show the playlist only; locked map is detail/edit (title/verify already follow `map_id`).
- `CREATE OR REPLACE` of `set_run_visibility_and_invites` must keep the live 13-arg signature (no new skip arg).

## Success Criteria (Summary)

- Confirmed participants vote on catalog options; organizer close locks `runs.map_id` without changing `run_maps`.
- After close, edit cannot unlock the winner; Locked map is visible next to the session list.
- Restricted runs still 404; other voters’ ballots are unreadable until close.
