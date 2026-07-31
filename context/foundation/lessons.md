# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Always use the repo’s actual default branch name

- **Context**: CI/CD, docs, everything related to documentation and plans
- **Problem**: The agent starts from wrong assumptions, which can raise cost per prompt or lengthen future work.
- **Rule**: Always use the default branch name that matches the repo (`main` / the actual default); never assume `master` out of habit.
- **Applies to**: all

## Update stale documentation as soon as it is detected

- **Context**: Project docs, plans, and anything under `context/`
- **Problem**: Leaving known-outdated docs in place forces later agents to rediscover the same mismatch, wasting tokens and time and spreading wrong defaults.
- **Rule**: When documentation is found to be outdated, update the source of truth in the same turn instead of only noting the discrepancy.
- **Applies to**: all

## Link local URLs and start servers at the manual-verification gate

- **Context**: When `/10x-implement` (or any similar flow) reaches the manual-verification gate
- **Problem**: The developer has to find local URLs and restart servers/Docker by hand before they can verify, which wastes time and slows the feedback loop.
- **Rule**: At the manual-verification gate, include clickable links to the local site and any other URLs or tools needed for the checks, and make sure the local app server and Docker services (e.g. Supabase) are already running (restart them if needed) so verification can start immediately.
- **Applies to**: implement, and any other skill or step that asks the user to perform manual verification

## Do not echo raw infrastructure errors into user-facing redirects

- **Context**: `src/pages/api/runs/[id]/apply.ts` (and withdraw / leave-team / decide); `?error=` + `ServerError`
- **Problem**: Non-`ParticipantError` paths put raw `err.message` (often PostgREST/DB text) into `?error=` and render it to the user. Same habit as create-run, now on more mutation surfaces — information leakage and ugly UX.
- **Rule**: 
- **Applies to**: 
