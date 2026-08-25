<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Player labels Implementation Plan

- **Plan**: context/changes/player-labels/plan.md
- **Mode**: Deep
- **Date**: 2026-08-25
- **Verdict**: SOUND
- **Findings**: 0 critical 1 warnings 1 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 12/12 paths ✓ (all modify targets exist; new paths clearly marked), 7/7 symbols ✓ (`AdminError`, `isUuid`, `getPublicProfile`, `getProfileForAdmin`, `PROTECTED_ROUTES`, `is_admin()`, `db:types`), brief↔plan ✓ (locked Crew decisions match phases/scope). Progress↔Phase: 3/3 phase names match; 0 checkboxes outside Progress; criteria counts match Progress rows (10 / 10 / 11). No `docs/reference/contract-surfaces.md` — skipped.

## Codebase verification (riskiest claims)

1. **`/api/admin/*` needs its own admin check** — Confirmed. Middleware 404s only `pathname.startsWith("/admin")`; `/api/admin/...` does not match. S-16 routes (e.g. `nickname.ts`) already check `locals.profile?.role === "admin"`.
2. **Isolated load pattern on public + admin player pages** — Confirmed. `players/[id].astro` loads friends in a separate try; `admin/users/[id].astro` isolates pending-nick and archive loads. Plan’s labels try placement fits.
3. **Delete route shape** — Confirmed analog: `api/admin/runs/[id]/delete.ts`. Plan’s `labels/[id]/delete.ts` matches repo convention.
4. **Maps SELECT + junction CASCADE** — Confirmed. Maps: anon/authenticated SELECT only. `run_comment_likes`: composite PK + `ON DELETE CASCADE`. Plan correctly extends maps-style public read with `is_admin()` writes.
5. **Replace-set residual risk** — Confirmed documented. Repo uses RPCs for invite replace atomicity; plan/brief already accept non-atomic delete-then-insert for this small admin dictionary — not escalated.

## Findings

### F1 — Migration grants omit recent revoke-then-grant hygiene

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Migration
- **Detail**: Plan contracts `GRANT SELECT` / `GRANT INSERT|UPDATE|DELETE` but does not say to `REVOKE ALL … FROM public` (and typically `anon` before re-granting SELECT) the way recent writeable tables do (`friend_requests`, `run_invites`, `nickname_change_requests`). Maps-only SELECT skipped revoke; labels are writeable for authenticated admins, so matching the newer revoke-then-grant pattern avoids relying on default privileges.
- **Fix**: In the migration contract, add `REVOKE ALL ON TABLE … FROM public` (and from `anon` before granting SELECT back) for both `player_labels` and `player_label_assignments`, then grant as already specified.
- **Decision**: ACCEPTED — Crew Lead (YOLO, obvious LOW); plan.md migration contract updated

### F2 — Public chip placement left as “pick one”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Public profile
- **Detail**: Contract says “new dl row or a short row under the header — pick one and stay consistent.” Either works; leaving the fork to implement wastes a tiny decision and risks inconsistent follow-ups.
- **Fix**: Lock “new `<dl>` row inside the existing Public profile card” (matches nickname/verification/points layout).
- **Decision**: ACCEPTED — Crew Lead (YOLO, obvious LOW); plan.md Phase 3 contract locked to dl row
