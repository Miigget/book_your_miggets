<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Comment screenshots Implementation Plan

- **Plan**: context/changes/comment-screenshots/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation
- **Commits reviewed**: 8273109 (p1), a9f04d2 (p2), 0ffac8b (p3), c934848 (epilogue)
- **Prior phase reviews**: impl-review-phase-1.md APPROVED; impl-review-phase-2.md APPROVED; impl-review-phase-3.md APPROVED (this pass still covers all three phases)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence (full plan)

### Git / blast radius

Product files in `8273109^..HEAD`:

| File | Phase | Role |
|------|-------|------|
| `supabase/migrations/20260831130723_comment_screenshots.sql` | 1 | Column, CHECKs, private bucket, storage RLS |
| `src/types/database.ts` | 1 | Generated `screenshot_path` + helper |
| `src/lib/storage.ts` | 2 | Caps, path helper, signed URL, optional maxBytes |
| `src/lib/services/comments.ts` | 2 | Attach at INSERT, mint URLs, admin remove |
| `src/pages/api/runs/[id]/comments.ts` | 2 | Multipart `screenshot` file |
| `src/lib/fetch-form-json.ts` | 2 | JSON DTO `screenshotUrl` |
| `src/components/runs/RunComments.tsx` | 3 | File input + inline `<img>` |
| `AGENTS.md` | 3 | Private-bucket / no-ACL-widen sentence |

Not in the product diff (correct):

- `src/pages/runs/[id].astro` — plan: touch only if an extra prop was needed; ACL gates unchanged (`canReadComments` / `canPostOrLike`).
- `src/pages/api/admin/runs/[id]/comments/[commentId]/delete.ts` — plan: no HTTP change if the service owns remove.
- `src/pages/api/runs/[id]/comments/[commentId]/like.ts` — like route unchanged.
- `clan-pictures` migration and `getPublicUrl` callers — still clan-only (`src/pages/clans/*.astro`).

Change-folder extras (plan, briefs, phase reviews, crew-decisions) are workflow artifacts, not product scope creep.

### Plan vs actual

#### Phase 1 — schema, private bucket, storage RLS

| Planned | Actual | Verdict |
|---------|--------|---------|
| `screenshot_path` + three CHECKs (regex, author bind, run bind) | Same constraint names and expressions | MATCH |
| Drop `run_comments_body_nonempty_chk`; add `run_comments_body_or_screenshot_chk`; keep max-length; body stays NOT NULL | Present; `body_max_length_chk` untouched in `20260820092809` | MATCH |
| No GRANT UPDATE; no `run_comments` UPDATE policy | Migration does not GRANT UPDATE and adds no UPDATE policy | MATCH |
| Private bucket `comment-screenshots`, 5242880, jpeg/png/webp, `public=false` | Exact insert | MATCH |
| Helper `comment_screenshot_object_run_id`: STABLE, SECURITY DEFINER, `search_path=''`, uuid regex then cast else null; revoke public; grant authenticated | Exact | MATCH |
| Storage SELECT/INSERT/DELETE; no anon SELECT; no UPDATE policy | Three policies, `TO authenticated` only; DELETE = own-folder+active **or** `is_admin()` | MATCH |
| Types via `db:types`: `screenshot_path` on Row/Insert | Generated; Insert optional; Update field is gen output | MATCH |
| Do not touch `clan-pictures` or comment-table INSERT/SELECT/DELETE | Migration does not | MATCH |

#### Phase 2 — storage helper, comment service, multipart POST

