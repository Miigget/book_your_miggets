# Comment screenshots — Plan Brief

> Full plan: `context/changes/comment-screenshots/plan.md`

## What & Why

Confirmed participants need to attach `/teamrank` and finish-line screenshots on the run comments they already post (S-20 / FR-001), so S-23 has an in-app proof thread while admins still check in-game by hand. Who can post or read must not widen (FR-027): guests and pending applicants stay out.

## Starting Point

S-12 shipped flat `run_comments` (confirmed write; confirmed / archived participant / organizer / admin read; append-only). S-18 shipped `src/lib/storage.ts` and a **public** `clan-pictures` bucket (1 MiB) that this slice must not reuse. Compose is already `POST /api/runs/{id}/comments` + `FormData`.

## Desired End State

On an active run, a confirmed player posts a JPEG/PNG/WebP (with or without text, max 5 MiB). Readers who can already see comments see the image inline. Bytes are not on a public URL. Archived threads stay readable and write-locked; authors cannot remove screenshot objects (only admin can). Clan pictures stay 1 MiB.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Comment ACL | Unchanged (confirmed write; existing readers) | FR-027 / AGENTS.md; unseated organizer/admin post would be a widen | Crew Lead |
| Entity | Attach to `run_comments`, no screenshot type | Same proof path as FR-001 / US-02 | Crew Lead |
| Object visibility | Private bucket + 1h `createSignedUrl` | Public URLs leak restricted-run proof; Worker proxy is overkill | Plan |
| Cardinality | One nullable `screenshot_path` | Append-only; `/teamrank` + finish-line = two comments | Plan |
| Empty body | Screenshot-only allowed | S-23 proof should not need dummy text | Plan |
| Size / MIME | 5 MiB jpeg/png/webp; clan stays 1 MiB | In-game PNGs often exceed 1 MiB; still tiny vs Worker 100 MB | Plan (override) |
| Composer | File input on existing POST | Known Worker multipart; no clipboard/DnD | Plan |
| Thread UI | Inline `<img>` | Proof visible in-thread; no thumbnail pipeline | Plan |
| Phases | Schema → API → island | Same as S-12/S-18; Phase 1 can SQL-smoke ACL | Plan |
| Storage DELETE after archive | Own-folder DELETE requires `is_run_in_active_window`; `is_admin()` unrestricted | Archived `/teamrank` proof must not be self-wiped; create-path rollback still works after `requireActiveRun` | Plan-review F1 |
| `screenshot_path` vs `author_id` | Sibling CHECK: first path UUID = `author_id` | App always uses `authorId` as first segment; SQL enforces it | Plan-review F2 |
| `screenshot_path` vs `run_id` | Sibling CHECK: second path UUID = `run_id` | Same invariant as author bind; stop cross-run object attach | Plan-review-2 F2 |
| `createComment` 5 MiB upload | Pass `COMMENT_SCREENSHOT_MAX_BYTES` into `uploadPublicImage`, not only `assertPublicImageFile` | Clan copy would keep the 1 MiB default | Plan-review-2 F1 |
| `createComment` signed URL | Mint via `createSignedObjectUrl` after INSERT; null on mint failure | JSON/2.4 already require it; island would otherwise show no image until reload | Plan-review F3 |
| Body max with screenshot | Keep `COMMENT_BODY_MAX` `CommentError` whenever `trimmed.length > 0` | Otherwise PostgREST maps oversize text+screenshot to a generic error | Plan-review F4 |
| Admin run-delete Storage | Out of scope; accept orphans | Cascade deletes comments not objects; do not expand to `deleteRunAsAdmin` | Plan-review F5 |

## Scope

**In scope:** private `comment-screenshots` bucket + RLS (own-folder DELETE gated by active window); `screenshot_path` + author_id CHECK + run_id CHECK; parameterized storage helper; multipart create; signed URLs on list and create; admin-delete cleanup; compose file input; inline images; AGENTS.md note.

**Out of scope:** ACL widen; public clan bucket reuse; paste/drop; lightbox/thumbnails; moderation queue; GIF/video; author edit; S-23 verify/points; Vitest; service role; admin run-delete prefix-purge of screenshot objects.

## Architecture / Approach

Cookie SSR + form POST. Upload `{authorId}/{runId}/{commentId}.ext` then INSERT (rollback `removeObject` while the run is still in the active window). Storage SELECT mirrors comment readers via `run_id` in the path. Own-folder DELETE also requires `is_run_in_active_window`; after archive only admin can remove objects. `listCommentsForRun` / create JSON mint 1-hour signed URLs; the island never uses `getPublicUrl`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + private bucket | Column, CHECKs (path regex + author_id + run_id), bucket, storage RLS, types | Accidental public SELECT, uuid-cast 500s, or author self-wipe after archive |
| 2. Helper + multipart POST | 5 MiB upload, signed URLs, admin remove | 1 MiB clan assert left in place; empty-body mismatch |
| 3. Island + AGENTS.md | File input + inline img | Guest seeing a public image URL |

**Prerequisites:** Shipped run comments (S-12) and clan storage helper (S-18); local Supabase Storage for `db reset`.
**Estimated effort:** ~3 implement sessions (one phase each).

## Open Risks & Assumptions

- Signed URLs are shareable for up to 1 hour — accepted residual vs a Worker proxy.
- Malformed storage object names must fail closed via `comment_screenshot_object_run_id`, not throw.
- Production schema lands on the next `v*` tag, not merge to `main`.
- NSFW/size abuse beyond 5 MiB MIME/size caps is accepted (PRD).
- Last-second active-window close between failed INSERT and rollback DELETE may leave an orphan object (same class as admin run-delete orphans).
- Admin run-delete does not prefix-purge `comment-screenshots`; orphans accepted (not an ACL widen).

## Success Criteria (Summary)

- Confirmed participant attaches a screenshot (including screenshot-only) on an active run; readers see it inline.
- Guests and pending applicants cannot post or read comments or fetch the bytes via a public URL.
- After archive, authors cannot wipe screenshot objects; clan picture 1 MiB public bucket behavior is unchanged.
