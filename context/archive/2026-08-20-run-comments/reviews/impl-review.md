<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Run comments and likes

- **Plan**: context/changes/run-comments/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: 9e16af7 (p1), b004669 (p2), ab0bd3e (p3), 8d576a4 (epilogue)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

Full-plan review of product commits `9e16af7` → `ab0bd3e` (epilogue `8d576a4` is plan Progress / change status only). Nested drift + safety agents plus a main-context spot-check of the eight planned product files. Prior phase reviews (`impl-review-phase-1.md`, `impl-review-phase-2.md`) were both APPROVED with 0 findings; this pass re-checked cross-phase ACL alignment (UI flags vs service gates vs RLS).

Product files in `9e16af7^..HEAD` are exactly the planned set. 10x artifacts (`context/changes/run-comments/*`, `context/foundation/roadmap.md`) are expected, not product scope creep. `participants.ts` and `middleware.ts` / `PROTECTED_ROUTES` were not edited.

Supporting extras, not scored as findings (same call as Phase 1 for indexes): `run_comments_author_id_idx` / `run_comment_likes_user_id_idx` match existing FK-covering indexes; comment `<time>{formatStart(...)}</time>` renders the planned `createdAt` DTO field with the same helper as run details.

### Plan vs actual

| Planned item | Verdict |
|--------------|---------|
| `run_comments` / `run_comment_likes` schema, CHECKs, composite FK, helpers, RLS, authenticated-only GRANT, no UPDATE, no inline `EXISTS` on `run_participants` | MATCH — `supabase/migrations/20260820092809_run_comments.sql` |
| `npm run db:types`; no hand-edits | MATCH — `src/types/database.ts` Tables `run_comments` / `run_comment_likes` + Functions `is_run_organizer` / `is_run_in_active_window` |
| `CommentError`, `RunComment` DTO, list/create/like/admin-delete; no `loadActiveRunForMutation` / `ParticipantError`; `participants.ts` untouched | MATCH — `src/lib/services/comments.ts` |
| POST create / like / admin-delete; `?commentError=`; guest `returnTo`; non-admin → `/` | MATCH — three API routes |
| `canReadComments` uses `own` **or** `archivedSource === "participant"` **or** organizer **or** admin; skip list query when false; section after Participants / before Admin | MATCH — `src/pages/runs/[id].astro:91-95`, `:275-287` |
| `canPostOrLike = confirmed && !isArchived && !isBanned`; `commentError` vs `?error=` split | MATCH — `:36-37`, `:111`, `:270`, `:284`, `:291-294` |
| `RunComments` island: NicknameLink, `whitespace-pre-wrap` text body, compose/like/admin delete + `window.confirm` | MATCH — `src/components/runs/RunComments.tsx` |
| Not-doing: guest read, JSON GET, threading, markdown, pagination, Vitest, `service_role`, new `PROTECTED_ROUTES` | MATCH |

### Cross-phase ACL

| Actor | UI | Service | RLS |
|-------|----|---------|-----|
| Guest | section omitted | list not called | no `anon` GRANT/policy |
| Confirmed, active, not banned | read + compose/like | confirmed + `activeWindowStartsAfter()` | confirmed + window + `is_not_banned` |
| Unseated organizer | read, no compose/like | writes throw `CommentError` | SELECT organizer; INSERT fails |
| Archived confirmed | read via `archivedSource === "participant"` (`own` not loaded when archived); `canPostOrLike` false | writes fail active window | writes fail `is_run_in_active_window`; SELECT still confirmed |
| Admin, not confirmed | read + delete | `deleteCommentAsAdmin` | SELECT/DELETE `is_admin()` |
| Banned confirmed | `canPostOrLike` false | RLS `is_not_banned`; middleware still `?error=` (existing ban gate) | INSERT/like fail |

Like IDOR: `comment?.run_id !== runId` → `CommentError("Comment not found")`; insert/delete pass URL `runId`; composite FK keeps denormalized `run_id` honest (`comments.ts:177-219`). Admin delete scoped `.eq("id").eq("run_id")`. XSS: body is React text children; no `dangerouslySetInnerHTML`. `lessons.md`: routes put `CommentError.message` or fixed copy on `?commentError=`; PostgREST stays in `console.error`.

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 1.1 Migration applies on local Supabase | Not re-run `db reset` (destructive). Schema still in tree; Phase 1 review confirmed local catalog + `schema_migrations` includes `20260820092809` |
| 1.2 Types include comment tables/helpers | PASS — `src/types/database.ts:154-242`, `:408-409` |
| 1.3 / 2.1 / 3.1 `npm run lint` | PASS — exit 0; 48 pre-existing `no-console` warnings (4 in this slice: service delete + three routes, same infra pattern as `apply.ts` / `delete.ts`); 0 errors |
| 1.4 / 2.2 / 3.2 `npm run build` | PASS — `astro build` complete |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 1.5–1.9 RLS / CHECK | `[x]` | Phase 1 review re-ran anon GRANT deny + CHECK violations; 1.6–1.8 policy SQL + implementer SQL (YOLO) |
| 2.3–2.10 HTTP / domain errors | `[x]` | Code paths match; implementer curl (YOLO). Not re-curled here |
| 3.3–3.11 UI ACL | `[x]` | Loader + island encode the matrix. Implementer curl smoke vs `localhost:4321` (YOLO). Residual: `window.confirm` not clicked (curl skips JS); archived admin-delete error banner not replayed (active `?commentError=` banner verified) |

## Findings

None.

## Residual risk

Full `npx supabase db reset` was not re-executed (local data wipe). Hosted project still lacks `20260820092809` until `/gh-release`. Authenticated leftover `TRUNCATE`/`REFERENCES`/`TRIGGER` on public tables is repo-wide default residue (comments still have no anon access and no UPDATE). Phase 3 browser click-through (`window.confirm`, archived admin `?commentError=` on the comments island) was YOLO-skipped; code paths match `AdminRunControls` + `commentError` wiring. Ban POSTs still surface on `?error=` / `RunParticipantActions`, not the comments island — planned.

## Proceed

Full review saved. 0 findings → no triage. `change.md` stamped `impl_reviewed`.
