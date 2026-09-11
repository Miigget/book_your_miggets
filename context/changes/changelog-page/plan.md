# Changelog page Implementation Plan

## Overview

Add a public, guest-readable `/changelog` page that lists GitHub Release notes already authored at tag time (`/gh-release`), plus a footer **Changelog** link as the discovery path. Copy comes from a request-time public Releases API fetch; the UI shows only `## For users (EN)` (structured New / Improved / Fixed). No CMS, no auth, no database.

## Current State Analysis

- **No `/changelog` route.** `src/pages/` has no changelog page. Guests hitting the path get the platform default 404 (there is no branded `404.astro`).
- **Footer has no Changelog link.** Quick Links in `src/components/Footer.astro` are Browse Runs, Browse Clans, Create a Run, plus off-site KoG/Teeworlds. FR-013 / S-31 name footer Changelog as the discovery path.
- **Public pages stay public by omission.** `PROTECTED_ROUTES` in `src/middleware.ts` does not include `/runs` or `/clans`. Crew already forbids adding `/changelog`. Auth still loads into `locals` for Topbar; the page must not gate on `user`.
- **Layout pattern.** Public lists wrap `Layout` + `PageChrome` (Topbar + Footer). Title form is `"Clans — Book Your Miggets"`. Gradient `h1` + muted subtitle. Empty state is a centered frosted card (`clans/index.astro`). Load errors use a short in-page message, not raw infrastructure text (`lessons.md`).
- **Release notes already exist on GitHub only.** `/gh-release` runs `gh release create` with `## For users (EN)` then `## For developers`. Config: `.github/agent-workflow.yml` `release_notes.languages: [en]`. The in-app rule is already written in `~/.cursor/skills/gh-release/release-notes.md`: parse user sections only; never show developers. No in-repo `CHANGELOG.md`, no Octokit, no Worker GitHub secret.
- **No markdown stack.** `package.json` has no marked/MDX/typography plugin. App copy is hand-written Tailwind. Changelog must not add a markdown library.
- **No test runner.** CI is `astro sync` + `npm run lint` + `npm run build`. Do not invent Vitest.

## Desired End State

A guest (and a signed-in member) can click **Changelog** in the footer, land on `/changelog` without signing in, and read published release notes newest-first. Each entry shows the version (tag/name), published date, and the For-users New / Improved / Fixed bullets. Developer sections never appear. An empty GitHub list and a fetch failure are distinct, both HTTP 200, both with fixed user copy. The page is Astro-only.

### Key Discoveries:

- Public shell to copy: `src/pages/clans/index.astro` (`Layout` + `PageChrome`, gradient `h1`, empty card at the clans empty-state block).
- Footer insertion: Quick Links `<ul>` in `src/components/Footer.astro` — after Browse Clans, same link classes.
- Middleware: `PROTECTED_ROUTES` in `src/middleware.ts` — do not add `/changelog`.
- Notes SoT: GitHub Releases for `Miigget/book_your_miggets` (`repo` in `.github/agent-workflow.yml`); template in `~/.cursor/skills/gh-release/release-notes.md`.
- Astro SSR cache header: `Astro.response.headers.set("Cache-Control", ...)` on the page (Astro on-demand rendering docs). Set only after a successful fetch.
- GitHub list: `GET /repos/{owner}/{repo}/releases?per_page=30`. Unauthenticated list omits drafts; still filter `draft` and `prerelease`. GitHub requires a `User-Agent`.
- `lessons.md`: never put raw `Error.message` / API text in the UI; `console.error` the real cause.
- Services live under `src/lib/services/` (`AGENTS.md`).

## What We're NOT Doing

- Adding `/changelog` to `PROTECTED_ROUTES` or inventing officer/admin-only changelog.
- A CMS, in-repo `CHANGELOG.md`, or deploy.yml bake of notes.
- A `GITHUB_TOKEN` / new `astro.config.mjs` env field.
- A markdown library, MDX, or `@tailwindcss/typography`.
- Showing `## For developers`, issue/PR audit lines, or draft/prerelease releases.
- Pagination, per-release detail routes, i18n / `## For users (PL)`, Topbar nav item.
- React islands, API route, Postgres, RLS, or clans/run-lifecycle changes.
- `Astro.cache` / `cacheCloudflare()` provider setup (out of slice; Cache-Control on success is enough).
- Vitest/Jest until the repo has a test runner.

## Implementation Approach

