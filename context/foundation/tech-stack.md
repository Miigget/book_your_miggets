---
starter_id: 10x-astro-starter
package_manager: npm
project_name: book-your-miggets
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: deploy-on-tag
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
---

## Why this stack

Book Your Miggets is a medium-scale web app with a 3-week after-hours MVP and
email/password auth as a must-have. The standard path recommended default for
`(web, js)` is Astro + Supabase + Cloudflare: auth and Postgres out of the box,
TypeScript-first, and a short path to first deploy on Cloudflare Workers. CI is
GitHub Actions (lint/build on PR and `main`); production Deploy runs on semver
tag `v*` via `/gh-release` so GitHub Release notes exist at ship time. Timed run archival (FR-013) is in
scope but not first-class on this starter — it will be added manually via cron
or derived status at read time. Scaffolding confidence is first-class: expect
mostly-smooth bootstrap with occasional manual steps.
