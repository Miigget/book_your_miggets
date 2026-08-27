# Create clan directory — Plan Brief

> Full plan: `context/changes/create-clan-directory/plan.md`
> Research: `context/changes/create-clan-directory/research.md`

## What & Why

Verified members can create a clan (name, tag, optional picture) so guests can browse a public directory, open details, and see clans ranked by points — the north-star proof that the competition surface is real (S-18 / FR-014, FR-016–018). Ranking is honest zeros until S-23; invites, clan runs, officers, and points writes stay out.

## Starting Point

F-02 already shipped `clans` / `clan_members` with guest SELECT, verified INSERT (`points = 0`), owner-seat trigger, unique tag, and one clan per player. There is no picture column, no UPDATE grant, no `/clans` routes, and no Storage buckets.

## Desired End State

Guests open `/clans` (ranked list) and `/clans/{id}` (name, tag, picture or placeholder, members as nicknames, points) without signing in. A verified non-member creates a clan at `/clans/new`. Unverified users see “ask an admin to verify”; already-members see their clan, not a doomed form. Email never appears on clan pages.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Public routes | `/clans` + `/clans/{id}`; do not prefix-protect `/clans` | Same prefix trap as `/runs` | Crew Lead |
| Create gate | Signed-in + verified (`requireVerifiedViewer` + existing RLS) | Create-run allows unverified public runs; friends is the copy-target | Research / Crew Lead |
| Ranking | `points` DESC, then `name`, then `id` | Honest zeros until S-23; stable ties | Crew Lead / Plan |
| Picture backend | Supabase Storage public `clan-pictures` + path on INSERT | Reuses `SUPABASE_URL`/`KEY`; S-20 reuses the helper, not this public bucket | Plan |
| Picture required | Optional nullable `picture_path` | Name+tag still INSERT if upload is skipped or fails | Plan |
| Picture write | Client UUID → upload → INSERT; no `GRANT UPDATE` | F-02 froze UPDATE so points cannot move | Research / Crew Lead |
| Already a member | Hide Create; `/clans/new` explains + links | Membership PK would abort a second form submit | Plan |
| Unverified CTA | Guest sign-in; unverified verify-copy; verified Create | Do not copy `/runs` “anyone signed-in can create” | Plan |
| Nav | Topbar Clans + Footer/Welcome Browse clans; no New clan | Create stays on `/clans` with the three CTA states | Plan |

## Scope

**In scope:** picture column + public bucket + storage RLS; verified create API/page; guest directory + details; chrome; AGENTS.md `/clans` rule.

**Out of scope:** invites (S-19), clan runs/officers (S-21), points mutation (S-23), R2/data URLs, clans UPDATE, comment screenshots bucket (S-20).

## Architecture / Approach

SSR Astro list/detail; React island only for the multipart create form. `POST /api/clans` uploads to `{uid}/{clanId}.ext` then inserts under RLS. Members load from `public_profiles`. Shared `src/lib/storage.ts` is bucket-parameterized for S-20.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Picture column + Storage bucket | Nullable `picture_path`, public bucket, still no clans UPDATE | Accidental UPDATE grant re-opens points |
| 2. Create clan (verified write path) | `/clans/new` + `POST /api/clans` + helper | Orphan files if INSERT fails after upload |
| 3. Public directory, details, and nav | Ranked `/clans`, `/clans/{id}`, chrome, AGENTS.md | Prefix-protecting `/clans` would lock guests out |

**Prerequisites:** F-02 on local `db reset`; admin-verified test user; local Supabase Storage.
**Estimated effort:** ~3 implement sessions (one phase each).

## Open Risks & Assumptions

- F-02 + this migration reach production only on the next `v*` tag.
- Public `clan-pictures` must not be reused for S-20 (comment ACL).
- Distinguishing tag vs membership `23505` parses `message`/`details`/`hint` for `clans_tag_lower_btrim_uidx` vs `clan_members_pkey` (no `constraint` field); never put raw PostgREST in `?error=`.
- Picture MIME/size failures use the fixed string “Picture must be a JPEG, PNG, or WebP under 1 MB.” (in-process reject plus bucket-limit mapping).
- Verified with no nickname uses create-run’s locked-request copy; `CreateClanForm` has no nickname field.

## Success Criteria (Summary)

- Guest can browse ranked clans and open details (picture/placeholder, nicknames, points) with no email and no sign-in.
- Only a verified, not-already-membered player can create a clan; picture is optional.
- `clans.points` still cannot be updated by the client.
