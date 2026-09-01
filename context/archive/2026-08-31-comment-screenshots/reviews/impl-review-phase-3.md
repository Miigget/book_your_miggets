<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Comment screenshots Implementation Plan

- **Plan**: context/changes/comment-screenshots/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit reviewed**: 0ffac8b (island + AGENTS.md); epilogue c934848 (Progress SHA + `change.md` implemented)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence (Phase 3 only)

### Git / blast radius

- `0ffac8b` implementation files: `src/components/runs/RunComments.tsx`, `AGENTS.md`.
- Also in `0ffac8b` (change-folder only, not product surface): Progress/`crew-decisions.md`, plus Phase 1/2 review reports that had not landed yet. Not treated as feature scope creep.
- `c934848` epilogue: Progress 3.1–3.7 SHA `0ffac8b`; `change.md` `status: implemented`.
- Not in diff (correct): `src/pages/runs/[id].astro` — plan said touch only if the island needed an extra prop; it did not. `canReadComments` / `canPostOrLike` unchanged.
- Not in diff (correctly already Phase 2): storage helper, comment service, POST route. Island consumes `screenshotUrl` only.
- No paste/drop, lightbox, second request, or `getPublicUrl` / `/object/public/` in the island.

### Plan vs actual

| Planned | Actual | Verdict |
|---------|--------|---------|
| Compose `encType="multipart/form-data"`; file `name="screenshot"`; accept jpeg/png/webp + extensions | Same attributes; `id="comment-screenshot"` | MATCH |
| Client check against `COMMENT_SCREENSHOT_MAX_BYTES` / `PUBLIC_IMAGE_MIME_TYPES`; reject with `SCREENSHOT_REJECT_MESSAGE` and do not submit | `onPost` returns before `fetchFormJson` when size or MIME fails | MATCH |
| Hint: JPEG, PNG, or WebP. Max 5 MB | Exact hint copy; field chrome matches `CreateClanForm` (optional label, `ImagePlus`, red border on reject) | MATCH |
| Thread: `<img src={screenshotUrl} alt="Comment screenshot" />` under body, `max-w-full` via `cn()` | `cn("mt-3 max-w-full")`; extra `mt-3` is spacing only | MATCH |
| Empty body: do not render an empty body paragraph | `{comment.body ? ( <p>…</p> ) : null}` | MATCH |
| `fetchFormJson` already sends `FormData`; append returned comment including `screenshotUrl` | Unchanged `setItems((prev) => [...prev, comment])` after JSON success; `form.reset()` | MATCH |
| Do not add paste/drop, lightbox, or a second request | None present | MATCH |
| `[id].astro`: no ACL widening; do not load comments for guests/pending | File untouched; `canReadComments` still gates `listCommentsForRun` + section mount; `canPostOrLike` still confirmed + not archived + not banned | MATCH |
| AGENTS.md: in comment-ACL / restricted-run bullets, add private Storage + signed URLs; do not reuse `clan-pictures`; do not widen who can post or read | Same sentence added to both hard-rule bullets | MATCH |

### Automated re-check (this review)

- `npm run lint`: **exit 0** (0 errors, 171 pre-existing warnings: `no-console` / `prefer-class-list-directive`). `RunComments.tsx` added no new lint issues.
- `npm run build`: **exit 0**.

### Manual

- 3.3–3.7: marked `[x]` with Progress note that YOLO skipped human UI. Code matches the plan contracts for those checks (file input + client reject, screenshot-only omits empty `<p>`, section still gated by `canReadComments`, compose/like still gated by `canPostOrLike` so archived and unseated organizer/admin have no compose unless confirmed). **Not treated as REJECTED** per YOLO override. Residual risk: no browser click-through against `npm run dev` in this review.

### Phase 1–2 interaction

- Island renders `screenshotUrl` from the Phase 2 DTO only — no `screenshot_path` and no public object URL.
- Guests/pending never receive signed URLs in HTML because `[id].astro` still skips `listCommentsForRun` unless `canReadComments`.
- Append-only and confirmed-only write are unchanged; Phase 3 does not add UPDATE or a second POST.

## Findings

None.

═══════════════════════════════════════════════════════════
  IMPLEMENTATION REVIEW: Comment screenshots Implementation Plan
  Scope: Phase 3 of 3  |  Date: 2026-08-31
  Findings: 0 critical 0 warnings 0 observations
═══════════════════════════════════════════════════════════

  Plan Adherence        PASS    ✅
  Scope Discipline      PASS    ✅
  Safety & Quality      PASS    ✅
  Architecture          PASS    ✅
  Pattern Consistency   PASS    ✅
  Success Criteria      PASS    ✅

  ► Overall: APPROVED
