---
project: book-your-miggets
researched_at: 2026-07-22
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR) + React 19 islands
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare ^13.5.0 + wrangler ^4.90.0
interview:
  persistent_connections: unknown
  cost_vs_dx: roughly_equal
  familiarity: AWS (partial)
  geography: single_region
  managed_services: external_ok
---

## Recommendation

**Deploy on Cloudflare Workers.**

The repo is already wired for this path: `output: "server"`, `@astrojs/cloudflare`, `wrangler.jsonc` with `nodejs_compat`, and `npx wrangler deploy` as the production path. At MVP traffic (10k–100k monthly requests) the Workers Free plan covers request volume (~100k/day), with a clear $5/mo Paid upgrade if CPU limits or Cron/Queues headroom matter. External Supabase stays the data/auth layer (interview: co-location not required). Single-region users do not need multi-region complexity; Workers still give simple global CDN for static assets at no extra ops cost.

> Note: `tech-stack.md` hints `deployment_target: cloudflare-pages`, but current `@astrojs/cloudflare` (Astro 6) **no longer supports Cloudflare Pages** as a deploy target. Use **Workers**, not Pages.

## Platform Comparison

Scored against agent-friendly criteria (CLI-first, managed/serverless, agent-readable docs, stable deploy API, MCP/integration). Hard filters: none applied (persistent-process need was unknown; TypeScript/Astro supported on all six with the right adapter). Soft weights: cost ≈ DX; single region; external providers OK; AWS familiarity noted but AWS is out of the MVP candidate pool.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | **5/5** |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP public beta) | **4.5/5** |
| Netlify | Partial (rollback mainly UI/API) | Pass | Pass (`llms.txt`) | Pass | Pass (MCP GA) | **4.5/5** |
| Railway | Partial (rollback dashboard) | Pass | Pass | Pass | Pass (MCP available) | **4/5** |
| Fly.io | Pass | Pass | Pass | Pass | Partial (MCP experimental) | **4/5** |
| Render | Partial (rollback mainly UI/API) | Pass | Pass | Pass | Pass (MCP GA) | **3.5–4/5** |

**Cloudflare Workers** — Best stack fit and lowest friction: already configured; Free tier sufficient for MVP request volume; `wrangler deploy` / `rollback` / `tail`; docs via `llms.txt` and MDX on GitHub; Cron Triggers, Queues, R2, D1 GA if needed later. Workers are request-scoped (no always-on OS process); WebSockets via Durable Objects (GA). Python Workers are beta (irrelevant here).

**Vercel** — Excellent Git preview DX and Astro support via `@astrojs/vercel` → Node Functions. Hobby is non-commercial; production/commercial typically Pro ~$20/seat. No always-on process; WebSockets and Queues are **public beta** (checked 2026-07-22). Would require swapping off the Cloudflare adapter.

**Netlify** — Strong JAMstack + official MCP (GA). Credit-based billing (Free 300 credits/mo). Astro via `@astrojs/netlify`. No persistent processes/WebSockets. Rollback is restore-via-UI/API rather than a first-class CLI command. Adapter swap required.

**Railway** — Always-on Node + WebSockets (GA); Hobby ~$5+ usage floor. Co-located DB templates exist but unmanaged; user preferred external providers. Rollback dashboard-only. Would need `@astrojs/node`.

**Fly.io** — Full Machines, WebSockets yes; no permanent free tier (short trial only); ~$2–6/mo for a small always-on app. Managed Postgres is region-limited and relatively expensive. Adapter/Dockerfile change required.

**Render** — Free web services with 15-minute spin-down (cold starts); Starter ~$7 for always-on. Astro SSR via `@astrojs/node` + `HOST=0.0.0.0`. Cron and background workers GA. Free Postgres expires after 30 days. Weaker fit than Cloudflare given current adapter lock-in.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Wins on stack alignment (zero adapter migration), agent-operable CLI, agent-readable docs, and MVP cost. Interview answers (external Supabase OK, single region, no strong cost/DX preference) do not pull away from this default. Background archival (FR-013) maps to Cron Triggers, Queues, or derived status at read time — not a reason to abandon Workers for a container PaaS at MVP.

#### 2. Vercel

Strongest alternative if preview-deploy UX and commercial polish outweigh a $20/seat floor and an adapter migration. MCP and WebSockets remain beta signals in the risk sense. Prefer if Cloudflare CPU/runtime constraints block a must-have library.

#### 3. Netlify

Credible third option with GA MCP and Astro adapter. Credit economics and lack of long-lived connections make it weaker than Vercel for an uncertain “might need workers later” path, and weaker than Cloudflare for this repo as-is.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **CPU time limits** — Free plan caps ~10 ms CPU per invocation; Paid raises limits substantially ($5/mo). Heavy SSR + CPU-bound work can fail even when DB wait time is fine.
2. **No always-on OS process** — Unlike AWS EC2 / Fly Machines, Workers do not keep a long-lived Node process. Timed archival needs Cron Triggers, Queues, or read-time derived status.
3. **workerd ≠ full Node** — `nodejs_compat` helps, but some Node-native packages fail only on Workers. Local fidelity is good in Astro 6, but not identical to AWS Lambda/EC2 habits.
4. **Secrets do not roll back with code** — `wrangler rollback` restores a prior Worker version; current secret values remain. Mismatched `SUPABASE_KEY` after rollback can break auth.
5. **Pages vs Workers confusion** — Older docs and the tech-stack hint say Pages; shipping to Pages against current `@astrojs/cloudflare` is a dead end.

