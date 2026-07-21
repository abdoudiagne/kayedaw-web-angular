# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                                   # ng serve on :4200 with proxy.conf.json
npm run build                               # production build (default configuration)
npm test                                    # Karma/Jasmine, watch mode
npm run test:ci                             # single run, ChromeHeadless
npx ng test --include='**/allure.pipe.spec.ts' --watch=false   # one spec file
```

`npm run lint` is declared in package.json but **no linter is installed** (`@angular-eslint` is absent) — the script fails. Don't rely on it; use `npx tsc --noEmit`-style checking via `npm run build` instead.

The app calls `/api/**`, which `proxy.conf.json` forwards to `http://localhost:8080`. The Kotlin/Spring backend lives at **`../kayedaw-api-kotlin`** and must be up or every screen shows "Serveur injoignable" — start it with `mvn spring-boot:run` (74 tests across 12 files). Both repos are published under `github.com/abdoudiagne` (`kayedaw-api-kotlin`, `kayedaw-web-angular`), branch `main`.

Demo accounts, seeded on every backend start by `config/DatasInitiales.kt` (H2 is in-memory, so they are recreated each run):

| Compte | Mot de passe | Rôle |
|--------|--------------|------|
| `admin@kayedaw.fr` | `12345` | ADMIN |
| `user@kayedaw.fr` | `12345` | USER |

Public registration always assigns `Role.USER` (`AuthService.kt`), so an ADMIN can only come from that seed. The seed is `@Profile("!prod")` — the password is in the repo.

## Language convention

**All code is in French** — identifiers, methods, route paths, models, comments. `seance`, `utilisateur`, `connexion`, `allure`, `deconnecter`, and even accented identifiers (`invitéGuard` in `core/guards/auth.guard.ts`). Match this when adding code; do not "translate" existing names.

## Purpose of the codebase

This is an **interview-preparation showcase**, not a product. Each file carries long pedagogical block comments (`┌─ QUESTION — … ─┐`) explaining *why* a given Angular mechanism was chosen and what trap it avoids. Those comments are the deliverable — preserve and extend them rather than trimming them for concision. README.md maps each interview question to the file that demonstrates it.

## Architecture

Angular 18, fully **standalone** — no NgModule anywhere. `main.ts` bootstraps `AppComponent` with `appConfig`.

- `src/app/app.config.ts` — providers. Interceptor order is significant and documented there: `authInterceptor` then `erreurInterceptor` (request order; response order is reversed). `withComponentInputBinding()` is enabled, so route params arrive as `@Input()` (see `@Input() id` in `seance-formulaire.component.ts`) — never subscribe to `ActivatedRoute` for a `:id`.
- `src/app/app.routes.ts` — every route is lazy via `loadComponent`. Guards chain (`[authGuard, adminGuard]`). The root and wildcard routes use a **function `redirectTo`** (Angular 18+) that injects `AuthService` to send guests to `/connexion` and members to `/seances` in a single navigation.
- `src/app/core/` — `guards/`, `interceptors/`, `models/`, `services/`. All services are `providedIn: 'root'`.
- `src/app/features/<domaine>/` — one standalone component per screen.
- `src/app/shared/` — `pipes/` (`allure`, `duree`), `validators/`.

**Components are single-file**: template and styles are inline in the `.ts`. There are no `.html`/`.css` files besides `src/index.html` and `src/styles.css`.

### Design system

`src/styles.css` holds the design tokens — brand colors sampled from `src/assets/logo.png` (marine `#0f4c81`, azur, turquoise, orange), surfaces, three shadow levels, radii, and `--degrade-marque`. **Never hardcode a hex in a component**; use the variables. Dark mode is automatic via `prefers-color-scheme` and only overrides token values, no layout rules.

Global primitives usable from any component's template: `.carte`, `.bouton` (+ `.fantome`), `.champ`, `.etiquette`, `.silence`, `.squelette`, `.sr-only`, and the `apparition` keyframes. Component styles stay scoped for everything else.

Assets live in `src/assets` (declared in `angular.json`): `logo.png` (header/login, downscaled to 560px), `favicon.png` and `apple-touch-icon.png` (cropped from the logo emblem with `sips`). The logo artwork is dark-on-light, so both places that render it put it on a white chip under `prefers-color-scheme: dark`.

### State model

Signals for application state, RxJS for HTTP. `AuthService` and `NotificationService` hold a private writable `signal` exposed via `.asReadonly()`, with `computed` derivations (`estConnecte`, `estAdmin`, `initiales`). Do not introduce `BehaviorSubject` for shared state. Observables stay in services returning `HttpClient` calls; components convert with `toSignal` (which handles unsubscription).

Every component uses `ChangeDetectionStrategy.OnPush`; signal updates must be immutable (`update(liste => [...liste, x])`), never in-place mutation.

### Séance scheduling model

A séance carries a full `dateHeure` (`LocalDateTime` back, `datetime-local` front), **not** a date — two sessions can share a day, and weather is resolved per hour. Sessions may be **planned up to 14 days ahead** (`kayedaw.entrainement.planification-max-jours`, mirrored front-side by `HORIZON_PLANIFICATION_JOURS` in `shared/validators/seance.validators.ts` — keep the two in sync).

Rules, deliberately asymmetric:
- A planned séance **counts toward the weekly 80 km cap** (catch over-planning early).
- A planned séance is **excluded from statistics** — `seancesDeLaPeriode` filters on `estPlanifiee()`, and the `volumeParType` JPQL takes a `maintenant` bound. Stats must reflect what was actually run.

### Weather sources

Three sources, picked in `EnrichissementMeteoService` and reported to the client via `sourceMeteo`:

| Case | Source | Value |
|------|--------|-------|
| Past séance, station available | `OBSERVATION_METEO_FRANCE` (DPClim) | real station observations + `temperatureALHeureC` at the séance hour |
| Past séance, DPClim unavailable | `ARCHIVE_OPEN_METEO` | reanalysis, daily aggregates only |
| Planned séance | `PREVISION_OPEN_METEO` | forecast (Open-Meteo, 16-day range) |

Open-Meteo's archive returns 400 on a future date, so the past/future branch in `MeteoClient.meteoDuJour` is load-bearing.

**Météo-France DPClim is order-then-poll**, not a plain REST call: `/liste-stations/horaire` → `/commande-station/horaire` (202 + command id) → `/commande/fichier` (201 ready / 204 not yet). The CSV is `;`-separated with **comma decimals** and mostly empty columns; `AnalyseurCsvDpclim` parses it. Wind comes in m/s and is converted to km/h.

Gotchas already paid for, do not regress them:
- The geocoder returns postcodes like `"69061 CEDEX 06"` — `departementDepuisCodePostal` takes leading digits only. Requiring an all-digit string silently broke Lyon, Marseille and every large city.
- Not every station has data every day. The client tries the 3 nearest stations before falling back (Toulouse's nearest station 404s).
- DPClim has its **own** 2.5 s budget inside the 5 s global one. Without it a slow DPClim chain consumed the whole budget and the séance came back with *no* weather and *no* city, discarding Open-Meteo results already in hand.

**Auth**: OAuth2 `client_credentials`. `JetonMeteoFranceService` caches the 1 h token, refreshes 5 min early, and serialises refreshes behind a `Mutex` with double-checked locking. The secret lives in **`kayedaw-api-kotlin/config/application.yml`** — Spring Boot reads `./config/` automatically with priority over the classpath, it is gitignored (via `/config/`, with a leading slash: without it the rule also swallowed the backend's `src/main/kotlin/com/kayedaw/config/` source package), and (unlike `src/main/resources`) it is **not packaged into the JAR**. `METEOFRANCE_APPLICATION_ID` still overrides it for production. Absent both, the integration disables itself and Open-Meteo takes over — the app runs fine either way, which is exactly how the fallback gets tested.

`Modèle_AROME_swagger.json` sits in the backend repo but is **unused**: AROME only exposes WMS/WCS raster (GRIB2/GeoTIFF), keeps ~5 days of runs, and is forecast-only — it cannot answer "what was the weather during my session".

### Error and business-rule contract with the backend

`core/models/seance.model.ts` mirrors the Kotlin API contract field-for-field — `Page<T>` is Spring Data's page, `MotifRefus` reproduces the `sealed interface ResultatCreationSeance`. **Changing a model here without the backend breaks the contract silently.**

Responsibility split for HTTP errors, enforced in `erreur.interceptor.ts`:
- `0 / 401 / 403 / 500` → handled globally (notification, session cleanup, redirect to `/connexion` with a `redirige` query param).
- `422` → deliberately left alone; the component renders the specific refusal via `@switch (motif.motif)` in `seance-formulaire.component.ts`. Motifs: `PLAFOND_HEBDOMADAIRE`, `DATE_TROP_LOINTAINE`.
- The interceptor always re-throws (`throwError`) so components stay free to react.

`meteo.service.ts` swallows its own errors (`catchError(() => of(null))`) — weather is a comfort feature and must never break a screen; the API returns 204 when unavailable.

Front-end validators in `shared/validators/seance.validators.ts` intentionally **duplicate** backend rules (immediate feedback); the backend remains the sole authority. Guards are UX, not security — the README and the guard comments make this point explicitly.

### RxJS conventions

`seance-liste.component.ts` is the reference: `combineLatest([filter$, page$])` → `switchMap` → HTTP, with `catchError` placed **inside** the `switchMap` so an error can't terminate the outer stream and freeze the filter. Keep that placement in any new stream. Filters use `debounceTime` + `distinctUntilChanged`.

## TypeScript settings that bite

`tsconfig.json` enables `strict`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `strictTemplates` + `strictInputAccessModifiers`. Forms use typed `FormControl` with `nonNullable: true` to avoid `string | null` everywhere.

## End-to-end tests (Playwright)

```bash
npm run test:e2e                      # all projects
npx playwright test --project=mobile  # responsive checks only (@mobile tag)
npm run test:e2e:ui                   # interactive runner
```

`playwright.config.ts` starts `ng serve` itself (`reuseExistingServer: true`), but **the backend on :8080 is a prerequisite it cannot start** — it lives in another repo.

Two projects: `chromium` (desktop) and `mobile` (390×844 viewport, still Chromium — the iPhone profile needs WebKit, a 300 MB download that buys nothing for overflow checks). Tests tagged `@mobile` run only on the mobile project.

The responsive suite asserts something **measurable** rather than aesthetic: `document.scrollWidth <= clientWidth + 1`. Horizontal overflow is the actual defect on small screens, and this caught `/administration` overflowing by 136 px.

E2E specs must not assert on **mutable** data — the demo account's name is editable from `/profil`, so tests key on the email instead. `e2e/` is excluded from `tsconfig.json`; without that, `ng build` tries to compile the specs.

Two setup patterns in `e2e/aide.ts`, both worth keeping:
- **Seed through the API, drive only the screen under test** (`creerCompte`, `creerSeance`). Building state by clicking is slow and fails for reasons unrelated to what a test checks. Destructive admin tests (promote, delete) each work on their **own** freshly-created account so they never touch the demo accounts or each other.
- **Unique per-test markers.** Admin tests search by a `Date.now()`-suffixed name so a search matches exactly one row regardless of accounts other tests left behind — a shared prefix returned 3 rows and broke the count assertion.
- The admin search is **debounced**: wait for `tbody tr` to reach the expected count before acting on a row, or you operate on the pre-filter row still on screen.
- The delete flow uses a native `confirm()`; register `page.once('dialog', d => d.accept())` before clicking, since Playwright dismisses dialogs by default.

## Testing

Karma + Jasmine. Pipes and validators are tested as pure functions **without TestBed** — keep them that way. Services and interceptors use `HttpTestingController` with `afterEach(() => httpMock.verify())`, which fails on any unconsumed request. Guards are tested through `runInInjectionContext`.
