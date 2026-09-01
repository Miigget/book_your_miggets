<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Comment screenshots Implementation Plan

- **Plan**: context/changes/comment-screenshots/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit reviewed**: a9f04d2

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence (Phase 2 only)

### Git / blast radius

- `a9f04d2` files: `src/lib/storage.ts`, `src/lib/services/comments.ts`, `src/pages/api/runs/[id]/comments.ts`, `src/lib/fetch-form-json.ts`, `context/changes/comment-screenshots/plan.md` (Progress only).
- Planned admin delete HTTP file was not in the diff — plan allowed “no HTTP change if the service owns remove.” `deleteCommentAsAdmin` now selects `screenshot_path`, deletes the row, then `removeObject` (log-only on storage failure).
- Not in diff (correctly deferred to Phase 3): `RunComments.tsx`, `src/pages/runs/[id].astro`, `AGENTS.md`.
- Like route unchanged. No `clan-pictures` / `getPublicUrl` callers gained the comment bucket.

### Plan vs actual

| Planned | Actual | Verdict |
|---------|--------|---------|
| Constants + path helper; keep clan 1 MiB defaults | `COMMENT_SCREENSHOTS_BUCKET`, `COMMENT_SCREENSHOT_MAX_BYTES = 5_242_880`, `SCREENSHOT_REJECT_MESSAGE`; `commentScreenshotObjectPath` lowercases UUIDs | MATCH |
| `assertPublicImage` / `assertPublicImageFile` / `uploadPublicImage` optional `maxBytes` + `rejectMessage` | Defaults remain `PUBLIC_IMAGE_MAX_BYTES` / `PICTURE_REJECT_MESSAGE`; comment caller passes 5 MiB + screenshot string into **both** assert and upload | MATCH |
| `createSignedObjectUrl(..., 3600)`; fail → log + `null` | Same; does not throw Storage `error.message` | MATCH |
| Never `getPublicUrl` for comment bucket | Comment mint uses `createSignedUrls` / `createSignedObjectUrl` only. `publicObjectUrl` still clan-only | MATCH |
| `RunComment.screenshotUrl`; no `screenshot_path` on DTO | DTO has `screenshotUrl` only; `COMMENT_SELECT` includes `screenshot_path` internally | MATCH |
| List mint: batch `createSignedUrls`, else per-path; mint fail → row null, not whole list | `mintScreenshotUrls` batch then per-path fallback; list still returns | MATCH |
| `createComment` empty / 1000-char / file assert / upload-then-INSERT / rollback / mint after INSERT | Empty without file → `CommentError("Comment cannot be empty")`; `trimmed.length > 0` still hits `COMMENT_BODY_MAX`; `requireConfirmedParticipant` + `requireActiveRun` **before** upload; INSERT `{ id, body: trimmed, screenshot_path }`; rollback `removeObject`; mint null does not fail create on `{ error }` from Storage | MATCH |
| Map `StorageImageError` to `CommentError(SCREENSHOT_REJECT_MESSAGE)` | Mapped; HTTP still sends only `CommentError` or `"Could not post comment"` | MATCH |
| POST `formFile("screenshot")`; JSON `comment.screenshotUrl` | Local `formFile` matches `/api/clans`; `createComment(..., screenshot)` | MATCH |
| Admin delete: path read + row delete + `removeObject`; HTTP unchanged | Service owns cleanup; `delete.ts` still `?commentError=` / same codes | MATCH |
| Do not import `ParticipantError`; do not add organizer/admin write shortcuts | No `ParticipantError` in comments service; same `requireConfirmedParticipant` | MATCH |

### Automated re-check (this review)

- `npm run lint`: **exit 0** (0 errors, 171 pre-existing warnings: `no-console` / `prefer-class-list-directive`). New `console.error` sites match the planned log-don’t-leak pattern.
- `npm run build`: **exit 0**.
- `PUBLIC_IMAGE_MAX_BYTES` is `1_048_576`; `COMMENT_SCREENSHOT_MAX_BYTES` is `5_242_880`. Clan `uploadPublicImage` call sites (`src/lib/services/clans.ts` create + admin update) omit `maxBytes` / `rejectMessage`.

### Manual

- 2.4–2.9: marked `[x]` with Progress note that YOLO skipped human curl. Code matches the plan contracts for those checks (signed mint, fixed reject/empty/1000-char strings at the HTTP boundary, confirmed-only write before upload, admin remove after row delete, clan 1 MiB default). **Not treated as REJECTED** per YOLO override. Residual risk: no live multipart POST against `npm run dev` in this review.

### Phase 1 interaction

- List/create now SELECT/INSERT `screenshot_path` from Phase 1. Private-bucket signed URLs only. Append-only (no UPDATE grant/policy) unchanged.

## Findings

None.

═══════════════════════════════════════════════════════════
  IMPLEMENTATION REVIEW: Comment screenshots Implementation Plan
  Scope: Phase 2 of 3  |  Date: 2026-08-31
  Findings: 0 critical 0 warnings 0 observations
═══════════════════════════════════════════════════════════

  Plan Adherence        PASS    ✅
  Scope Discipline      PASS    ✅
  Safety & Quality      PASS    ✅
  Architecture          PASS    ✅
  Pattern Consistency   PASS    ✅
  Success Criteria      PASS    ✅

  ► Overall: APPROVED
