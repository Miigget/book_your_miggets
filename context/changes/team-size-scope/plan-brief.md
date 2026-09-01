# Team-size bands under Advanced settings — Plan Brief

> Full plan: `context/changes/team-size-scope/plan.md`
> Research: `context/changes/team-size-scope/research.md`

## What & Why

Organizers need an optional team-size scope so a minimum number of players auto-join and remaining slots up to max require approval (prd-v2 FR-005 / FR-026, US-01). Production join control stays approval vs auto-join on the default form; the band lives under Advanced so the 1-minute create guardrail holds.

## Starting Point

Join mode is a two-value enum with a default-form select. Auto-join confirms only via locked `auto_join_run` (`FOR UPDATE`). Apply on approval inserts pending. Accept still soft-overfills. There is no Advanced UI and no min-band column. Existing runs must keep today’s behavior.

## Desired End State

Empty Advanced = today’s `join_mode`. Set min N → auto-join until N confirmed (organizer counts), then Apply until max; “already full” only at max. After the first non-organizer participant, join mode and the band freeze together. Invite-only create/edit persist the column. Cards still show binary join mode; detail adds “Auto-join first N.”

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Default form | Two-option `join_mode`; no third enum | 1-minute create guardrail; S-26 risk | Roadmap / Crew |
| Overlay | Band overlays any `join_mode` | PRD: auto-join up to min when team-size is used | PRD |
| Apply overlay | Replace `applyToRun` confirmed post-check; `autoJoinRun` must not stay `Promise<void>` | Void helper + `:255-258` would never pending-insert on `band_full` | Plan-review F1 |
| Unset | `auto_join_min` NULL | No-op backfill; empty Advanced omits the write | Plan |
| Freeze | Same lock as join_mode (any non-organizer row) | Same desync class as flipping auto-join mid-roster | Plan |
| RPC | New `band_full`; keep `full` for max | Band-full must pending-insert, not hard-stop | Plan |
| Accept | Keep S-02 soft overfill | Double-confirm is auto-join last-slot, already locked | Plan |
| Labels | Keep `formatJoinMode` + detail team-size line | Overlay, not a third mode; cards omit the extra line | Plan |
| CTA | Join under band; Apply after; full at max | Matches fill rule; band-full never hides Apply | Plan |
| Invite / grants | Copy live RPC bodies; DROP + re-GRANT EXECUTE; GRANT UPDATE appends column | DROP loses function grants; silent no-op if column omitted | Research / Crew / Plan-review F2 |
| Public mapper | `auto_join_min: null` in `runRowFromPublicRpc` | RPC RETURNS TABLE has no column; Incoming cards stay binary | Plan-review F3 |

## Scope

**In scope:** Nullable `auto_join_min`; CHECK; grant list; freeze trigger; `band_full` on `auto_join_run`; apply fallthrough; create/edit (public + invite); Advanced UI; detail line + CTA; dashboard pending on banded auto-join; `AGENTS.md`.

**Out of scope:** `ALTER TYPE join_mode`; capacity in Advanced; hardening Accept; card hybrid labels; `list_player_public_runs` new column; waitlists; Vitest; withdraw/leave/kick changes.

## Architecture / Approach

One new nullable column beside existing `join_mode`. Overlay runs call the same locked RPC; `applyToRun` switches on the text outcome (`band_full` falls through to the pending insert RLS already allows — never the confirmed post-check). Invite setter uses an explicit update flag so NULL can clear the band (coalesce cannot); DROP copies live bodies then re-GRANTs EXECUTE. Guest Incoming maps via `runRowFromPublicRpc` with `auto_join_min: null` (no `list_player_public_runs` DROP). UI disclosure is the first Advanced occupant; Capacity stays on the flat form.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema, RPC, grants, types | Column + `band_full` + freeze + invite args | Forgetting column GRANT or EXECUTE after DROP; copying the wrong create body |
| 2. Apply + create/edit APIs | Overlay apply; persist/clear/lock the band | Confirmed post-check after `band_full`; pending-insert after max-full; coalesce on invite edit |
| 3. Advanced UI + CTA + AGENTS.md | Form, detail, dashboard chip, agent contract | Third-looking join label; hiding Apply at band-full |

**Prerequisites:** Shipped approval + auto-join (already on `main`); local Supabase for Phase 1.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- YOLO skips Progress Manual rows (residual risk); SQL last-slot check in Phase 1 is the race stand-in.
- Direct PostgREST can write `auto_join_min` once granted (accepted, same class as capacity > 64).
- `min = max` is all auto-join until capacity (`full` wins over `band_full`).
- Overlay on `approval_required` changes `auto_join_run`’s `not_auto_join` gate — required by PRD, not a third mode.

## Success Criteria (Summary)

- Organizer can set or omit a min under Advanced without a third default-form join option.
- With a min set, early players auto-join and later players apply until max; unbanded auto-join/approval unchanged.
- Concurrent last min-band seats do not double-confirm; max-full still rejects; Accept can still overfill.
