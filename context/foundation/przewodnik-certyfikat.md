# Przewodnik: oddanie Book Your Miggets pod certyfikat 10xBuilder

Dokument roboczy. Stan na **2026-09-14**. Źródła: lekcje M3 w `10x-devs_lessons/` (lokalnie, gitignored), prompt `mvp-check.md`, `context/foundation/test-plan.md`, `AGENTS.md`.

**Cel:** zamknąć lukę, która blokowała zgłoszenie, bez robienia całego modułu 3 „na pokaz”.

**Werdykt Builder (techniczny): 5/5.** Minimum z M3L5 (CRUD + logika biznesowa + zestaw testów mapowany na ryzyko z planu) jest na dysku i w CI. To nie gwarantuje certyfikatu — recenzja wizualna / formularz / odznaki Mission Log są osobno.

---

## 1. Werdykt `mvp-check` (stan na dziś)

| # | Kryterium | Status | Dowód / luka |
|---|-----------|--------|----------------|
| 1 | CRUD na głównym zasobie | ✅ | Run: Create `POST /api/runs` → insert / `createInviteOnlyRun`; Read `listActiveRuns` + `src/pages/runs/index.astro` + `src/pages/runs/[id].astro`; Update `updateRun` + `POST /api/runs/[id]`; Delete `deleteRunAsOrganizer` + `POST /api/runs/[id]/delete`. Wszystko na tabeli `runs` (Supabase). |
| 2 | Logika biznesowa poza CRUD | ✅ | `isRunActive` / `getRunLifecyclePhase` (`src/lib/run-lifecycle.ts`); limit 5 audience-active (`MAX_ACTIVE_RUNS_PER_ORGANIZER`); capacity 1–64 i horyzont `starts_at` (`src/lib/run-limits.ts`); overlay `auto_join_min`; join/approve w `applyToRun`. |
| 3 | Testy powiązane z nazwanym ryzykiem | ✅ | Plan: `context/foundation/test-plan.md` Risk #1. Test: `src/lib/run-lifecycle.test.ts` (`npm test`, Vitest). CI: `.github/workflows/ci.yml` → lint → **test** → build. Extra (nie wymagane do 5/5): Playwright guest E2E Risk #6 + #2 (`npm run test:e2e`, nie w CI). |
| 4 | Auth powiązany z użytkownikiem | ✅ | Email+hasło: `POST /api/auth/signin`. Sesja cookie: `src/lib/supabase.ts`. Gate: `PROTECTED_ROUTES` w `src/middleware.ts`. Zasoby scoped: `organizer_id`, RLS, dashboard. |
| 5 | Dokumentacja | ✅ | `README.md` (produkt + jak odpalić testy). `context/foundation/prd.md`. `roadmap.md` — F-01 i S-01…S-31 `done`. Ten przewodnik. |

**Status projektu: 5/5 = 100% progu `mvp-check`.**

UI, CSS i to, czy ostatni tag jest na produkcji, **nie wchodzą** w te 5 punktów (oceniane osobno, np. ze screenshotów). Deploy nie jest w `mvp-check`.

Projekt wykracza poza minimum: klan, restricted visibility, poll map, transfer, complete/verify-finish, admin, changelog, CD na tag `v*`, plus M3L3 hooki i M3L4 guest Playwright.

---

## 2. Lekcje M3 — co jest zrobione