One small server module fetches and parses Releases; one Astro page renders the list; the footer points at the page. Track GitHub as the source of truth at request time. Keep blast radius to chrome + one route.

## Critical Implementation Details

Do not cache an error response. Set `Cache-Control` only when the GitHub fetch succeeds (including an empty published list). Caching a friendly error for an hour would hide a recovered API.

GitHub rejects requests without a `User-Agent`. Send `User-Agent` (app name is enough) plus `Accept: application/vnd.github+json`. Use a short `AbortSignal` timeout so a hung `api.github.com` cannot stall the Worker.

Strip `## For developers` and everything after it before any fallback. Keep `ChangelogRelease` strings raw (unescaped). Render only with Astro `{…}` interpolation — never `set:html`. Astro already HTML-escapes text interpolation; pre-escaping would show `&amp;` to guests.

---

## Phase 1: Public `/changelog` page

### Overview

Guest (and signed-in) can open `/changelog` and read published For-users notes, or see a distinct empty / error state. No footer link yet.

### Changes Required:

#### 1. Releases loader

**File**: `src/lib/services/releases.ts` (new)

**Intent**: Own the GitHub list fetch, published-only filter, and For-users parse so the page stays presentational and the “never show developers” rule has one home.

**Contract**: Export a loader that returns either `{ ok: true, releases: ChangelogRelease[] }` or `{ ok: false }` (no raw error string for the UI). Wrap fetch + JSON + parse in one try/catch so the page never 500s. `ChangelogRelease` includes `tagName`, `title` (API `name` or `tag_name`), `publishedAt` (ISO or null), `htmlUrl`, plus `sections: { new: string[]; improved: string[]; fixed: string[] }` and optional `fallbackText` (raw plain lines when the user section is not the template — do not HTML-escape here). Fetch `https://api.github.com/repos/Miigget/book_your_miggets/releases?per_page=30` (owner/repo match `.github/agent-workflow.yml`). Skip `draft` / `prerelease`. On non-OK HTTP, network/timeout, abort, non-array JSON, or parse throw: `console.error` and `{ ok: false }`. `null`/empty body → empty sections (or `fallbackText` `""`) still `{ ok: true }`. Parse: take `## For users (EN)` until the next line-start `## `; map `### New` / `### Improved` / `### Fixed` bullets (`- `); leftover user-section lines become `fallbackText`; if the heading is missing, use the body with the developers heading and everything after it removed as `fallbackText`. Never return the developers section. The page must not rethrow; `{ ok: false }` renders the fixed error copy.

#### 2. Changelog page

**File**: `src/pages/changelog.astro` (new)

**Intent**: Public SSR page that calls the loader and renders the list with the same chrome as `/clans`.

**Contract**: `Layout` title `Changelog — Book Your Miggets` + `PageChrome` (default `max-w-3xl`). No `user` gate. Wrap the loader call so a throw cannot 500; treat unexpected throws as `{ ok: false }`. On `ok` and length > 0: newest-first list (API order). On `ok` and empty: clans-style empty card — title “No releases yet”, supporting line that notes will appear after the next tagged release. On `!ok`: HTTP 200, short fixed error copy (“Could not load release notes. Try again later.”); optional extra line linking to `https://github.com/Miigget/book_your_miggets/releases` (new tab, `rel="noopener noreferrer"`). After a successful fetch only, set `Cache-Control` to a public edge-friendly value on the order of one hour (`s-maxage` plus a short browser `max-age`; `public, max-age=60, s-maxage=3600` is enough). Astro-only — no `client:` islands. Reuse gradient `h1` + muted subtitle (“Release notes. No account needed.”). Per-entry: version heading, `<time datetime>` for `publishedAt` (Layout already localizes `time[datetime]`), then subsection headings + lists. Render note text only with Astro `{…}` — never `set:html`. Hide empty New/Improved/Fixed headings. Extract `src/components/changelog/ReleaseEntry.astro` if the page would otherwise mix parse-shaped markup with chrome.

### Success Criteria:

#### Automated Verification:

- `src/pages/changelog.astro` and `src/lib/services/releases.ts` exist
- `src/middleware.ts` `PROTECTED_ROUTES` still does not include `/changelog`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest opens `http://localhost:4321/changelog` (or the running `astro dev` origin) without signing in and sees the page chrome (Topbar + Footer), not a sign-in redirect
- With live GitHub data: entries show version + For-users New/Improved/Fixed; no “For developers”, file names, or issue/PR audit lines
- Signed-in user can open the same URL
- A forced loader failure (temporary bad URL or thrown error in a local tweak) still returns HTTP 200 with the friendly error copy, not a GitHub/JSON dump

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Footer discovery and public-route docs