### Pre-Mortem — How This Could Fail

The team shipped Astro SSR on Cloudflare because the starter did. Early traffic stayed free. KoG traffic plus bots pushed SSR invocations toward Free daily limits or CPU ceilings without alerts or a Paid plan. Run archival never got a Cron Trigger, so “active vs archived” drifted. A Node library familiar from AWS was added; it worked in mistaken mental models of Node-on-server and failed on workerd. CI rotated secrets; a code rollback did not restore the old key. Six months later a migration to Railway/Vercel looked like “Cloudflare failed,” when the failure modes were unmonitored limits, unfinished background jobs, and assuming Workers behave like EC2.

### Unknown Unknowns

- Astro 6 + `@astrojs/cloudflare` v13+: `astro dev` / `astro preview` already use the Cloudflare Vite plugin and **workerd** — do not treat legacy `wrangler pages dev` as the daily loop.
- Adapter **dropped Cloudflare Pages** support — deploy target is **Workers** (`wrangler deploy` after `astro build`).
- Project pins `@astrojs/cloudflare` ^13.5.0 while newer public docs may describe v14 APIs — verify commands against the locked version before copying blog snippets.
- Supabase remains external — two operational surfaces (Workers secrets + Supabase project).
- AWS experience does not map 1:1 (no VPC/security groups); model is functions + bindings (KV/R2/Cron/Queues).

## Operational Story

- **Preview deploys**: Connect the GitHub repo to Cloudflare Workers Builds (or keep GitHub Actions that run `astro build` + `wrangler deploy` to a non-prod Worker name / environment). Branch/PR previews depend on how Builds/CI is wired — protect preview URLs if they expose real Supabase data (e.g. separate Supabase project or Cloudflare Access). Fork PRs should not receive production secrets.
- **Secrets**: Production: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (account-scoped; not readable back as plaintext via CLI). Local: `.dev.vars` (gitignored). CI: Cloudflare API token + GitHub Actions secrets for non-interactive deploys. Rotation: put new secret values, verify login, revoke old Supabase keys in the Supabase dashboard.
- **Rollback**: `npx wrangler rollback` (or `npx wrangler rollback <VERSION_ID>`) — promotes one of the last ~100 Worker versions to 100% traffic within seconds. **Does not** roll back secret values or Supabase schema migrations.
- **Approval**: Human required for production secret rotation, custom domain/DNS, billing plan changes (Free → Paid), and destructive Supabase changes. Agent may run lint/build, `wrangler deploy` to a designated environment when a CI token exists, and read-only log tailing.
- **Logs**: `npx wrangler tail` (optionally `--status error`). Dashboard Workers Observability when enabled in `wrangler.jsonc`. Prefer read-only tail during incidents; pair with Supabase logs for auth/DB failures.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-plan CPU (10 ms) or daily request ceiling causes intermittent failures | Devil's advocate / Pre-mortem | M | H | Monitor invocation errors; upgrade to Workers Paid ($5/mo) before launch traffic; keep SSR work lean |
| Background archival never implemented → stale “active” runs | Pre-mortem / Research (no always-on process) | M | M | Prefer derived archive status at read time for MVP; add Cron Trigger only if required |
| Node package incompatible with workerd | Devil's advocate / Unknown unknowns | M | M | Validate with `astro dev` / `astro preview` on workerd; avoid native Node addons; use `nodejs_compat` (already set) |
| Rollback leaves newer secrets → auth outage | Devil's advocate | L | H | Document secret+code coupling; after rollback, verify Supabase auth; avoid rotating secrets in the same change as risky deploys |
| Accidental Pages-targeted tutorials / CI | Unknown unknowns / Research | M | M | Standardize on Workers + `wrangler deploy`; update AGENTS/tech-stack language away from Pages |
| Dual-vendor ops (Cloudflare + Supabase) confuse beginners | Unknown unknowns | M | L | One checklist: wrangler secrets ↔ Supabase URL/key; separate staging Supabase project when possible |
| Doc lag (entrypoint paths, Astro 6 “beta” notes in older CF guides) | Research finding | M | L | Prefer locked package versions + Astro adapter docs over third-party copy-paste |

## Getting Started

Commands match this repo’s pinned stack (Astro ^6.3.1, `@astrojs/cloudflare` ^13.5.0, wrangler ^4.90.0, Node 22.14.0 per `.nvmrc`):

1. **Use the existing Node version** — `nvm use` (or install Node `22.14.0`). Dependencies already include the Cloudflare adapter and wrangler.
2. **Local secrets** — copy `.env.example` patterns into gitignored `.dev.vars` with `SUPABASE_URL` and `SUPABASE_KEY` for `astro dev` (workerd-backed in Astro 6 — no separate Pages-oriented wrangler loop required for day-to-day UI work).
3. **Build & deploy** — `npm run build` then `npx wrangler deploy`. First-time: `npx wrangler login`. Confirm `wrangler.jsonc` `main` stays `@astrojs/cloudflare/entrypoints/server`.
4. **Production secrets** — `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (do not commit secrets).
5. **Verify ops loop** — hit the Worker URL; on failure run `npx wrangler tail --status error`; to undo a bad release run `npx wrangler rollback`.

Optional later: Cloudflare Cron Trigger or derived archival for FR-013; Workers Paid if Free CPU/request limits bind.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (beyond noting GitHub Actions / Workers Builds as options)
- Production-scale architecture (multi-region HA, DR, dedicated SLAs)
