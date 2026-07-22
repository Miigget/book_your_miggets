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
