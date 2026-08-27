---
change_id: create-clan-directory
mode: YOLO
started: 2026-08-27
updated: 2026-08-27
status: complete
---

# Crew decisions — create-clan-directory

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-27T14:37 | routing | Next slice = S-18 `create-clan-directory` (F-02 archived; north star unblocked) |
| 2026-08-27T14:38 | 10x-new | created change.md (status: new) |
| 2026-08-27T14:40 | gh-change-sync | #82 Backlog (new, link-roadmap) |
| 2026-08-27T14:42 | 10x-research | wrote research.md; next = plan |
| 2026-08-27T14:50 | 10x-plan | plan.md + plan-brief.md; status planned |
| 2026-08-27T15:00 | 10x-plan-review | SOUND; F1–F3 ⭐ applied; status plan_reviewed |
| 2026-08-27T15:20 | 10x-implement p1 | storage + picture_path; commit 456f414 |
| 2026-08-27T15:30 | 10x-impl-review p1 | APPROVED 0 findings |
| 2026-08-27T15:50 | 10x-implement p2 | create path; commit 67cd0b6 |
| 2026-08-27T16:05 | 10x-impl-review p2 | APPROVED 0 findings |
| 2026-08-27T16:20 | 10x-implement p3 | public directory; commit 7eb291b |
| 2026-08-27T16:30 | 10x-impl-review p3 | APPROVED 0 findings |
| 2026-08-27T16:40 | 10x-impl-review full | APPROVED 0 findings; status impl_reviewed |

## Decisions the Crew Lead made (no human)

### Critical
- **storage** — Picture backend. Chose **Supabase Storage public bucket (B)**. Why: reuses SUPABASE_URL/KEY and config.toml; S-20 can share the helper; R2 would split files away from Postgres/Auth with no existing binding.
- **phase-1-commit** — Ritual phase-end commit. Chose **COMMIT_OK (456f414)**. Why: YOLO authorizes phase-end commits; never push.
- **phase-2-commit** — Ritual phase-end commit. Chose **COMMIT_OK (67cd0b6)**. Why: same YOLO ritual.
- **phase-3-commit** — Ritual phase-end commit. Chose **COMMIT_OK (7eb291b)**. Why: same YOLO ritual.
- **archive-anyway** — Archive despite open manual Progress rows. Chose **continue archiving**. Why: YOLO auto-archive when only human-action boxes remain; automated 1.1–1.5, 2.1–2.3, 3.1–3.3 passed and full impl-review is APPROVED.

### Non-obvious
- **next-slice** — Which roadmap item to run. Chose **S-18 / create-clan-directory**. Why: F-02 is done; S-18 is the north star and first unblocked Stream A slice.
- **research-vs-plan** — Whether to map the codebase before planning. Chose **hire /10x-research**. Why: new public clan surface plus picture upload and F-02 RLS is a clear codebase-map signal, not a weak one.
- **complexity** — Plan complexity. Chose **MEDIUM (B)**. Why: first upload + public list/detail/create is more than a form field, but F-02 and directory patterns already exist; HIGH would pad F-02 constraints.
- **picture-required** — Picture required on create? Chose **optional/nullable (B)**. Why: name+tag still create if upload is skipped or Storage is down; matches optional map on create-run.
- **already-member** — Second-clan UX. Chose **hide Create; `/clans/new` explains and links (A)**. Why: membership PK would doom the form; explain before submit.
- **unverified-cta** — Create CTA states. Chose **guest sign-in / unverified verify-copy / verified Create (B)**. Why: do not copy public-run create; friends-style gate so RLS is backstop not UX.
- **nav** — Where Clans links live. Chose **Topbar Clans + Footer Browse Clans + Welcome (B)**. Why: guests find the directory like `/runs` without a global New clan that skips the verified/already-member gate.
- **phases** — Plan phase breakdown. Chose **3 phases: storage/schema, create write-path, public list/detail/nav (A)**. Why: independently verifiable; Phase 1 can SQL-smoke before UI.

### Obvious
- Mode YOLO from „bez potwierdzania”.
- Skip `--parent` on gh-change-sync: change-id equals roadmap Change ID S-18.
- Plan-review F1/F2/F3: apply ⭐ plan edits (23505 via message/details, fixed picture MIME copy, locked-nickname string).
- YOLO ritual commits at phase-end and archive (COMMIT_OK).

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1.6 Studio visual: skipped (YOLO residual risk — confirm `picture_path` nullable and `clan-pictures` 1 MiB jpeg/png/webp in local Studio)
- Phase 2.4–2.10 create UX: skipped (YOLO residual — guest redirect, unverified copy, already-member, create with/without picture, duplicate tag, MIME/size)
- Phase 3.4–3.9 guest directory/detail/404, unverified CTA, create→detail, restricted-run leak: skipped (YOLO residual)

## Stop / escape hatches

- none

## GitHub

- change-sync: #82 events new, planned, plan_reviewed, implementing, implemented (In review)
