<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create clan directory — Implementation Plan

- **Plan**: context/changes/create-clan-directory/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 67cd0b6 (`feat(create-clan-directory): Create clan (verified write path) (p2)`)
- **Files**: `src/lib/storage.ts`; `src/lib/services/clans.ts`; `src/pages/api/clans/index.ts`; `src/pages/clans/new.astro`; `src/components/clans/CreateClanForm.tsx`; `src/middleware.ts`; `context/changes/create-clan-directory/plan.md` (Progress 2.1–2.3 only)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Phase 2 Changes Required vs `67cd0b6`:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| `src/lib/storage.ts`: bucket constant, MIME set, 1 MiB, `{ownerId}/{clanId}.{ext}`, `uploadPublicImage`, `publicObjectUrl`, `removeObject`; in-process MIME/size reject; same fixed picture string for in-process and bucket-limit failures; never forward Storage `error.message` | `CLAN_PICTURES_BUCKET`, `PUBLIC_IMAGE_MIME_TYPES`, `PUBLIC_IMAGE_MAX_BYTES = 1_048_576`, `clanPictureObjectPath` (lowercased UUIDs + `jpg`/`png`/`webp`), all three helpers; `assertPublicImage` before upload; `isBucketLimitFailure` → `StorageImageError` / `PICTURE_REJECT_MESSAGE`; other failures logged then `Error("upload_failed")` | MATCH |
| `ClanError` fixed strings only; log PostgREST server-side | Constants for verified-only, nickname-locked, already-member, tag-taken, picture reject, generic create/load; `console.error` then `ClanError(CLAN_CREATE_FAILED)` | MATCH |
| `requireVerifiedViewer` from `public_profiles.is_verified`; do not throw `FriendsError` | Module-private lookup; throws `ClanError(CLAN_VERIFIED_ONLY)` | MATCH |
| `getClanMembershipForUser` → `{ clanId } \| null` | `clan_members.user_id` → `{ clanId }` / null | MATCH |
| `createClan`: trim CHECKs, generate `clanId`, optional upload, INSERT `id`/`owner_id`/`name`/`tag`/`picture_path`, omit `points`; 23505 blob `includes` `clans_tag_lower_btrim_uidx` / `clan_members_pkey`; remove object on insert failure | `crypto.randomUUID().toLowerCase()`; upload then insert without `points`; `mapClanCreateConstraintError` concatenates message/details/hint; `removeObject` before mapped throw | MATCH |
| `listClans` / `getClanById` may land this phase; members via `public_profiles` (`id`, `nickname` only); rank points DESC, name ASC, id ASC | Both exported; profiles select is `id, nickname` only; three `.order` calls as specified | MATCH |
| `POST /api/clans`: FormData name/tag/optional picture; unauth → `/auth/signin`; `ensureOwnProfile` / `getOwnProfile`; unverified → verified-only; verified && !nickname → locked copy; success `/clans/{id}`; fail `/clans/new?error=` fixed strings | Same HTTP shape as `POST /api/runs`; no nickname field; `ClanError.message` / `CLAN_CREATE_FAILED` only on fail | MATCH |
| `PROTECTED_ROUTES` add `/clans/new`; do not add `/clans` | Array includes `/clans/new`; no `"/clans"` string in middleware | MATCH |
| `/clans/new`: banned banner; unverified copy no form; already-member + link; else `client:load` multipart POST `/api/clans`; optional file `accept` jpeg/png/webp; `ServerError` | Branches match `runs/new.astro` banned/loadError; FriendsInbox-style verify paragraph; membership link `/clans/{id}` | MATCH |

Git scope of `67cd0b6` is the six product files plus Progress checkboxes on `plan.md`. No chrome, no `AGENTS.md`, no `/clans` list/detail pages, no `GRANT UPDATE`. Working-tree dirt (`roadmap.md`, `shape-notes.md`, untracked foundation files, this review) is not part of the commit.

Plan-review F1–F3 are implemented: blob `includes` (no `error.constraint`), picture reject string, verified-without-nickname uses create-run locked copy.

## Success criteria (Phase 2)

| ID | Check | Result |
|----|--------|--------|
| 2.1 | `npm run lint` exits 0 | PASS — this review: 0 errors (136 pre-existing `no-console` / Topbar `class:list` warnings; new files use the same `console.error` pattern as `friends.ts` / `runs/index.ts`) |
| 2.2 | `npm run build` exits 0 | PASS — this review: `astro build` Complete (Cloudflare server) |
| 2.3 | `PROTECTED_ROUTES` contains `/clans/new` and does not contain `/clans` | PASS — `["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile", "/clans/new"]`; no `"/clans"` literal |
| 2.4–2.10 | Manual guest / unverified / member / create / duplicate / MIME | YOLO skip — not a defect. Residual: click-through and Studio object path. Code paths for gates, 23505 mapping, picture reject, and INSERT-without-UPDATE are present |

## Findings

None.

## Residual (not findings)

- **2.4–2.10 browser/Studio** skipped under YOLO (human-action). Implementer left those Progress rows unchecked — not rubber-stamping.
- **Success redirect `/clans/{id}`** will 404 until Phase 3, as the plan already notes. Confirm create via Studio / SQL if Phase 3 has not landed yet.
- **Client MIME uses `File.type`** (form + `assertPublicImageFile`). Plan required MIME/size, not magic-byte sniffing. Bucket `allowed_mime_types` is the second gate. Forced POST still needed to exercise the server picture string if the client `preventDefault`s first.

## Dimension notes

- **Plan Adherence**: Storage helper, clan service (including optional list/detail readers), multipart POST, protected create UI, and middleware prefix all MATCH. Picture is INSERT-only; F-02 no-UPDATE freeze untouched.
- **Scope Discipline**: “What We're NOT Doing” held — no R2, no `GRANT UPDATE`, no `/clans` prefix-protect, no New clan chrome, no client `clan_members` writes, no comment-screenshot bucket. `listClans`/`getClanById` are explicitly allowed this phase.
- **Safety & Quality**: Authn on the API; verified + nickname-locked gates; banned POST already middleware-gated; `?error=` is `ClanError` / fixed copy (lessons.md); object key is `{uuid}/{uuid}.{ext}` not a URL; `public_profiles` nickname only; upload rollback via folder-scoped DELETE. supabase-js Storage: `upload` + `contentType` + `upsert: false`, `getPublicUrl`, `remove([path])` match current client docs.
- **Architecture**: Bucket-parameterized helper stays decoupled from clan pages; service owns DTOs and constraint mapping; pages/API stay thin. S-20 can pass a different bucket; it must not reuse `clan-pictures`.
- **Pattern Consistency**: `POST /api/runs` fail/redirect/`ensureOwnProfile`/`getOwnProfile`; `CreateRunForm` FormField/ServerError/SubmitButton/`client:load`; `friends.ts` `AppSupabaseClient` import and verified lookup; `mapRunMapCategoryConstraintError` blob parse. `new.astro` maps non-`ClanError` load failures to a generic string (runs/new uses `err.message`) — not worth a finding.
- **Success Criteria**: 2.1–2.3 re-executed this review. 2.4–2.10 are YOLO residual, not rubber-stamping.

## Proceed

Crew override: no triage (YOLO informational / Done). Report saved; `change.md` stays `implementing` so the crew does not route `impl_reviewed` → archive. Next: `/10x-implement create-clan-directory` Phase 3.
