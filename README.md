# Book Your Miggets

A team finder and run scheduler for **King of Gores** (KoG) in [TeeWorlds](https://www.teeworlds.com/).

**Play:** [book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev)

The game client has no way to post “we play map X at 21:00, need three people with enough points.” Players still hunt for a squad in in-game chat, by hopping servers, on Discord, and in DMs — and often spend the first half hour of a session looking for people instead of playing. Book Your Miggets is the missing notice board: post a run, fill the team, show up in-game together.

## What is King of Gores?

TeeWorlds is a free 2D multiplayer platformer. You control a small character called a **Tee**. King of Gores is a community game mode whose only win condition is getting **the whole team** from Start to Finish on a purpose-built map.

Movement is built around the **hook** (a grappling line you fire at walls and teammates) and the **hammer**. Most surfaces are covered in **freeze**: touch it and you cannot move until a teammate hooks you out or hammers you free. A frozen Tee is not out of the run — they are stuck until someone saves them. Cooperation is mandatory, not optional.

A **run** is one agreed attempt at a specific map (or set of maps) with a specific group. On harder maps, finding that group is often harder than the map itself.

## What the app does

Guests can browse without an account. Signing in lets you organize and join.

**Runs**

- Post a public run: map(s) or a difficulty category, start time, capacity, optional minimum KoG points, approval or auto-join.
- Browse and filter the live list; apply, get accepted (or auto-join), and see who is on the roster.
- Keep a session going after start (default one-hour in-progress window, optional organizer extend), then archive it instead of deleting it.
- Use friends-only, invite-only, or clan-only visibility when a run should not sit on the public board.
- Attach several maps to one session, or run a map poll so confirmed players vote before you lock the map.

**People**

- Public player profiles (nickname, points, labels — never email).
- Friends between verified players; an inbox for friend requests, clan invites, and private-run invites.

**Clans**

- Verified players create a clan; anyone can browse the directory and ranking.
- Clan owners run clan-only sessions. Completing a clan run does not award points by itself — an admin marks a **verified finish** after checking the in-game result. Only then do clan points (and ranking) move.

The app does **not** talk to the TeeWorlds client. There is no in-game overlay, no automatic stat import, and no voice chat. You still jump into the game when the clock hits; this site is for agreeing who shows up.

## The name

**Migget** is a long-standing KoG nickname. In the community it also stuck as a joke for a player who brings energy (and a bit of chaos) to a run. _Book Your Miggets_ is “book your team” with that nickname folded in — a pun for people who already play, and a brand name for everyone else.

## Stack

Astro 7 (SSR) on Cloudflare Workers, React 19 islands, Tailwind 4, Supabase (Postgres + Auth). Agent-oriented contributor notes live in [`AGENTS.md`](AGENTS.md). Product intent is in [`context/foundation/prd.md`](context/foundation/prd.md).

## Local development

You need **Node.js 22.14.0** (see `.nvmrc`) and **Docker** (local Supabase).

```bash
git clone https://github.com/Miigget/book_your_miggets.git
cd book_your_miggets
npm install
cp .env.example .env
cp .env.example .dev.vars
npx supabase start
```

`supabase start` prints `API URL` and the anon key. Put those in both `.env` (Node) and `.dev.vars` (Wrangler / `npm run dev`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from the CLI>
```

Do not commit either file. First start applies migrations and seeds the KoG maps catalog. To wipe the local database and re-seed: `npx supabase db reset`. Studio: `http://127.0.0.1:54323`.

```bash
npm run dev          # http://localhost:4321
npm run lint
npm test             # Vitest (this is what CI runs)
npm run test:e2e     # Playwright guest smoke; needs local Supabase; not in CI
npm run build
```

Local Auth has email confirmation **off**, so you can sign in right after sign-up.

Risks, phases, and how tests map to them: [`context/foundation/test-plan.md`](context/foundation/test-plan.md).

### First admin

Nothing is seeded as admin. Sign up in the app, then promote that user in the local SQL editor (`select id, email from auth.users`). The privileged-columns trigger must be disabled around the update — a SQL-editor session has no `auth.uid()`, so the trigger would otherwise reset `role`:

```sql
begin;
alter table public.profiles disable trigger profiles_enforce_privileged_columns;
update public.profiles set role = 'admin' where id = '<user-id>';
alter table public.profiles enable trigger profiles_enforce_privileged_columns;
commit;
```

After a refresh, **Admin** appears in the top bar (`/admin`). Further role changes stay manual; ban/verify and the rest of moderation are in the UI once one admin exists.

## Production

Live Worker: [book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev). Release notes: in-app [`/changelog`](https://book-your-miggets.bookyourmiggets.workers.dev/changelog) and [GitHub Releases](https://github.com/Miigget/book_your_miggets/releases).

CI (lint, `npm test`, build) runs on push/PR to `main`. Production deploys on version tags (`v*`) only — merging to `main` does not ship.
