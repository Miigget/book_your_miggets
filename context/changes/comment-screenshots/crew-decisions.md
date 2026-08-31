---
change_id: comment-screenshots
mode: YOLO
started: 2026-08-31
updated: 2026-08-31
status: in-progress
---

# Crew decisions — comment-screenshots

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-31 | 10x-new | created change.md (status new) |
| 2026-08-31 | 10x-plan | DECISION_REQUEST complexity-round-1 |
| 2026-08-31 | 10x-plan | DECISION_REQUEST round-2 |
| 2026-08-31 | 10x-plan | DECISION_REQUEST phases |
| 2026-08-31 | 10x-plan | plan.md + plan-brief.md written; status planned |
| 2026-08-31 | 10x-plan-review | verdict REVISE — 0 CRITICAL, 3 WARNING, 2 OBSERVATION |
| 2026-08-31 | 10x-plan | REVISE pass applied F1–F5 into plan.md |
| 2026-08-31 | 10x-plan-review | re-review #2 verdict SOUND (1 WARNING, 1 OBSERVATION leftovers applied by Crew Lead) |
| 2026-08-31 | 10x-implement p1 | schema/bucket/RLS; cherry-picked to feature/comment-screenshots as 8273109 (originally 77e5541 on clan-runs); YOLO skipped Studio 1.6 |
| 2026-08-31 | 10x-impl-review p1 | APPROVED (0C 0W 1 OBS: table-level UPDATE grant is pre-existing RLS-only append-only) |
| 2026-08-31 | 10x-implement p2 | DECISION_REQUEST branch mismatch → worktree /tmp/bym-s20 |
| 2026-08-31 | 10x-implement p2 | helper+multipart POST; commit a9f04d2; YOLO skipped curl 2.4–2.9 |

## Decisions the Crew Lead made (no human)

### Critical
- **q-visibility** — How screenshot bytes are reachable. Chose **B: private `comment-screenshots` bucket + `createSignedUrl` after comment ACL**. Why: public URLs would leak restricted-run `/teamrank` proof; a Worker proxy is heavier than needed on this stack.
- **q-cardinality** — Screenshots vs `run_comments`. Chose **A: one nullable `screenshot_path` (max 1 image per comment)**. Why: attaches to existing comments, keeps append-only, enough for `/teamrank` + finish-line as two comments; a child table looks like a second entity.
- **phase-commit-p1** — Ritual phase-end commit. Chose **COMMIT_OK** (YOLO). Why: user chose YOLO for the full loop; never push.
- **q-branch** — Phase 2 workspace was `feature/clan-runs`. Chose **A: worktree `/tmp/bym-s20` on `feature/comment-screenshots`**. Why: isolates S-20 from clan-runs/manual-archive; do not repeat the Phase 1 landing-on-wrong-branch mistake.

### Non-obvious
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the research signal is weak; S-20 is a known slice on shipped comments; `/10x-plan` maps the surface.
- **intent-from-roadmap** — New folder had no freeform intent. Chose **seed Notes from S-20 roadmap outcome** instead of only humanizing the slug. Why: change-id is the roadmap Change ID; empty-intent humanize would drop FR-001/FR-027/ACL-must-not-widen and the S-23 proof path.
- **q-complexity** — Plan complexity. Chose **B: MEDIUM**. Why: new private bucket + comment CHECK + multipart on existing POST, but comment surface and Storage helper already exist; HIGH over-asks signed-URL TTL/thumbnails.
- **q-size** — Per-file cap. Chose **B: 5 MiB** (overrode ⭐ 1 MiB). Why: FR-001 is in-game screenshots; 1080p PNG often exceeds 1 MiB; 5 MiB is still tiny vs the 100 MB Worker body limit; keep jpeg/png/webp.
- **q-signed-ttl** — Signed URL expiry. Chose **A: 1 hour**. Why: documented private-bucket default; long-open run tabs still work; leak window stays bounded vs 24h.
- **q-composer** — How to attach. Chose **A: file input on the existing compose form**. Why: same POST as S-18; paste/drop is extra island surface this slice does not need.
- **q-thread-display** — How the image shows. Chose **A: inline `<img>` under the body**. Why: `/teamrank` proof must be visible in-thread without a click; no thumbnail pipeline.
- **q-phases** — Phase breakdown. Chose **A: 3 phases (schema/bucket → service+API → island)**. Why: same split as S-12/S-18; Phase 1 can prove ACL SQL before UI.
- **plan-review-F1** — Storage DELETE after archive. Chose **Fix A ⭐: own-folder DELETE also requires `is_run_in_active_window`; admin DELETE unrestricted**. Why: archived `/teamrank` proof must not be self-wiped; create-path rollback still works after `requireActiveRun`.
- **plan-review-F2** — Bind `screenshot_path` first UUID to `author_id`. Chose **apply CHECK**. Why: app always uses `authorId` as first segment; SQL should enforce it so nobody attaches another author's object as their comment.
- **plan-review-F3** — `createComment` mint `screenshotUrl`. Chose **mint after INSERT (null on mint failure)**. Why: JSON contract and 2.4 already require it; island would otherwise show no image until reload.
- **plan-review-F4** — 1000-char `CommentError` on rewrite. Chose **keep existing `COMMENT_BODY_MAX` check whenever trimmed body length > 0**. Why: otherwise PostgREST maps to generic “Could not post comment”.
- **plan-review-F5** — Admin run-delete orphans objects. Chose **document as out of scope** (do not expand to `deleteRunAsAdmin`). Why: cascade deletes comments not Storage; MVP volume is small; not an ACL widen.

### Obvious
- kebab-case id `comment-screenshots` unique; 1:1 GitHub link (equals roadmap Change ID S-20); next skill `/10x-plan`.
- **parent-link** — change-id is a roadmap Change ID (`S-20`). Chose **1:1 link existing S-20 card**, no `--parent`. Why: gh-change-sync hybrid rule; ignore parent for 1:1.
- **plan-review-2-F1** — `createComment` must pass 5 MiB into `uploadPublicImage`. Chose **apply** (one-line plan edit). Why: clan write order would keep the 1 MiB default after parameterization.
- **impl-review-p1-F1** — authenticated table-level UPDATE on `run_comments`. Chose **leave it** (pre-existing S-12 default grants; append-only is RLS). Why: not a Phase 1 regression; do not expand this slice to revoke UPDATE.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 Studio (1.6): skipped (YOLO residual risk). SQL smoke 1.3 verified private 5 MiB jpeg/png/webp bucket and `screenshot_path`.
- Phase 2 curl (2.4–2.9): skipped (YOLO residual risk). Lint/build 2.1–2.3 passed.

## Stop / escape hatches

- none

## GitHub

- change-sync: #84 events new → Backlog; planned → Backlog; plan_reviewed → Backlog; implementing → In progress
