---
bootstrapped_at: 2026-07-20T10:59:12Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: book-your-miggets
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: book-your-miggets
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
```

## Why this stack

Book Your Miggets is a medium-scale web app with a 3-week after-hours MVP and
email/password auth as a must-have. The standard path recommended default for
`(web, js)` is Astro + Supabase + Cloudflare: auth and Postgres out of the box,
TypeScript-first, and a short path to first deploy on Cloudflare Pages. CI is
GitHub Actions with auto-deploy on merge. Timed run archival (FR-013) is in
scope but not first-class on this starter — it will be added manually via cron
or derived status at read time. Scaffolding confidence is first-class: expect
mostly-smooth bootstrap with occasional manual steps.

## Pre-scaffold verification

| Signal             | Value                                              | Severity | Notes                                      |
| ------------------ | -------------------------------------------------- | -------- | ------------------------------------------ |
| npm package        | not run                                            | —        | cmd_template starts with `git clone`       |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-05-17T10:33:39Z | fresh    | from card.docs_url                         |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 31456
**Conflicts (.scaffold siblings)**: README.md
**`.gitignore` handling**: moved silently
**`.bootstrap-scaffold` cleanup**: deleted
**Notes**: Cloned `.git/` deleted before move-up so upstream history did not leak. cwd `context/` preserved (no scaffold `context/` present). Existing cwd `README.md` kept; starter copy sidelined as `README.md.scaffold`.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 6 HIGH, 9 MODERATE, 2 LOW
**Direct vs transitive**: 0/1/2/0 direct of total 0/6/9/2 (CRITICAL/HIGH/MODERATE/LOW)
**Dependency totals**: prod 449, dev 316, optional 131, total 895

#### CRITICAL findings

None.

#### HIGH findings

- **astro** (direct) — range `<=7.0.0-beta.6`. Via: Reflected XSS via unescaped slot name; Host header SSRF in prerendered error page fetch; XSS via Unescaped Attribute Names in Spread Props. Fix available. https://github.com/advisories/GHSA-8hv8-536x-4wqp
- **devalue** (transitive) — range `5.6.3 - 5.8.0`. Via: Svelte devalue DoS via sparse array deserialization. Fix available. https://github.com/advisories/GHSA-77vg-94rm-hx3p
- **miniflare** (transitive) — via undici, ws. Effects: `@cloudflare/vite-plugin`, `wrangler`. Fix available.
- **undici** (transitive) — range `7.0.0 - 7.27.2`. Via: TLS cert validation bypass; HTTP header injection; WebSocket DoS. Effects: `miniflare`. Fix available. https://github.com/advisories/GHSA-vmh5-mc38-953g
- **vite** (transitive) — range `7.0.0 - 7.3.3`. Via: launch-editor NTLMv2 hash disclosure; `server.fs.deny` bypass on Windows. Fix available. https://github.com/advisories/GHSA-v6wh-96g9-6wx3
- **ws** (transitive) — range `8.0.0 - 8.20.1`. Via: Uninitialized memory disclosure; Memory exhaustion DoS. Effects: `@cloudflare/vite-plugin`, `miniflare`. Fix available. https://github.com/advisories/GHSA-58qx-3vcg-4xpx

#### MODERATE findings

- **@astrojs/language-server** (transitive) — via `volar-service-yaml`. Fix available.
- **@cloudflare/vite-plugin** (transitive) — via miniflare, wrangler, ws. Fix available.
- **js-yaml** (transitive) — Quadratic-complexity DoS in merge key handling. Fix available. https://github.com/advisories/GHSA-h67p-54hq-rp68
- **supabase** (direct) — via `tar`. Fix available.
- **tar** (transitive) — PAX size override / file smuggling. Effects: `supabase`. Fix available. https://github.com/advisories/GHSA-vmf3-w455-68vh
- **volar-service-yaml** (transitive) — via `yaml-language-server`. Effects: `@astrojs/language-server`. Fix available.
- **wrangler** (direct) — via esbuild, miniflare. Effects: `@cloudflare/vite-plugin`. Fix available.
- **yaml** (transitive) — Stack Overflow via deeply nested collections. Effects: `yaml-language-server`. Fix available. https://github.com/advisories/GHSA-48c2-rrv3-qjmp
- **yaml-language-server** (transitive) — via `yaml`. Effects: `volar-service-yaml`. Fix available.

#### LOW / INFO findings

- **@babel/core** (transitive) — Arbitrary File Read via sourceMappingURL Comment. Fix available. https://github.com/advisories/GHSA-4x5r-pxfx-6jf8
- **esbuild** (transitive) — Arbitrary file read when running the development server on Windows. Effects: `astro`, `wrangler`. Fix available. https://github.com/advisories/GHSA-g7r4-m6w7-qqqr

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | false                              |
| has_background_jobs        | true                               |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
