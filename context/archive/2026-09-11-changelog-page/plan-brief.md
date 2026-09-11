# Changelog page — Plan Brief

> Full plan: `context/changes/changelog-page/plan.md`

## What & Why

Guests need a place to read what shipped. FR-013 / S-31: open `/changelog` from a footer Changelog link and read release notes. Copy tracks GitHub Release notes already written at tag time (`/gh-release`), not a new CMS.

## Starting Point

Footer Quick Links have no Changelog item. There is no `/changelog` page. Notes live only on GitHub Releases (`## For users (EN)` + `## For developers`). Public lists (`/clans`, `/runs`) stay public by staying out of `PROTECTED_ROUTES`.

## Desired End State

A guest clicks **Changelog** in the footer, lands on `/changelog` without signing in, and reads published For-users notes (New / Improved / Fixed), newest first. Developer sections never appear. Empty list and fetch failure are distinct HTTP 200 states.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Audience | Public guest page; no officer/admin changelog | FR-013 is guest-readable; Crew forbade inventing a private surface | Crew |
| Auth | Do not add `/changelog` to `PROTECTED_ROUTES` | Same rule as `/runs` and `/clans` | Crew |
| Notes source | Request-time public GitHub fetch + Cache-Control on success | Tracks Releases as SoT; no new secret or deploy.yml bake | Plan |
| Render | Structured parse of `## For users (EN)` New/Improved/Fixed; escaped fallback | Matches gh-release template; no markdown dep; never show developers | Plan |
| Failure UX | Always HTTP 200; empty card vs fixed error copy; `console.error` the cause | Matches `/clans` + lessons.md (no raw API text) | Plan |
| Volume | First page, `per_page=30`, skip drafts/prereleases, no pagination | Covers current v0.1.x history in one request | Plan |

## Scope

**In scope:** `src/lib/services/releases.ts`, `src/pages/changelog.astro`, footer Changelog link, AGENTS.md public-route sentence.

**Out of scope:** CMS, in-repo CHANGELOG, `GITHUB_TOKEN`, markdown library, pagination, i18n, Topbar item, React, API route, DB, clans/lifecycle, test runner.

## Architecture / Approach

SSR page calls a small loader → `GET https://api.github.com/repos/Miigget/book_your_miggets/releases?per_page=30` (User-Agent required) → filter published → parse For-users → render Astro list. Cache-Control only on success (~1h). Footer points at `/changelog`, not at GitHub.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Public `/changelog` page | Loader + page + empty/error + success cache header | Shared Worker IPs vs GitHub 60 req/hr if cache misses |
| 2. Footer + AGENTS.md | Discovery link; do-not-protect rule | Linking to GitHub instead of `/changelog` |

**Prerequisites:** Public GitHub repo; existing `/gh-release` notes. No schema.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Unauthenticated GitHub rate limit (60/hr/IP) plus shared Worker egress — residual; no token this slice. Do not cache error HTML.
- Cloudflare may not CDN-cache `Cache-Control` without `cacheCloudflare()` — still set the header; first visitors may always hit GitHub.
- Older releases that ignore the notes template use escaped fallback, not pretty subsections.
- `Astro.cache` / bake-at-tag left for a later slice if rate limits bite.

## Success Criteria (Summary)

- Guest reaches `/changelog` from the footer without signing in and can read For-users notes.
- Developer / audit sections never render.
- Empty vs GitHub-down are distinct, both HTTP 200, no leaked API text.
