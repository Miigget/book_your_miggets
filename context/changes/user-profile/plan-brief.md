# Own profile, public profile, clickable nicknames — Plan Brief

> Full plan: `context/changes/user-profile/plan.md`

## What & Why

Members need a first-class identity: manage nickname (until verified), email, password, and self-reported KoG points; see nickname in the top bar; open anyone’s public profile from a nickname. After admin verification, nickname is a trust signal — the member only requests a change; S-16 fulfills it.

## Starting Point

Nickname already exists (unique, set at create/apply). `public_profiles` exposes `id` + `nickname` to guests. Topbar shows email. `/admin/users/{id}` is archive-only. No own/public member pages, no points columns, no request table, no verified nick lock.

## Desired End State

`/profile` (signed-in) edits identity. `/players/{uuid}` is the public page (never email). Top bar nickname → `/profile`, or “Set nickname” if unset. Member-facing nicks (run lists, dashboard, detail, history, landing, applicants) link to the public page; `/admin` user-list nicks stay on the admin player page.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Public URL | `/players/{uuid}` | Nicknames are mutable; UUID matches `/runs/{id}` and `/admin/users/{id}` | Plan |
| Request storage | `nickname_change_requests` table | History + one-pending; S-16 fulfills, this slice only inserts/replaces | Plan |
| Points schema | `kog_points` + `kog_points_verified` now | FR-018 can show “checked in-game” as false until S-16 | Plan |
| Email change | `updateUser` + inbox pending copy | Matches GoTrue; own-profile shows session email until confirmed | Plan |
| Nick lock | Trigger + API gate | PostgREST `profiles_update_own` would bypass app-only checks | Plan |
| Password | Current password then `updateUser` | Stolen session cannot silently rotate; no OTP setting change | Plan |
| Top bar | Nick → `/profile`; null → “Set nickname” | FR-017 removes email from chrome | Plan |
| Second request | Replace pending row | User can fix a typo; S-16 sees the latest string | Plan |
| Phases | Schema → own/chrome → public+links | Public links must not 404; schema is shared | Plan |

## Scope

**In scope:** Own profile; public profile; clickable member-facing nicks; points + verified flag; request INSERT/replace; verified nick lock; top bar nickname.

**Out of scope:** Friends (S-11); admin fulfill/edit UI (S-16); labels (S-17); email on public pages; SMTP/Auth project flags.

## Architecture / Approach

Cookie SSR + form POST APIs. Public reads go through `public_profiles` (`security_invoker = false` so guests work). Own writes use `profiles` RLS plus an extended privileged-column trigger. Auth email/password stay in GoTrue (`updateUser`), not `profiles`. A small href helper + Astro/React NicknameLink wraps existing `organizerId` / `userId` fields. Run cards that are one big `<a>` (`/runs`, history, dashboard, landing, admin archive) must split so organizer links are valid HTML. Do not parse names out of `displayTitle`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema / trigger / view / types | Columns, request table, nick lock, wider `public_profiles` | Recreating the view with invoker=true would hide guests |
| 2. `/profile` + APIs + topbar | Member mutations; chrome nick; verified request path | Email confirmation differs local vs hosted |
| 3. `/players/{uuid}` + links | Public page; nick links; card split | Nested `<a>` on list cards |

**Prerequisites:** S-02 shipped (auth, nickname, `public_profiles`). Local Supabase for `db reset` + `npm run db:types`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Hosted Auth may require email confirmation even though local `enable_confirmations` is false — copy must cover both.
- Verified member with no nickname (edge) cannot inline-set one; they request via `/profile` until S-16.
- Admin request inbox/UI is S-16; this slice only lands table + admin RLS.
- Implementer notes (plan-review F5–F6, accepted): if setting `emailRedirectTo`, use an absolute URL from the request origin (relative `/profile` is not valid GoTrue) and do not edit `config.toml`; banned players stay on `public_profiles` — a guest should still open their `/players/{uuid}`.

## Success Criteria (Summary)

- Member can edit own profile; verified users request nick changes instead of saving nick.
- Top bar shows nickname (never email) and opens `/profile`.
- Clicking a roster/organizer nick opens `/players/{uuid}` with no email.
