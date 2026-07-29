# Repository Guidelines

Book Your Miggets is a Team Finder / Run Scheduler for TeeWorlds gores. Stack: Astro 7 SSR (`output: "server"` in `@astro.config.mjs`), React 19 islands, Tailwind 4, Supabase auth, shadcn/ui, Cloudflare Workers. Product scope: `@context/foundation/prd.md`. Starter reference: `@README_astro_starter.md`.

## Hard Rules

- Prefer Astro for layout/static UI; use React only for interactive islands. Never add Next.js directives (`"use client"`, etc.).
- Merge Tailwind classes with `cn()` from `@/lib/utils` — do not concatenate class strings.
- API routes export uppercase `GET` / `POST` under `src/pages/api/` (see `@src/pages/api/auth/signin.ts`).
- Gate private pages via `PROTECTED_ROUTES` in `@src/middleware.ts` (currently `/dashboard`).
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
- Agent git/issues/release: rule `@.cursor/rules/gh-workflow.mdc` + personal skills `gh-issues` / `gh-ship` / `gh-release` / `gh-roadmap-sync`; board IDs in `@.github/agent-workflow.yml`. Issues in English; type + 10x roadmap labels. After `/10x-roadmap`, ask before syncing to Kanban (`/gh-roadmap-sync`). Production: `/gh-release` (tag `v*`). Do not patch `.cursor/skills/10x-*` for this — `10x get` overwrites them.

## Auth & Deploy

- Cookie-session Supabase SSR client: `@src/lib/supabase.ts` (server env fields in `@astro.config.mjs`).
- Local Supabase: `npx supabase start` (Docker). Manual deploy: `npx wrangler deploy` (`@wrangler.jsonc`).
- Production CD (`@.github/workflows/deploy.yml`) runs on tag `v*` only — create GitHub Release notes via `/gh-release` before/with the tag so notes exist when the version is live.
- Production URL: [https://book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev)
