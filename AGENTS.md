# Repository Guidelines

Book Your Miggets is a Team Finder / Run Scheduler for TeeWorlds gores. Stack: Astro 7 SSR (`output: "server"` in `@astro.config.mjs`), React 19 islands, Tailwind 4, Supabase auth, shadcn/ui, Cloudflare Workers. Product scope: `@context/foundation/prd.md`. Starter reference: `@README_astro_starter.md`.

## Hard Rules

- Prefer Astro for layout/static UI; use React only for interactive islands. Never add Next.js directives (`"use client"`, etc.).
- Merge Tailwind classes with `cn()` from `@/lib/utils` — do not concatenate class strings.
- API routes export uppercase `GET` / `POST` under `src/pages/api/` (see `@src/pages/api/auth/signin.ts`).
- Gate private pages via `PROTECTED_ROUTES` in `@src/middleware.ts` (currently `/dashboard`, `/runs/new`, `/admin`, `/runs/history`, `/profile`, `/clans/new`, plus `/runs/{id}/edit`). `/runs/history` redirects to `/dashboard?tab=past` (kept protected for old bookmarks). Dashboard is the signed-in hub for runs you created and runs you joined. `/players/{id}` is public — do not add it to `PROTECTED_ROUTES`. Public player profiles also show Incoming (up to 3 active organized-or-confirmed runs, soonest first, including in-progress) and Recent (up to 3 archived, latest first). Restricted runs follow existing SELECT ACL; guests see public runs via `list_player_public_runs`. Do not widen comment ACL or archived `/runs/{id}` for non-participants — screenshots attach to `run_comments` via private Storage + signed URLs; do not reuse `clan-pictures`; do not widen who can post or read. Recent cards link only when the viewer can open that archive. Organizer without a confirmed seat still opens archived `/runs/{id}` (S-08). Organizer archive is `POST /api/runs/{id}/archive`; admin archive is `POST /api/admin/runs/{id}/archive` (distinct from Delete). Organizer extend is `POST /api/runs/{id}/extend` (hours 1/2/3/6, in-progress only, one-shot). Organizer complete is `POST /api/runs/{id}/complete` (clan owner, in-progress `clan_only`, one-shot). `completed_at` is DEFINER-only — do not GRANT UPDATE on `completed_at`, `archived_at`, or `extended_until` (DEFINER RPCs only). Complete ≠ archive: does not stamp `archived_at`, does not free the 5-cap, comments stay writable until Archive. After complete, freeze join/leave/decide/kick/withdraw/edit/extend. Clan points stay frozen until S-23. Do not invent officer Complete. Do not add an admin verify queue. Audience-active ⇔ `archived_at` null and (`extended_until` null or not elapsed) — no 1-hour auto-archive. Max 5 audience-active runs per organizer. `/auth/confirm` is public (PKCE `code` / `token_hash` from Auth emails; also handled in middleware if the link lands on Site URL). `/auth/verified` is public — the post-confirm success screen; do not add it to `PROTECTED_ROUTES`. Friend mutations are `POST /api/friends/*` (`request`, `accept`, `decline`, `cancel`, `unfriend`); the pending inbox is on `/profile`, not the public player page. Clan-invite mutations are `POST /api/clans/{id}/invites` (send/reopen) and `POST /api/clans/invites/{accept,decline,cancel}`; the pending clan-invite inbox is on `/profile`, not `/clans/{id}` or `/players/{id}`. The `/admin` prefix includes `/admin/users/{id}` and `/admin/labels`; non-admins still 404. S-16 mutations (nickname, KoG points, points verified, nickname-request) live on `/admin/users/{id}` via `POST /api/admin/users/{id}/*`. S-17 label dictionary is `/admin/labels` via `POST /api/admin/labels` (create), `POST /api/admin/labels/{id}` (update), and `POST /api/admin/labels/{id}/delete`; assignment is `POST /api/admin/users/{id}/labels` — chips render on public `/players/{id}` only (not player-authored, not on `/profile` or run rosters). Admin clan edit/delete lives on public `/clans/{id}` via `POST /api/admin/clans/{id}` and `POST /api/admin/clans/{id}/delete` (points stay frozen). Do not prefix-protect `/runs` — the public list and `/runs/{id}` stay open. Do not prefix-protect `/clans` — the public list and `/clans/{id}` stay open. Owner friends picker on `/clans/{id}` is owner-only and must not load `public_friendships` for guests or non-owners. Clan members on `/clans/{id}` render from `public_profiles` (nickname only — never email).
- Restricted runs (friends-only / invite-only / clan-only) 404 like a missing run, never 403. `/runs` stays publicly routable. Signed-in `/runs` sections are Invite only vs Friends vs Clan vs Public vs admin-only Restricted; never mix friends_only/invite_only/clan_only into Public. Clan-only create is clan owner only (not officers). Do not widen comment read ACL past confirmed / archived participant / organizer / admin. Screenshots attach to `run_comments` via private Storage + signed URLs; do not reuse `clan-pictures`; do not widen who can post or read.
- Secrets are `SUPABASE_URL` and `SUPABASE_KEY` (`@.env.example`). Use `.env` for Node or `.dev.vars` for Cloudflare local — both gitignored; never commit them.
- When adding Postgres tables, place SQL in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql` and enable RLS with per-operation, per-role policies.

## Project Structure

- `src/pages/` — pages and API routes; auth screens in `src/pages/auth/`
- `src/components/` — Astro/React UI; shadcn primitives in `src/components/ui/` (style `"new-york"` in `@components.json`)
- `src/lib/` — Supabase client (`@src/lib/supabase.ts`), helpers (`utils.ts`, `config-status.ts`)
- `src/layouts/`, `src/styles/` — document shell and global CSS
- Add `src/types.ts` for shared DTOs when needed; put hooks in `src/components/hooks/` and extracted logic in `src/lib/services/`

## Commands

- `npm run dev` — local server (Cloudflare workerd)
- `npm run build` / `npm run preview` — production build and preview
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (Astro + Tailwind plugins)
- Use Node `22.14.0` (`@.nvmrc`). Pre-commit (husky + lint-staged in `@package.json`): `eslint --fix` on `*.{ts,tsx,astro}`; Prettier on `*.{json,css,md}`.

## Coding Style

- TypeScript, 2-space indent, Prettier via `@.prettierrc.json` (printWidth 120, double quotes, trailing commas).
- Path alias `@/*` → `./src/*` (`@tsconfig.json`).
- Add shadcn components with `npx shadcn@latest add <name>` into `src/components/ui/`.

## Commits & CI

- Commit style is not established yet (history is scaffold-only); prefer short imperative subjects.
- CI (`@.github/workflows/ci.yml`) runs `astro sync`, `npm run lint`, and `npm run build` on push/PR to `main`. Build requires repository secrets `SUPABASE_URL` and `SUPABASE_KEY`.
- No test runner or `test` script in `@package.json` — do not assume Vitest/Jest until both config and a script exist.
- Agent git/issues/release: rule `@.cursor/rules/gh-workflow.mdc` + personal skills `gh-issues` / `gh-ship` / `gh-release` / `gh-roadmap-sync` / `gh-change-sync`; board IDs in `@.github/agent-workflow.yml`. Issues in English; type + 10x roadmap labels; `change` label for `context/changes/<id>` (sync via `/gh-change-sync`). After `/10x-roadmap`, ask before syncing to Kanban (`/gh-roadmap-sync`). After `/10x-new` / plan / implement / archive milestones, run `gh-change-sync`. Production: `/gh-release` (tag `v*`). Do not patch `.cursor/skills/10x-*` for this — `10x get` overwrites them.

## Auth & Deploy

- Cookie-session Supabase SSR client: `@src/lib/supabase.ts` (server env fields in `@astro.config.mjs`).
- Local Supabase: `npx supabase start` (Docker). Manual deploy: `npx wrangler deploy` (`@wrangler.jsonc`).
- Production CD (`@.github/workflows/deploy.yml`) runs on tag `v*` only: pushes Supabase migrations, seeds `supabase/seed-data/kog-maps.sql` only when that file changed since the previous tag, then builds and deploys the Worker. Needs Actions secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` (optional `SUPABASE_DB_PASSWORD`), plus existing Cloudflare/`SUPABASE_URL`/`SUPABASE_KEY`. Create GitHub Release notes via `/gh-release` before/with the tag so notes exist when the version is live.
- Production URL: [https://book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev)