| Lekcja | Obowiązkowe pod certyfikat? | Status | Dowód |
|--------|------------------------------|--------|--------|
| M3L1 Plan testów | **Tak** | ✅ | `context/foundation/test-plan.md` — ryzyka jako scenariusze, wiersz bezpieczeństwa (#2), cookbook |
| M3L2 Unity z agentem | **Tak, minimalnie** | ✅ | Vitest + Risk #1; zmiana `test-lifecycle-guards` zarchiwizowana (`context/archive/2026-09-14-test-lifecycle-guards`, #131 / PR #132) |
| M3L3 Hooki agenta | Nie | ✅ (odznaka) | `.cursor/hooks.json` → `eslint-fix.sh`, `typecheck.sh`, `vitest-related.sh`. Husky pre-commit bez Lefthooka |
| M3L4 E2E Playwright | Nie (unit już pokrywa kryterium 3) | ✅ (odznaka) | `playwright.config.ts`, `e2e/seed.spec.ts` (#6), `e2e/restricted-run-not-found.spec.ts` (#2). `npm test` zostaje Vitest. E2E **nie** w CI |
| M3L5 Debug / Sentry | Nie | ✅ zadanie 1 / ⏳ zadanie 2 | Hunt połkniętego błędu — brak połkniętej mutacji (poniżej). Sentry **nie** wdrożone (opcjonalnie, nie blokuje Buildera) |

Deep Dive (Stryker, vision MCP, Lefthook) — **nie** w zgłoszeniu.

---

## 3. Ścieżka minimalna — wykonana

Kroki 0–4 z sesji M3L1–L2 są zamknięte. Nie wracaj do `/10x-test-plan` ani do unitów całego `runs.ts`, żeby „mieć więcej testów”.

| Krok | Co | Stan |
|------|----|------|
| 1 | `/10x-test-plan` → `test-plan.md` | ✅ |
| 2 | `/10x-new test-lifecycle-guards` → Vitest + Risk #1 | ✅ archived |
| 3 | CI `npm test` | ✅ w `ci.yml` |
| 4 | `mvp-check` kryterium 3 | ✅ ryzyko #1 ↔ `run-lifecycle.test.ts` |
| 5 | Formularz zgłoszenia + screenshoty + Mission Log | ⏳ Twoja robota na platformie |

---

## 4. Ścieżka pełna M3 (odznaki, nie próg 5/5)

### M3L3 — hooki (Cursor) ✅

`.cursor/hooks.json` `afterFileEdit`: ESLint `--fix` na edytowanym pliku, `tsc --noEmit` fail-open poza tym plikiem, `vitest related` tylko na `run-lifecycle` / `run-limits`. Exit **2** = agent ma zobaczyć błąd.

### M3L4 — E2E ✅

Guest chromium, `getByRole`, bez `waitForTimeout`, bez `storageState` na #6/#2, bez admin suite, bez CI. `webServer` = `npm run dev` na **:4321**.

### M3L5 — debug / monitoring

1. ✅ Hunt połkniętego błędu (poniżej).
2. ⏳ Sentry tylko po osobnej zgodzie: `/10x-new` → plan → implement. Astro 7 + `@astrojs/cloudflare` + Workers (`wrangler.jsonc`), nie Pages / nie kopia 10xCards Astro 6. Plan Developer; `captureConsoleIntegration` świadomie (limit 5k). Nie blokuje Buildera.

**Hunt 2026-09-14 (M3L5 zadanie 1) — werdykt: brak połkniętej mutacji.**

Wzorce: `catch (` (52 pliki API), `console.error` (brak `console.warn` w `src/`), `{ ok: true }` / redirect sukcesu, `if (error)` w serwisach.

Kontrakt handlerów: `try { mutate } catch { log + fail(...) }` — JSON 4xx/`{ error }` albo `?error=` / `?commentError=` / `?pollError=`. `{ ok: true }` i redirect z `notice` są **po** udanej mutacji, nie w `catch`.

| Miejsce | Co wygląda podejrzanie | Werdykt |
|---------|------------------------|---------|
| `src/pages/api/runs/[id]/apply.ts`, `delete.ts` i bliźniacze mutacje | `console.error` + `{ ok: true }` w tym samym pliku | `ok: true` tylko po `try`; `catch` → `fail` |
| `src/pages/api/runs/index.ts` | insert run, potem `replaceRunMaps` | maps fail → `fail("Could not create this run")`, nie 200 |
| `src/lib/friend-mutation-http.ts`, `clan-invite-mutation-http.ts` | `{ ok: true }` / `?notice=` | tylko po udanym `mutate`; `catch` → `fail` |
| `src/pages/api/runs/[id]/poll/vote.ts` L40–47 | `catch` + `console.error` + `{ ok: true }` | **nie mutacja:** `voteMapPoll` już się udał; pada tylko odczyt polla dla JSON. HTML i tak robi `redirect`. 500 po udanym głosie kłamałoby w drugą stronę — bez „fixa” |
| `src/lib/services/inbox.ts` `setInboxToastCookie` | pusty `catch` + log | toast po udanym sign-in; nie endpoint mutacji zasobu |
| `src/lib/storage.ts` `removeObject` | log, brak throw | cleanup po udanym delete; primary side-effect już zapisany |
| `src/lib/services/comments.ts` `mintScreenshotUrls` | log + fallback / puste URL | odczyt listy, nie POST sukcesu |
| `src/middleware.ts` profil | log, `profile` zostaje null | fail-closed `/admin`; nie API 200 po nieudanym zapisie |

Nie znaleziono wzorca lekcji (`update_failed` + `200 { ok: true }` przy nieudanym zapisie). Nie wymyślano buga.

---

## 5. Mapa ryzyk (żywy kontrakt: `test-plan.md`)

Nie kopiuj tej tabeli na ślepo — kanon jest w `context/foundation/test-plan.md` §2.

| # | Ryzyko | Warstwa dziś |
|---|--------|----------------|
| 1 | Zarchiwizowany / wygasły extend nadal audience-active | ✅ unit (`run-lifecycle.test.ts`) |
| 2 | Gość widzi treść friends/invite/clan runa | ✅ thin e2e (`e2e/restricted-run-not-found.spec.ts`); formalna faza 3 planu nieotwarta |
| 3 | Po `auto_join_min` kolejny gracz confirmed zamiast pending | ⏳ faza 2 planu |
| 4 | Capacity / `starts_at` omija API | ⏳ faza 2 planu |
| 5 | Po `completed_at` nadal join/leave/edit/extend | ⏳ faza 4 planu |
| 6 | Niezalogowany otwiera `/dashboard` / `/runs/new` | ✅ thin e2e (`e2e/seed.spec.ts`); formalna faza 4 nieotwarta |

Fazy 2–4 w `test-plan.md` §3 zostają `not started` celowo — M3L4 to smoke lekcji, nie otwarte change foldery.

---

## 6. Pliki (minimalna ścieżka + leftover M3)

Już w repo / w tym PR:

- `context/foundation/test-plan.md`
- `context/archive/2026-09-14-test-lifecycle-guards/`
- `vitest.config.ts`, `src/lib/run-lifecycle.test.ts`, `package.json` `"test": "vitest run"`
- `.github/workflows/ci.yml` → `npm test`
- `AGENTS.md` (Vitest + E2E)
- `.cursor/hooks.json` + `.cursor/hooks/*.sh`
- `playwright.config.ts`, `e2e/*.spec.ts`
- ten przewodnik

Nie commituj: `.env`, `.dev.vars`, `playwright/.auth/`, `10x-devs_lessons/`.

---

## 7. Checklist dnia zgłoszenia

### Próg techniczny (agent / repo)

- [x] `mvp-check`: 5/5 (kryterium 3: Risk #1 ↔ `src/lib/run-lifecycle.test.ts`)
- [x] `npm test` zielone lokalnie (Vitest)
- [x] CI na `main`/PR: lint + **test** + build
- [x] README + PRD opisują rzeczywisty produkt
- [x] M3L1–L5 zadania obowiązkowe lekcji (Sentry opcjonalne — nie zrobione)

### Twoja robota na platformie (agent tego nie klika)

- [ ] Happy path na screenshotach: signup/signin → create run → apply → (approve) → lista / dashboard
- [ ] Formularz zgłoszenia z kanału [Informacje i ogłoszenia [10X3]](https://bravecourses.circle.so/c/informacje-i-ogloszenia-10x3/)
- [ ] Odznaki M3L1–L5 w [Mission Log](https://platforma.przeprogramowani.pl/10xdevs-3/mission-log)

---

## 8. Ściąga (historyczna)

```text
# Zrobione — nie odpalaj od nowa, żeby „mieć więcej”
/10x-test-plan
/10x-new test-lifecycle-guards  → archived
npm test                        # Vitest
npm run test:e2e                # Playwright guests; nie CI

# Opcjonalnie później
/10x-new …                      # Sentry, tylko po zgodzie
/10x-test-plan --status
```

Nie mieszaj „napisz testy do całego `runs.ts`” z tą ścieżką. Jedno ryzyko, jeden najtańszy sygnał, zielony test, który pada po celowym zepsuciu — kryterium 3 jest zamknięte.