| Planned | Actual | Verdict |
|---------|--------|---------|
| Constants + path helper; keep clan 1 MiB defaults | `COMMENT_SCREENSHOT_MAX_BYTES = 5_242_880`; `commentScreenshotObjectPath` lowercases UUIDs | MATCH |
| `assertPublicImage` / `assertPublicImageFile` / `uploadPublicImage` optional `maxBytes` + `rejectMessage` | Defaults remain 1 MiB / picture string; comment caller passes 5 MiB + screenshot string into **both** assert and upload | MATCH |
| `createSignedObjectUrl(..., 3600)`; fail → log + `null` | Same; does not throw Storage `error.message` | MATCH |
| Never `getPublicUrl` for comment bucket | Comment mint uses `createSignedUrls` / `createSignedObjectUrl` only | MATCH |
| `RunComment.screenshotUrl`; no `screenshot_path` on DTO | DTO has `screenshotUrl` only; `COMMENT_SELECT` includes path internally | MATCH |
| List mint: batch then per-path; mint fail → row null, not whole list | `mintScreenshotUrls`; list still returns | MATCH |
| `createComment`: empty / 1000-char / confirmed+active **before** upload / rollback / mint after INSERT | Same order; `body: trimmed` (`''` when screenshot-only) | MATCH |
| Map `StorageImageError` to `CommentError(SCREENSHOT_REJECT_MESSAGE)` | Mapped; HTTP sends only `CommentError` or `"Could not post comment"` | MATCH |
| POST `formFile("screenshot")`; JSON `comment.screenshotUrl` | Local `formFile` matches `/api/clans` | MATCH |
| Admin delete: path read + row delete + `removeObject`; HTTP unchanged | Service owns cleanup; `delete.ts` still `?commentError=` | MATCH |
| Do not import `ParticipantError`; no organizer/admin write shortcuts | Same `requireConfirmedParticipant` | MATCH |

#### Phase 3 — island and AGENTS.md

| Planned | Actual | Verdict |
|---------|--------|---------|
| Compose `encType="multipart/form-data"`; `name="screenshot"`; accept jpeg/png/webp + extensions | Same attributes | MATCH |
| Client check vs `COMMENT_SCREENSHOT_MAX_BYTES` / `PUBLIC_IMAGE_MIME_TYPES`; reject with `SCREENSHOT_REJECT_MESSAGE` and do not submit | `onPost` returns before `fetchFormJson` | MATCH |
| Hint: JPEG, PNG, or WebP. Max 5 MB | Exact copy; chrome matches `CreateClanForm` | MATCH |
| Thread: `<img src={screenshotUrl} alt="Comment screenshot" />` under body, `max-w-full` via `cn()` | `cn("mt-3 max-w-full")`; extra `mt-3` is spacing | MATCH |
| Empty body: do not render an empty body paragraph | `{comment.body ? ( <p>…</p> ) : null}` | MATCH |
| Append returned comment including `screenshotUrl` | Unchanged `setItems` after JSON success | MATCH |
| No paste/drop, lightbox, or second request | None present | MATCH |
| `[id].astro`: no ACL widening | File untouched | MATCH |
| AGENTS.md: private Storage + signed URLs; do not reuse `clan-pictures`; do not widen post/read | Same sentence on both hard-rule bullets | MATCH |

### What We're NOT Doing (scope guardrails)

Respected: no guest/pending/unseated organizer-admin write; no separate screenshot table/route; no `clan-pictures` / `getPublicUrl` for comment bytes; no Worker proxy, thumbnails, lightbox, paste/drop; no author edit/delete or attach-to-existing (no UPDATE); no moderation/NSFW/virus scan; clan cap stays 1 MiB; no GIF/BMP/video; no pagination/realtime/Vitest/`service_role`; no S-23 verified-finish; no `deleteRunAsAdmin` prefix-purge.

### Automated re-check (this review)

- `npm run lint`: **exit 0** (0 errors, 171 pre-existing warnings: `no-console` / `prefer-class-list-directive`). New `console.error` sites match the planned log-don’t-leak pattern (`lessons.md`: no Storage/PostgREST `error.message` on `?commentError=`).
- `npm run build`: **exit 0**.
- `PUBLIC_IMAGE_MAX_BYTES` is `1_048_576`; `COMMENT_SCREENSHOT_MAX_BYTES` is `5_242_880`. Clan `uploadPublicImage` call sites (`src/lib/services/clans.ts` create + admin update) omit `maxBytes` / `rejectMessage`.
- `npx supabase db reset` / `npm run db:types` / live JWT Storage smoke: **not re-run**. Shared local DB must not be wiped for a parallel-crew worktree; `psql` to `127.0.0.1:54322` closed the connection. Schema judged from the migration SQL (verbatim vs plan) plus Phase 1 review’s temp-table CHECK smoke. Residual: same class as skipped Studio 1.6.