### Overview

Guests can find `/changelog` from the footer. Future agents are told not to prefix-protect it.

### Changes Required:

#### 1. Footer Changelog link

**File**: `src/components/Footer.astro`

**Intent**: FR-013 discovery path — a guest can reach release notes without knowing the URL.

**Contract**: Add a Quick Links item **Changelog** → `/changelog` after Browse Clans, same `text-sm text-blue-100/60` / hover classes as the existing items. Same-origin `<a href="/changelog">`, not the GitHub Releases URL.

#### 2. Agent public-route note

**File**: `AGENTS.md`

**Intent**: Same class of rule as “do not prefix-protect `/runs` / `/clans`” so a later change does not lock the page.

**Contract**: In Hard Rules, add that `/changelog` is public (guest-readable release notes; footer Changelog is the discovery path) and must not be added to `PROTECTED_ROUTES`. Do not invent a long changelog ACL paragraph.

### Success Criteria:

#### Automated Verification:

- Footer markup includes `href="/changelog"` with visible text Changelog
- `AGENTS.md` states `/changelog` must stay public / not be prefix-protected
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest clicks Footer → Changelog and lands on `/changelog` (signed-out)
- Signed-in user can use the same footer link
- Topbar is unchanged (no new nav item)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None in-repo — no test runner / `test` script. Keep parse/fetch in `src/lib/services/releases.ts` so a later runner can cover heading split and developers-strip without a rewrite.

### Integration Tests:

- None. CI remains lint + build.

### Manual Testing Steps:

1. Start `npm run dev`. As a guest, open `/changelog` directly — no redirect to `/auth/signin`.
2. Confirm listed notes match recent GitHub Releases’ `## For users (EN)` and omit `## For developers`.
3. Click Footer → Changelog from `/` and from `/runs`; both land on `/changelog`.
4. Sign in; repeat the footer click and confirm the page still renders.
5. If GitHub is empty in a given env, confirm the empty card (not the error card). If the API is unreachable, confirm the error card + HTTP 200.

## Performance Considerations

One GitHub request per uncached HTML render, `per_page=30`. Success responses get ~1h `Cache-Control`. Unauthenticated GitHub is 60 req/hr per IP; Workers share egress IPs, so a cache miss storm can 403. Residual risk — no token in this slice. Do not cache `!ok` responses.

## Migration Notes

No schema, no backfill. Notes already on GitHub from prior `/gh-release` tags appear as soon as the page ships. Drafts and prereleases stay hidden.

## References

- Roadmap S-31: `context/foundation/roadmap.md`
- PRD FR-013: `context/foundation/prd-v2.md`
- Release notes template: `~/.cursor/skills/gh-release/release-notes.md`
- Repo / languages: `.github/agent-workflow.yml` (`repo`, `release_notes`)
- Public page pattern: `src/pages/clans/index.astro`
- Footer: `src/components/Footer.astro`
- Middleware: `src/middleware.ts`
- Lessons (no raw errors): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Public `/changelog` page

#### Automated

- [x] 1.1 `src/pages/changelog.astro` and `src/lib/services/releases.ts` exist
- [x] 1.2 `src/middleware.ts` `PROTECTED_ROUTES` still does not include `/changelog`
- [x] 1.3 `npm run lint` passes
- [x] 1.4 `npm run build` passes

#### Manual

- [ ] 1.5 Guest opens `/changelog` without signing in and sees page chrome, not a sign-in redirect
- [ ] 1.6 Live GitHub data shows For-users New/Improved/Fixed only — no developers / audit lines
- [ ] 1.7 Signed-in user can open the same URL
- [ ] 1.8 Forced loader failure stays HTTP 200 with friendly copy, not a GitHub/JSON dump

### Phase 2: Footer discovery and public-route docs

#### Automated

- [ ] 2.1 Footer markup includes `href="/changelog"` with visible text Changelog
- [ ] 2.2 `AGENTS.md` states `/changelog` must stay public / not be prefix-protected
- [ ] 2.3 `npm run lint` passes
- [ ] 2.4 `npm run build` passes

#### Manual

- [ ] 2.5 Guest clicks Footer → Changelog and lands on `/changelog` (signed-out)
- [ ] 2.6 Signed-in user can use the same footer link
- [ ] 2.7 Topbar is unchanged (no new nav item)
