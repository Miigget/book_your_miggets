---
change_id: edit-run
mode: YOLO
started: 2026-08-20
updated: 2026-08-20
status: complete
---

# Crew decisions — edit-run

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-20 | 10x-new | created change.md (title: Organizer edits an active run they created) |
| 2026-08-20 | gh-change-sync | --event new → issue #46 Backlog (link-roadmap S-13) |
| 2026-08-20 | 10x-plan | complexity round — Crew Lead chose MEDIUM |
| 2026-08-20 | 10x-plan | round-1 design — join-lock B, starts-at B, capacity-pending A, ux-entry A |
| 2026-08-20 | 10x-plan | round-2 design — rls C, edit-access A, field-locks A, join-ui A |
| 2026-08-20 | 10x-plan | plan.md + plan-brief.md written; status planned; 3 phases |
| 2026-08-20 | gh-change-sync | --event planned → #46 Backlog |
| 2026-08-20 | 10x-plan-review | SOUND (0 critical, 0 warnings, 2 LOW observations) |
| 2026-08-20 | gh-change-sync | --event plan_reviewed → #46 Backlog |
| 2026-08-20 | 10x-implement p1 | migration + trigger; commit 8056c74 on feature/edit-run |
| 2026-08-20 | gh-change-sync | --event implementing → #46 In progress |
| 2026-08-20 | 10x-impl-review p1 | APPROVED (0 findings) |
| 2026-08-20 | 10x-implement p2 | RunError + updateRun + POST; commit fb2fcdb |
| 2026-08-20 | 10x-impl-review p2 | APPROVED (1 LOW: capacity floor only when cap changes) |
| 2026-08-20 | 10x-implement p3 | edit page + form + links; commits 02c9115 + 8581eae; status implemented |
| 2026-08-20 | gh-change-sync | --event implemented → #46 In review |
| 2026-08-20 | 10x-impl-review p3 | APPROVED (0 findings) |
| 2026-08-20 | 10x-impl-review full | APPROVED (0 findings); change.md impl_reviewed |
| 2026-08-20 | docs commit | reviews + crew-decisions + impl_reviewed stamp (pre-archive) |

## Decisions the Crew Lead made (no human)

### Critical

- **q-join-lock** — When is `join_mode` locked? Chose **B: lock after any non-organizer row (pending, confirmed, or denied)**. Why: organizer auto-seat would make a literal “first confirmation” lock mode at create; locking after anyone else applies blocks the approval→auto_join pending desync without freezing an empty run.
- **q-starts-at** — Valid `starts_at` on edit. Chose **B: result must remain active (upcoming or still in grace)**. Why: US-06 includes in-progress grace, so create’s future-only rule would freeze the clock; allowing archive-via-clock (C) contradicts archived-immutable.
- **q-rls** — Where do edit invariants live? Chose **C: app + RLS active-window + BEFORE UPDATE trigger (join_mode lock + capacity floor)**. Why: `runs_update_own` currently lets a JWT PATCH archived runs and locked fields; same defense style as `auto_join_run`.
- **q-edit-access** — Who can open `/runs/[id]/edit`? Chose **A: sign-in for guests; 404 for non-owner, admin-as-editor, and archived (including owner)**. Why: US-06 is the creating organizer only; admin already deletes; do not advertise ownership via a distinct error.

### Non-obvious

- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the research signal is weak; this is a named roadmap slice (S-13 / FR-021) with PRD + candidate field-lock defaults, and `/10x-plan` nested exploration is enough.
- **gh-parent** — Parent-link for GitHub. Chose **1:1 roadmap link, no `--parent`**. Why: change-id `edit-run` equals roadmap Change ID S-13 (obvious per taxonomy).
- **q-complexity** — Plan complexity. Chose **B MEDIUM**. Why: new mutation surface on known create/participant patterns, with real field-lock and capacity-vs-roster rules; LOW would skip the RLS UPDATE hole; HIGH over-scopes a field-lock slice.
- **q-capacity-pending** — Leftover pending when cap shrinks. Chose **A: floor is confirmed count only; leftover pending stay**. Why: matches S-02 Accept soft overfill and avoids the application-migration the roadmap forbade.
- **q-ux-entry** — Where does the organizer edit? Chose **A: dedicated `/runs/[id]/edit` plus Edit on detail and dashboard active cards**. Why: reuses CreateRunForm shell, keeps guest detail mutation-free, isolates `?error=` from participant actions.
- **q-field-locks** — Remaining mutability while active. Chose **A: title, map (including clear), min_points always editable**. Why: PRD candidate minus S-14/S-15; min_points is display/filter only so freezing it does not protect the roster.
- **q-join-ui** — Locked join_mode on the form. Chose **A: disabled select + helper text; POST omits or ignores join_mode**. Why: same layout as create; trigger is the backstop against a crafted POST.
- **p1-capacity-when** — Trigger capacity check on every UPDATE vs only when `max_participants` changes. Chose **only when capacity actually changes**. Why: S-02 Accept can soft-overfill; a title/map save must not raise `capacity_below_confirmed` on an already-overfilled run.
- **archive-anyway** — Archive despite YOLO-skipped in-browser manuals. Chose **continue archiving**. Why: automated criteria passed; manuals were curl/SQL-verified; remaining risk is visual hydration only.

### Obvious (optional, keep short)

- change-id `edit-run` accepted as-is (kebab-case, unique, matches S-13).
- Next stage `/10x-plan` (no bug+fix / unclear-scope frame signal).
- Plan-review SOUND → implement Phase 1 (no re-plan).
- F1/F2 LOW observations → apply during implement (datetime-local prefill; WITH CHECK error copy), not a plan rewrite.
- Impl-review p2 F1 → apply in Phase 3: reject capacity only when posted max_participants is distinct from stored and below confirmed (align with trigger `p1-capacity-when`).
- YOLO ritual commits: COMMIT_OK for p1/p2/p3 and archive; never push.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 2 manuals 2.3–2.7: skipped browser click-through (YOLO); specialist verified via curl against local `npm run dev`. Residual risk: CSRF/cookie/Origin edge cases a browser would show.
- Phase 3 manuals 3.4–3.10: skipped in-browser visual (YOLO); specialist verified via curl/HTTP on local astro dev :4323. Residual risk: datetime-local hydration, disabled-select styling, real cookie session.

## Stop / escape hatches

- none

## GitHub

- change-sync: #46 events new → planned → plan_reviewed (Backlog), implementing (In progress), implemented (In review); link-roadmap S-13