### Manual (YOLO)

Progress 1.6, 2.4–2.9, 3.3–3.7 are `[x]` with notes that YOLO skipped human Studio/curl/UI. Code matches the plan contracts for those checks (private bucket SQL, signed mint, fixed reject/empty/1000-char strings at the HTTP boundary, confirmed-only write before upload, admin remove after row delete, clan 1 MiB default, file input + client reject, screenshot-only omits empty `<p>`, section still gated by `canReadComments`, compose/like still gated by `canPostOrLike`). **Not treated as REJECTED** per YOLO override. Residual risk: no live Studio/multipart POST/browser click-through in this review.

### Cross-phase interaction

- List/create SELECT/INSERT `screenshot_path` from Phase 1. Island renders Phase 2 `screenshotUrl` only — no path and no `/object/public/`.
- Guests/pending never receive signed URLs in HTML because `[id].astro` still skips `listCommentsForRun` unless `canReadComments`.
- Storage SELECT mirrors comment-table readers (`is_confirmed_participant` / `is_run_organizer` / `is_admin`). Append-only (no UPDATE grant/policy on `run_comments` or this bucket) is unchanged through Phase 3.
- Create-path rollback `removeObject` still requires the active-window Storage DELETE policy from Phase 1; after archive only `is_admin()` can remove objects.

## Findings

### F1 — Authenticated still has table-level UPDATE on `run_comments`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260820092809_run_comments.sql:80 (pre-existing; this slice did not change grants)
- **Detail**: Plan smoke 1.3 asks `has_table_privilege(..., 'UPDATE')` to stay false. S-12 granted `select, insert, delete` without `REVOKE UPDATE` (unlike `runs`). This slice correctly did not GRANT UPDATE and added no UPDATE policy, so append-only remains RLS-enforced. Carried forward from impl-review-phase-1.md F1; still true of the shipped schema.
- **Fix**: Optional later `revoke update on table public.run_comments from authenticated` if we want the smoke criterion to match privilege bits. Not required before archive; no UPDATE policy means PostgREST still cannot update rows.
- **Decision**: PENDING

═══════════════════════════════════════════════════════════
  IMPLEMENTATION REVIEW: Comment screenshots Implementation Plan
  Scope: Phases 1–3 of 3  |  Date: 2026-08-31
  Findings: 0 critical 0 warnings 1 observation
═══════════════════════════════════════════════════════════

  Plan Adherence        PASS    ✅
  Scope Discipline      PASS    ✅
  Safety & Quality      PASS    ✅
  Architecture          PASS    ✅
  Pattern Consistency   PASS    ✅
  Success Criteria      PASS    ✅

  ► Overall: APPROVED

═══════════════════════════════════════════════════════════
  OBSERVATION FINDINGS ℹ️
═══════════════════════════════════════════════════════════

  F1 — Authenticated still has table-level UPDATE on run_comments
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
    Severity:  ℹ️ OBSERVATION
    Impact:    🏃 LOW — quick decision; fix is obvious and narrowly scoped
    Dimension: Safety & Quality
    Location:  supabase/migrations/20260820092809_run_comments.sql:80

    Detail:
    Plan smoke 1.3 wants has_table_privilege UPDATE false. authenticated
    still has UPDATE from default ALL grants. This slice did not GRANT
    UPDATE and added no UPDATE policy. Append-only is RLS.

    Fix: Optional revoke update on run_comments from authenticated later.
         Not an archive blocker.
