# Admin profile edits — Plan Brief

> Full plan: `context/changes/admin-profile-edits/plan.md`

## What & Why

Admins need to fulfill S-10’s identity hooks: edit nickname and KoG points, mark points verified after an in-game check, and accept or deny nickname-change requests (FR-023, FR-024, US-10). Without this slice, verified nick locks and self-reported points have no trusted admin path.

## Starting Point

`/admin/users/{id}` is S-09 archive-only (`id` + nickname + past runs). S-10 already shipped `kog_points`, `kog_points_verified`, `nickname_change_requests` (one pending per user), admin RLS, and member request INSERT/replace. Public `/players/{id}` already shows “Checked in-game” vs “Self-reported”. There is no admin UI/API to write those fields. The trigger clears the points flag only for non-admins, and that same branch restores the flag when points are unchanged (the only SET-true lock).

## Desired End State

An admin finds pending nick requests from a marker on `/admin`, opens the existing player page, and edits nick/points, toggles points-verified (not on empty points), and accepts or denies the current request. Public identity updates immediately. Unverify denies any pending request so Accept cannot later clobber a self-serve nick.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Surface | Existing `/admin/users/{id}` only | FR-024; no second profile | Crew |
| Discovery | Pending marker on `/admin` list | Mutations stay on the player page; queue is findable | Plan |
| Direct nick vs pending | Close row: match → accepted, else denied | Keeps `/profile` honest; frees one-pending | Plan |
| Accept uniqueness | Apply nick + accepted together; collision keeps pending | No accepted-but-not-applied lie | Plan |
| Points vs verify | Separate save vs Mark verified/Unverify | FR-024 is two acts; no retype to confirm | Plan |
| Points change | Always clear `kog_points_verified` (trigger, all roles) | Stale “Checked in-game” cannot remain | Plan |
| Member flag lock | Non-admin restore `old.kog_points_verified` when points unchanged | Only DB lock against SET true via PostgREST; admins skip restore so Mark verified works | Plan-review F1 |
| Who can be edited | Every player the page opens (incl. banned) | PRD “at any time”; public profile still exists | Plan |
| Request UI | Pending only | Fulfill inbox, not an audit log | Plan |
| Schema extras | No review columns | Reuse S-10 table | Plan |
| Unverify | Deny-if-any first, then flip flag | Prevents Accept overwriting a self-serve nick; missing pending is success (Deny button still errors) | Plan / F2 |
| Verify-on-null | Error + hide/disable Mark verified; Unverify still allowed | Public must not show “— / Checked in-game” | Plan-review F4 |
| Player pending load | Isolated try; keep editors; inline error; omit Accept/Deny | Queue read must not 500 nick/points/flag | Plan-review F3 |
| Phases | Trigger/services/APIs → UI | Contract smoke before click-through | Plan |

## Scope

**In scope:** Trigger replace (all-role clear + non-admin flag restore); admin nick/points/flag/request APIs; editors on `/admin/users/{id}`; `/admin` pending marker; unverify deny-if-any; no verify-on-null; pending-load degrade; docs one-liners.

**Out of scope:** Second admin URL; labels (S-17); request history UI; `reviewed_by` / notes; moving ban/verify; member notification; React admin islands.

## Architecture / Approach

```text
POST /api/admin/users/{id}/nickname | points | points-verified | nickname-request
  → admin cookie + role check (not middleware 404)
  → admin.ts (parse + public_profiles uniqueness + AdminError)
  → redirect /admin/users/{id}?notice= | ?error=

GET /admin/users/{id}
  → getProfileForAdmin (id, nick, points, flag)  // pending load is a separate try
  → pending ok → Accept/Deny; pending fail → editors + inline error, no Accept/Deny
  → archive list (unchanged)
  → Mark verified hidden/disabled when kog_points is null

Unverify on /admin → deny-if-any pending, then is_verified=false
  (Deny button: no pending → “No pending nickname request”)
Trigger:
  non-admin: restore role/verified/banned/nick; restore flag if points unchanged
  all roles: kog_points distinct ⇒ kog_points_verified=false
  then updated_at
setKogPointsVerified(true) errors when kog_points is null
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Trigger + services + APIs | Invariant + restore lock + mutations + routes | Dropping the non-admin flag restore; reusing Deny-on-missing for Unverify |
| 2. Player page + list marker | Click-through fulfill + discovery | Nested extra surface; pending-load 500; Mark verified on empty points |

**Prerequisites:** S-09 and S-10 shipped; SQL-promoted admin; local Supabase for `db reset`.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- YOLO may skip Progress manuals; residual risk is the 404 matrix, uniqueness-while-pending, unverify-then-pending race, and a missed inbox until reload after pending-load degrade.
- `getPendingNicknameRequest` is not ownership-gated — correct only on an admin (or own) cookie; do not call it from a public page with another id.
- Combined UPDATE of points + `verified=true` still loses the flag after the trigger — APIs must not send both.
- Non-admin flag restore is the only SET-true lock (`profiles_update_own` is wide); dropping it would let members fake “Checked in-game.”
- Deny-if-any must stay distinct from Deny-button missing-row error, or Unverify without a pending row regresses S-06.

## Success Criteria (Summary)

- Admin can edit nick/points and mark points checked in-game on `/admin/users/{id}` when a number is stored; public profile matches; empty points cannot be marked verified
- Pending requests are findable on `/admin` and accepted or denied on the player page without uniqueness lies; pending-load failure still leaves editors usable
- Unverify deny-if-any (works with or without a pending row); member still cannot self-rename while verified or SET the points flag true
