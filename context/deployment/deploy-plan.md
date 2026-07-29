# Plan wdrożenia: Cloudflare Workers + integracje zewnętrzne

**Projekt:** Book Your Miggets  
**Data planu:** 2026-07-22 · **Aktualizacja CD:** 2026-07-29 (deploy na tag `v*`, nie na merge do `main`)  
**Źródła:** `context/foundation/infrastructure.md`, `context/foundation/tech-stack.md`, docs Astro 7 / `@astrojs/cloudflare` v14+, Cloudflare Workers, Supabase Auth  
**Cel docelowy:** produkcyjna aplikacja SSR na **Cloudflare Workers** (nie Pages), z auth/DB w **Supabase** i deployem z **GitHub** (tag `v*` + Release notes).

**Production URL:** [https://book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev)

---

## Co już jest gotowe w repozytorium


| Element                                                      | Stan                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Astro 7 SSR (`output: "server"`)                             | ✅                                                                   |
| Adapter `@astrojs/cloudflare` ^14.1.4                        | ✅                                                                   |
| `wrangler.jsonc` + `nodejs_compat` + observability           | ✅                                                                   |
| Sekrety `SUPABASE_URL` / `SUPABASE_KEY` w `astro.config.mjs` | ✅                                                                   |
| CI: lint + build na `main` / PR (bez deployu)                | ✅ `.github/workflows/ci.yml`                                        |
| Nazwa Workera w `wrangler.jsonc`                             | ✅ `book-your-miggets`                                               |
| Lokalne `.dev.vars` + lint/build przed deployem              | ✅                                                                   |
| Sekrety GitHub `SUPABASE_URL` / `SUPABASE_KEY`               | ✅                                                                   |
| Pierwszy deploy Workers + sekrety Workera                    | ✅ [production URL](https://book-your-miggets.bookyourmiggets.workers.dev) |
| Auth e2e na produkcji (signup → confirm → dashboard)         | ✅                                                                   |
| Workflow Deploy (`.github/workflows/deploy.yml`)             | ✅ trigger: tag `v*` (nie push do `main`); 4 sekrety GitHub          |
| Agent release path                                           | ✅ `/gh-release` → GitHub Release + tag → CD; config w `agent-workflow.yml` |
| Hint w `tech-stack.md`: `cloudflare-workers`                 | ✅                                                                   |


> **Ważne:** Astro 7 + `@astrojs/cloudflare` v14+ **nie wspiera Cloudflare Pages**. Wszystkie poradniki „Deploy to Pages” pomijamy. Poprawna ścieżka: `npm run build` → `npx wrangler deploy`.

---



## Mapa integracji zewnętrznych

```text
┌─────────────────┐     sekrety / API token      ┌──────────────────────┐
│  GitHub (kod +  │ ────────────────────────────▶│  Cloudflare Workers  │
│  Actions / CI)  │                              │  (hosting SSR+CDN)   │
└─────────────────┘                              └──────────┬───────────┘
                                                            │
                     SUPABASE_URL + SUPABASE_KEY (anon)     │
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │  Supabase Cloud      │
                                                 │  Auth + Postgres     │
                                                 └──────────────────────┘
```


| Integracja               | Rola                                 | Co musisz założyć / skonfigurować ręcznie                                       |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------- |
| **Cloudflare**           | Hosting aplikacji (Worker + assets)  | Konto, logowanie Wrangler, sekrety Workera, opcjonalnie domena i Workers Builds |
| **Supabase**             | Logowanie (email/hasło) + baza       | Projekt cloud, klucze API, Site URL / Redirect URLs, e-maile potwierdzające     |
| **GitHub**               | Kod + CI; Deploy na tag `v*`         | Repo, sekrety Actions (`SUPABASE_*`, `CLOUDFLARE_*`); `/gh-release`             |
| **Domena (opcjonalnie)** | Własny adres zamiast `*.workers.dev` | Zakup domeny + DNS u Cloudflare lub u rejestratora                              |


---



## Legenda oznaczeń w planie

- `[ ]` — krok do wykonania
- **(RĘCZNE)** — robi człowiek w przeglądarce / panelu (opisane „dla nietechnicznych”)
- **(KOD / CLI)** — komendy w terminalu lub zmiana w repo
- **(AGENT OK)** — może wykonać agent z tokenem CI / lokalnym `wrangler`, bez decyzji billingowych
- **(EDGE)** — sytuacja awaryjna lub rzadka; dodatkowe kroki pomocnicze

---



## Faza 0 — Konta i dostęp (jednorazowo)

Cel: mieć konta, zanim cokolwiek wdrażamy.

### 0.1 Cloudflare **(RĘCZNE)**

- [x] Wejdź na [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
- [x] Załóż konto (e-mail + hasło) i potwierdź e-mail
- [x] Po zalogowaniu zapamiętaj, że menu aplikacji to **Workers & Pages** (nie „klasyczny” hosting stron)
- [x] Na start wystarczy plan **Free** (MVP: ok. 100k requestów/dzień). Upgrade do Paid (~$5/mies.) rozważamy dopiero przy błędach CPU / limitach (patrz Faza 9)

**Jak sprawdzić, że jesteś zalogowany:** w dashboardzie widzisz nazwę konta / Account Home.

### 0.2 Supabase **(RĘCZNE)**

- [x] Wejdź na [https://supabase.com/dashboard](https://supabase.com/dashboard) → Sign up
- [x] Załóż konto (GitHub lub e-mail)
- [x] Kliknij **New project**
  - **Name:** np. `book-your-miggets`
  - **Database password:** wygeneruj silne hasło i **zapisz je w menedżerze haseł** (nie wrzucaj do Gita)
  - **Region:** wybierz blisko użytkowników (np. EU / Frankfurt) — i tak OK przy Workers globalnych
- [x] Poczekaj, aż projekt się utworzy (zielony status)



### 0.3 GitHub **(RĘCZNE)**

- [x] Upewnij się, że masz konto na [https://github.com](https://github.com)
- [x] Repozytorium projektu jest na GitHubie (prywatne lub publiczne — dowolnie)
- [x] Masz prawo dodawać **Settings → Secrets and variables → Actions**



### 0.4 Narzędzia na komputerze **(RĘCZNE / CLI)**

- [x] Zainstalowany **Node.js 22.14.0** (w projekcie jest plik `.nvmrc`)
  - Jeśli używasz `nvm`: w katalogu projektu wpisz `nvm use`
- [x] Zainstalowane zależności: `npm install`
- [ ] Opcjonalnie Docker + lokalny Supabase — tylko do developmentu; produkcja używa Supabase Cloud

---



## Faza 1 — Przygotowanie projektu pod produkcję

Cel: nazwa Workera i lokalne sekrety zgodne z produkcją (bez wrzucania tajemnic do Gita).

### 1.1 Zmiana nazwy Workera **(KOD)**

Obecna nazwa w `wrangler.jsonc` to `10x-astro-starter`. Cloudflare wymaga spójności nazwy w dashboardzie i w pliku.

- [x] Zmień `"name"` w `wrangler.jsonc` na np. `book-your-miggets`
- [x] (Opcjonalnie) zsynchronizuj `"name"` w `package.json`
- [x] Upewnij się, że `"main"` to nadal `@astrojs/cloudflare/entrypoints/server`
- [x] Upewnij się, że jest `compatibility_flags: ["nodejs_compat"]`



### 1.2 Lokalne sekrety pod cloud Supabase **(RĘCZNE + pliki lokalne)**

Supabase rozdzielił „adres projektu” i „klucze” na różne ekrany. Klucze `anon` / `service_role` są oznaczone jako **Legacy** — na nowych projektach używaj **publishable** (zamiast anon).

**Skąd wziąć Project URL (adres projektu):**

Najprościej: w górze dashboardu projektu przycisk **Connect** — tam jest URL + gotowe wartości do wklejenia.

Albo ręcznie:
1. W ustawieniach projektu (koło zębate) → w lewej kolumnie **INTEGRATIONS** → **Data API**
2. Skopiuj **Project URL** (wygląda jak `https://xxxxx.supabase.co`)

**Skąd wziąć klucz (to, co masz na ekranie API Keys):**

1. **CONFIGURATION** → **API Keys**
2. Zostań na zakładce **Publishable and secret API keys** (nie Legacy)
3. Skopiuj **Publishable key** (`sb_publishable_...`) → to będzie `SUPABASE_KEY`
  - To zamiennik starego **anon** — bezpieczny do aplikacji przy włączonym RLS
  - **Nie** używaj **Secret key** (`sb_secret_...`) w tej aplikacji — to odpowiednik starego `service_role` (pełny dostęp, omija RLS)

*(Opcja awaryjna: zakładka **Legacy anon, service_role** → klucz `anon` też zadziała, ale publishable jest zalecanym wyborem.)*

**Co zrobić lokalnie:**

- [x] Skopiuj wzorzec: `cp .env.example .dev.vars` (jeśli plik już istnieje — tylko uzupełnij wartości)
- [x] Wpisz do `.dev.vars` (oraz opcjonalnie `.env`) wartości z panelu:

```text
SUPABASE_URL=https://TWOJ-PROJECT-REF.supabase.co
SUPABASE_KEY=sb_publishable_...
```

- [x] Sprawdź, że `.dev.vars` i `.env` **nie** są commitowane (są w `.gitignore`)



### 1.3 Migracje bazy (gdy pojawią się tabele) **(KOD / CLI)**

Starter na start używa głównie Auth. Gdy dodacie tabele MVP (runy, uczestnicy…):

- [ ] Pliki SQL w `supabase/migrations/` w formacie `YYYYMMDDHHmmss_opis.sql`
- [ ] Włącz RLS i polityki per operacja / rola
- [ ] Na produkcji: `npx supabase db push` (po `npx supabase link`) **albo** wklejenie migracji w SQL Editor w dashboardzie

**(EDGE)** Jeśli Auth działa, ale tworzenie runów pada z błędem uprawnień — najpierw sprawdź RLS w Supabase, nie Cloudflare.

---



## Faza 2 — Konfiguracja Auth w Supabase pod domenę produkcyjną

Cel: po rejestracji / potwierdzeniu e-maila użytkownik wraca na **Twoją** stronę, a nie na `localhost`.

### 2.1 Site URL i Redirect URLs **(RĘCZNE)**

Zrób to **po pierwszym deployu**, gdy znasz adres Workera (np. `https://book-your-miggets.TWOJA-SUBDOMENA.workers.dev`), albo od razu jeśli już masz docelową domenę.

W panelu Supabase:

1. **Authentication** → **URL Configuration**
2. **Site URL** ustaw na adres produkcji, np.:
  - `https://book-your-miggets.TWOJA-SUBDOMENA.workers.dev`  
  - albo później `https://bookyourmiggets.com`
3. W **Redirect URLs** dodaj m.in.:
  - `http://localhost:4321/**` (lokalny Astro — port może się różnić; sprawdź w terminalu po `npm run dev`)
  - `https://book-your-miggets.TWOJA-SUBDOMENA.workers.dev/**`
  - docelową domenę `https://twoja-domena.pl/**` (gdy będzie)

- [x] Site URL = produkcja (nie localhost) → [https://book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev)
- [x] Redirect URLs zawierają lokal + produkcję (+ preview, jeśli używasz)
  - `http://localhost:4321/**`
  - `https://book-your-miggets.bookyourmiggets.workers.dev/**`
- [ ] Po zmianie domeny **zaktualizuj** te pola ponownie

**(EDGE) Link z e-maila wraca na localhost**  
→ Site URL nadal wskazuje na localhost. Zmień Site URL na produkcję i wyślij nowy mail potwierdzający.

**(EDGE) „Redirect URL not allowed”**  
→ Dokładny adres z błędu dodaj do Redirect URLs (z `https://` i bez literówek).

### 2.2 Potwierdzanie e-maila **(RĘCZNE)**

- [x] Decyzja produktowa: czy w MVP wymagacie potwierdzenia e-maila?
  - **Tak (bezpieczniej):** zostaw włączone; użytkownik zobaczy `/auth/confirm-email` ← wybrane (`mailer_autoconfirm: false`)
  - **Nie (szybsze testy):** Authentication → Providers → Email → wyłącz „Confirm email”
- [x] Sprawdź skrzynkę **Spam** przy pierwszym signupie (domyślne maile Supabase bywają filtrowane)
- [ ] (Później, przed szerszym launchiem) rozważ własny SMTP w Supabase → Settings → Auth → SMTP



### 2.3 Checklist „Auth działa end-to-end”

- [x] Rejestracja nowego użytkownika
- [x] Potwierdzenie e-maila (jeśli włączone) → powrót na produkcyjny URL
- [x] Logowanie → dostęp do `/dashboard`
- [ ] Wylogowanie

---



## Faza 3 — Weryfikacja lokalna przed pierwszym deployem

Cel: złapać błędy workerd **zanim** pójdą na Cloudflare.

- [x] `nvm use` (Node 22.14.0)
- [x] `npm install`
- [x] `.dev.vars` wypełnione
- [x] `npm run lint`
- [x] `npm run build` (musi przejść z ustawionymi `SUPABASE_*`)
- [ ] `npm run preview` — krótki smoke test UI / logowania
- [ ] `npm run dev` — codzienna praca; w Astro 7 to już runtime Cloudflare (`workerd`), nie „zwykły Node”

**(EDGE) Pakiet npm działa lokalnie „na Node”, a pada na Workers**  
→ Testuj zawsze przez `astro dev` / `astro preview`. Unikaj natywnych addonów Node. Flaga `nodejs_compat` już jest włączona.

**(EDGE) Build w CI pada na brak sekretów**  
→ W GitHub → Settings → Secrets and variables → Actions dodaj `SUPABASE_URL` i `SUPABASE_KEY` (te same anon wartości co lokalnie). Workflow `.github/workflows/ci.yml` już ich używa przy `npm run build`.

- [x] Sekrety GitHub `SUPABASE_URL` + `SUPABASE_KEY` dodane (te same wartości co w `.dev.vars`)
- [x] Workflow CI nasłuchuje gałąź `main` (nie `master`)

---



## Faza 4 — Pierwszy deploy ręczny (smoke production)

Cel: jeden działający URL `*.workers.dev` bez CI.

### 4.1 Logowanie Wrangler do Cloudflare **(RĘCZNE + CLI)**

- [x] W katalogu projektu: `npx wrangler login`
- [x] Otworzy się przeglądarka — zatwierdź dostęp
- [x] Sprawdź: `npx wrangler whoami` (powinno pokazać konto)



### 4.2 Build i deploy **(CLI / AGENT OK)**

- [x] `npm run build`
- [x] Zarejestrowano account subdomain `workers.dev`: `bookyourmiggets` (API Cloudflare)
- [x] `npx wrangler deploy`
- [x] Zapisz wyświetlony URL Workera: [https://book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev)

> Nie używaj `wrangler pages deploy` ani UI „Pages project”.



### 4.3 Sekrety na Workerze (obowiązkowe) **(CLI)**

Lokalne `.dev.vars` **nie** trafiają automatycznie na produkcję.

- [x] `npx wrangler secret put SUPABASE_URL`  
  → wklej Project URL z Supabase i Enter
- [x] `npx wrangler secret put SUPABASE_KEY`  
  → wklej **anon** key i Enter
- [x] Sprawdź listę nazw (bez wartości): `npx wrangler secret list`

**(EDGE) Strona działa, ale logowanie mówi „Supabase is not configured”**  
→ Sekrety nie są ustawione albo mają złe nazwy. Ponów `secret put`. Potem odśwież stronę (czasem potrzeba chwili na propagację).

### 4.4 Smoke test na URL Workera

- [x] Strona główna się ładuje
- [x] Signup / signin działa
- [x] `/dashboard` bez sesji → przekierowanie na `/auth/signin`
- [ ] Przy błędzie: `npx wrangler tail --status error`

---



## Faza 5 — Domknięcie Supabase pod adres Workera

- [x] Uzupełnij **Site URL** i **Redirect URLs** adresem z Fazy 4 (patrz Faza 2)
- [x] Powtórz test rejestracji z prawdziwym mailem na produkcji
- [ ] (Opcjonalnie) osobny projekt Supabase na staging / preview, żeby preview nie psuł danych prod

---



## Faza 6 — CI/CD: deploy na tag `v*`

Cel: **CI na każdym PR / push do `main`**, produkcyjny **Deploy tylko po tagu `v*`** (żeby GitHub Release notes istniały w momencie wdrożenia). Merge do `main` **nie** deployuje.

Źródło prawdy dla agentów: `.github/agent-workflow.yml` (`cd_trigger: tag`, `cd_workflow: deploy.yml`) + skill `/gh-release`.

### Opcja A — GitHub Actions + `wrangler-action` (zalecana)



#### 6.A.1 Token API Cloudflare **(RĘCZNE)**

1. Wejdź na [https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token** → szablon **Edit Cloudflare Workers** (lub custom z uprawnieniami Workers Scripts:Edit + Account:Read)
3. Skopiuj token **raz** (potem go nie zobaczysz) → zapisz w menedżerze haseł
4. Account ID znajdziesz w Cloudflare Dashboard → prawy pasek / Overview konta (ciąg hex)

- [x] Token API utworzony programowo (`POST /user/tokens`, nazwa: `book-your-miggets-github-actions`) — uprawnienia: Workers Scripts Write, Workers KV Storage Write, Account Settings Read
- [x] Account ID: `563e04070fe593dcd94fbf3a76c63ab3`



#### 6.A.2 Sekrety w GitHub **(RĘCZNE)**

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:


| Secret                  | Skąd                    |
| ----------------------- | ----------------------- |
| `CLOUDFLARE_API_TOKEN`  | token z kroku wyżej     |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID z dashboardu |
| `SUPABASE_URL`          | Project URL             |
| `SUPABASE_KEY`          | anon key                |


- [x] `SUPABASE_URL` dodany
- [x] `SUPABASE_KEY` dodany
- [x] `CLOUDFLARE_API_TOKEN` dodany (token `book-your-miggets-github-actions`, utworzony przez API)
- [x] `CLOUDFLARE_ACCOUNT_ID` dodany
- [x] Fork PR **nie** powinny dostawać sekretów produkcyjnych (domyślne zachowanie GitHub dla secrets — nie zmieniaj lekkomyślnie)



#### 6.A.3 Workflow deploy **(KOD)**

- [x] CI uruchamia się na push/PR do `main` (lint + build; **bez** deployu) → `.github/workflows/ci.yml`
- [x] Deploy workflow → `.github/workflows/deploy.yml`, trigger: **`push` tags `v*`** (nie `branches: [main]`)
- [x] `cloudflare/wrangler-action@v3` z `apiToken` + `accountId`
- [x] Produkcja: agent `/gh-release` tworzy GitHub Release (notes) + tag → CD; `/gh-ship` tylko merge do `main`
- [x] Node w CI: **22** (jak w istniejącym workflow)

Trigger w `deploy.yml`:

```yaml
on:
  push:
    tags:
      - "v*"
```

Fragment kroku deploy:

```yaml
- uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: deploy
```

Sekrety Workera (`SUPABASE_*`) ustaw raz przez `wrangler secret put` (Faza 4) **albo** synchronizuj przez input `secrets:` w action — nie commituj wartości do YAML.

### Opcja B — Cloudflare Workers Builds (Git connected) **(RĘCZNE)**

1. Cloudflare Dashboard → **Workers & Pages** → wybierz Worker (nazwa = `name` z `wrangler.jsonc`)
2. **Settings** → **Builds** → **Connect** → GitHub → wybierz repo
3. Build: Node 22+, komenda build `npm run build`, deploy `npx wrangler deploy`
4. Dodaj zmienne/sekrety builda (`SUPABASE_*`) w ustawieniach Builds

> Jeśli używasz Opcji B **oraz** GitHub Actions na tagi, wyłącz jedną ścieżkę — inaczej podwójne deploje.

- [ ] Nazwa Workera w dashboardzie **=** `name` w `wrangler.jsonc` (inaczej build padnie)
- [ ] Preview URL chronione, jeśli wskazują na prod Supabase (osobny projekt Supabase lub Cloudflare Access)

**(EDGE) Astro 7 environments**  
Nie polegaj na samym `wrangler deploy --env staging` po buildzie. Od Astro 7 środowisko ustala się przy buildzie:

```bash
CLOUDFLARE_ENV=staging npm run build && npx wrangler deploy
```

---



## Faza 7 — Własna domena (opcjonalnie, ale zalecane przed launch społeczności)



### 7.1 Domenę masz / kupujesz **(RĘCZNE)**

- [ ] Kup domenę u rejestratora **albo** od razu w Cloudflare Registrar
- [ ] Najprostsza ścieżka DNS: przenieś DNS do Cloudflare (zmiana nameserverów u rejestratora według instrukcji Cloudflare)



### 7.2 Podpięcie domeny do Workera **(RĘCZNE)**

1. Workers & Pages → Twój Worker → **Settings** → **Domains & Routes**
2. **Add** → Custom Domain → wpisz domenę (np. `bookyourmiggets.com` lub `www.…`)
3. Poczekaj na aktywny status SSL (zwykle minuty, czasem dłużej)

- [ ] `https://twoja-domena` otwiera aplikację
- [ ] Zaktualizuj Supabase **Site URL** + **Redirect URLs** na nową domenę (Faza 2)
- [ ] Stary `*.workers.dev` możesz zostawić lub ograniczyć według potrzeby

**(EDGE) DNS „wisi” / brak SSL**  
→ Sprawdź nameservery u rejestratora (muszą być Cloudflare), poczekaj na propagację, unikaj mieszania starych rekordów A wskazujących gdzie indziej.

---



## Faza 8 — Operacje po wdrożeniu (runbook MVP)



### 8.1 Logi i obserwowalność

- [x] W `wrangler.jsonc` jest `"observability": { "enabled": true }` — OK
- [ ] Incydent: `npx wrangler tail --status error`
- [ ] Równolegle: Supabase → Logs (Auth / Postgres), gdy pada logowanie lub zapytania



### 8.2 Rollback kodu

- [ ] Zły release: `npx wrangler rollback` (lub z konkretnym VERSION_ID)
- [ ] **Pamiętaj:** rollback **nie cofa** wartości sekretów ani migracji Supabase

**(EDGE) Po rollbacku auth się wywalił**  
→ Ktoś rotował `SUPABASE_KEY` przy złym deployu. Sprawdź aktualny klucz w Supabase i ponów `wrangler secret put`. Nie rotuj sekretów w tym samym momencie co ryzykowny deploy.

### 8.3 Rotacja sekretów (gdy wyciek / zmiana klucza) **(RĘCZNE + CLI)**

1. W Supabase wygeneruj / skopiuj nowy klucz (lub zrotuj według docs)
2. `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` z nowymi wartościami
3. Zaktualizuj sekrety GitHub Actions
4. Sprawdź logowanie na produkcji
5. Dopiero potem unieważnij stary klucz (jeśli dotyczy)



### 8.4 Limity Free / Paid **(RĘCZNE — billing)**

- [ ] Przed większym ruchem społeczności KoG: obserwuj błędy 5xx / CPU
- [ ] Przy limitach Free (~~10 ms CPU / invoc. na Free): upgrade Workers Paid (~~$5/mies.) w dashboardzie Cloudflare
- [ ] Agent / CI **nie** powinien sam zmieniać planu płatności

---



## Faza 9 — Funkcje produktowe zależne od infrastruktury



### 9.1 Archiwizacja runów (FR-013)

PRD wymaga: 1 h po starcie → status in-progress, potem archiwum.

**MVP (zalecane na start):**

- [ ] Status archiwum wyliczany przy odczycie (porównanie czasu startu z „teraz”) — bez Crona

**Gdy potrzeba joba w tle:**

- [ ] Cloudflare **Cron Trigger** na Workerze (lub Queues) — dopiero gdy derived status nie wystarczy
- [ ] Cron to nie „zawsze włączony serwer” jak EC2 — zaplanuj idempotentny handler



### 9.2 Preview / staging

- [ ] Osobny Worker name **lub** `CLOUDFLARE_ENV=…` + osobny build
- [ ] Osobny projekt Supabase na preview (albo twarde reguły: preview tylko z Access)
- [ ] Nigdy nie wstrzykuj prod sekretów do buildów z forków

---



## Faza 10 — Definition of Done (checklista launch)

- [x] Worker o docelowej nazwie wdrożony na Cloudflare
- [x] `SUPABASE_URL` + `SUPABASE_KEY` (anon) ustawione jako sekrety Workera
- [x] Signup / signin / dashboard działa na [URL produkcji](https://book-your-miggets.bookyourmiggets.workers.dev)
- [x] Supabase Site URL + Redirect URLs wskazują produkcję (+ localhost do dev)
- [x] CI zielone na PR/`main`; produkcyjny deploy na tag `v*` (`.github/workflows/deploy.yml`) **albo** udokumentowany ręczny `wrangler deploy`
- [x] Wiadomo, jak zrobić rollback i gdzie oglądać logi (`wrangler rollback` / `wrangler tail`; Supabase Logs)
- [x] Zespół wie: **Workers ≠ Pages**; nie kopiujemy starych tutoriali Pages
- [ ] (Opcjonalnie) własna domena + zaktualizowane URL Auth
- [ ] (Opcjonalnie) plan Paid, jeśli Free zaczyna limituwać

---



## Szybki przewodnik „dla osoby nietechnicznej” — kolejność kliknięć

Zrób w tej kolejności, nic nie pomijając:

1. **Załóż Cloudflare** → [dash.cloudflare.com](https://dash.cloudflare.com/sign-up)
2. **Załóż Supabase** → nowy projekt → skopiuj URL i anon key
3. Poproś developera / agenta o wpisanie kluczy lokalnie i **pierwszy** `wrangler login` + `wrangler deploy`
4. Wklej sekrety na Cloudflare (`wrangler secret put` — developer)
5. W Supabase ustaw **Site URL** na adres z Cloudflare (np. [production URL](https://book-your-miggets.bookyourmiggets.workers.dev))
6. Przetestuj rejestrację na telefonie / drugim komputerze
7. Dodaj sekrety w GitHub (Cloudflare token + Supabase); produkcyjny deploy = tag `v*` (`/gh-release`), nie sam merge do `main`
8. (Później) podłącz własną domenę i znów popraw Site URL w Supabase

Jeśli coś nie działa: **najpierw** sprawdź sekrety Workera i Site URL w Supabase, **potem** logi (`wrangler tail` + Supabase Logs).

---



## Czego świadomie nie robimy w tym planie

- Migracji na Vercel/Netlify (wymagałaby zmiany adaptera) — backup w `infrastructure.md`, nie w MVP
- Docker-image / zawsze-on VM
- Multi-region HA / DR
- Wrzucania `service_role` do frontu lub Workera SSR użytkownika
- Deployu na **Cloudflare Pages**

---



## Odwołania

- Astro: [Deploy to Cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/), [@astrojs/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- Cloudflare: [Astro on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- Supabase: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- Lokalne decyzje: `context/foundation/infrastructure.md`, `context/foundation/tech-stack.md`
)

