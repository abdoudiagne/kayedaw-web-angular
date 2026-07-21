# KayeDaw Web — frontend Angular

Interface du carnet d'entraînement KayeDaw, connectée à l'API Kotlin / Spring Boot.
Comme le backend, ce projet est conçu comme un **support de préparation à un
entretien** : chaque notion Angular attendue est illustrée par du code réel et
annotée sur place.

## Démarrage

```bash
npm install
npm start        # http://localhost:4200 (proxy vers l'API sur :8080)
npm test         # 45 tests unitaires Karma / Jasmine
npm run test:ci  # même chose en un seul passage, ChromeHeadless
npm run test:e2e # 39 tests Playwright de bout en bout (backend requis)
npm run build    # build de production
```

> `npm run lint` est déclaré dans `package.json` mais **aucun linter n'est
> installé** (`@angular-eslint` est absent) : le script échoue. Le typage est
> vérifié par `npm run build`.

Le backend doit tourner en parallèle :

```bash
cd ../kayedaw-api-koltin && mvn spring-boot:run
```

### Comptes de démonstration

Recréés à chaque démarrage du backend (base H2 en mémoire) par
`config/DatasInitiales.kt` :

| Compte | Mot de passe | Rôle |
|--------|--------------|------|
| `admin@kayedaw.fr` | `12345` | ADMIN — accès à `/administration` |
| `user@kayedaw.fr` | `12345` | USER |

L'inscription publique force `Role.USER` : un ADMIN ne peut venir que de ce
seed, désactivé sur le profil `prod`.

Le fichier `proxy.conf.json` redirige `/api` vers `http://localhost:8080` — cela
évite tout problème de CORS en développement.

### Météo-France (optionnel)

Les séances passées sont enrichies avec les **observations officielles**
Météo-France (API DPClim) si le secret est fourni. Deux façons :

1. **En local** — `kayedaw-api-koltin/config/application.yml` (déjà en place,
   ignoré par git, non empaqueté dans le JAR). Spring Boot le lit
   automatiquement : `mvn spring-boot:run` suffit, aucun profil à activer.
2. **En production** — variable d'environnement, qui a la priorité :

```bash
export METEOFRANCE_APPLICATION_ID="<base64 de client_id:client_secret>"
```

Sans cette variable, l'application bascule automatiquement sur Open-Meteo :
aucune configuration n'est obligatoire. Les séances **planifiées** utilisent
toujours une prévision Open-Meteo — aucune observation n'existe encore.

## Écrans

| Route | Écran | Protection |
|-------|-------|-----------|
| `/connexion` | Connexion | invité uniquement |
| `/inscription` | Création de compte | invité uniquement |
| `/seances` | Liste paginée + filtre par type (séances planifiées signalées) | `authGuard` |
| `/seances/nouvelle` | Création / planification (date-heure, météo optionnelle) | `authGuard` |
| `/seances/:id` | Détail + suppression | `authGuard` |
| `/seances/:id/modifier` | Modification | `authGuard` |
| `/profil` | Profil : nom, e-mail, changement de mot de passe | `authGuard` |
| `/statistiques` | Indicateurs + répartition par type | `authGuard` |
| `/administration` | Utilisateurs + métriques de l'API | `authGuard` + `adminGuard` |

La racine `/` redirige vers `/connexion` si l'on n'est pas identifié, vers
`/seances` sinon — via un `redirectTo` **fonctionnel** (Angular 18+).

---

## Questions d'entretien → où c'est démontré

### Architecture Angular moderne

| Question | Fichier |
|----------|---------|
| Standalone components : pourquoi plus de NgModule ? | `main.ts`, `app.config.ts` |
| Lazy loading avec `loadComponent` | `app.routes.ts` |
| `inject()` vs injection par constructeur | tous les services |
| Nouvelle syntaxe `@if` / `@for` (Angular 17+) | `app.component.ts`, `seance-liste.component.ts` |
| `withComponentInputBinding()` | `seance-formulaire.component.ts` (`@Input() id`) |

**Standalone** : depuis Angular 15, un composant déclare lui-même ses
dépendances via `imports`. Plus de `AppModule`, plus de `declarations`. C'est
l'approche recommandée par défaut, et elle simplifie beaucoup le lazy loading.

### Signals et détection de changement

| Question | Fichier |
|----------|---------|
| Qu'est-ce qu'un signal ? | `auth.service.ts`, `notification.service.ts` |
| `computed` : signal dérivé | `auth.service.ts` (`estAdmin`, `initiales`), `statistiques.component.ts` |
| `toSignal` : Observable → signal | `seance-liste.component.ts` |
| Stratégie `OnPush` | tous les composants |

**La détection de changement** : par défaut, Angular revérifie tout l'arbre à
chaque événement. Avec `OnPush`, un composant n'est revérifié que si une
`@Input` change **par référence**, si un événement en émane, si le pipe `async`
émet, ou **si un signal lu dans le template change**. C'est le premier levier de
performance, et ça pousse à travailler avec des données immuables.

**Pourquoi les signals plutôt qu'un `BehaviorSubject`** pour l'état : lecture
synchrone, aucun désabonnement donc aucune fuite mémoire possible, et
recalcul automatique des valeurs dérivées. On garde les Observables pour
l'HTTP, où l'annulation et la composition ont du sens.

### RxJS

| Question | Fichier |
|----------|---------|
| `switchMap` vs `mergeMap` vs `concatMap` vs `exhaustMap` | `seance-liste.component.ts` |
| `debounceTime` + `distinctUntilChanged` | `seance-liste.component.ts` |
| `combineLatest` | `seance-liste.component.ts`, `statistiques.component.ts` |
| `catchError` placé au bon niveau | `seance-liste.component.ts`, `meteo.service.ts` |
| Comment éviter les fuites mémoire ? | `toSignal` (gère le cycle de vie) |

**`switchMap`** annule la requête précédente : c'est ce qu'il faut pour un
filtre ou une recherche. Sans annulation, une réponse lente peut écraser une
réponse plus récente. `mergeMap` parallélise, `concatMap` sérialise,
`exhaustMap` ignore les nouvelles émissions tant que la précédente n'est pas
finie (utile contre le double-clic sur un bouton d'envoi).

**Le placement de `catchError` est un piège classique** : placé sur le flux
extérieur, une erreur **termine** l'Observable et le composant ne réagit plus
jamais aux filtres. Il faut le placer **à l'intérieur** du `switchMap`, sur
l'appel HTTP — c'est ce qui est fait ici.

**Fuites mémoire — trois approches** : le pipe `async` (Angular désabonne
seul), `takeUntilDestroyed()` (Angular 16+), ou `takeUntil(this.destroy$)` avec
un Subject émis dans `ngOnDestroy`. `toSignal` fait le travail automatiquement.

### Formulaires

| Question | Fichier |
|----------|---------|
| Reactive Forms ou Template-driven ? | `connexion.component.ts` |
| Formulaires typés + `nonNullable` | tous les formulaires |
| Validateur personnalisé sur un champ | `seance.validators.ts` (`dansHorizonDePlanification`) |
| Validateur de **groupe** (champs croisés) | `seance.validators.ts` (`allurePlausible`), `inscription.component.ts` |
| Quand afficher une erreur ? | `champInvalide()` — après `dirty` ou `touched` |

**Reactive Forms** dans la quasi-totalité des cas : structure définie en
TypeScript, donc typée et testable sans DOM, adaptée aux validations complexes.
`nonNullable: true` évite les types `string | null` partout.

Les validateurs du front **doublent** ceux du backend, volontairement : le front
donne un retour immédiat, le backend reste la seule autorité.

### HTTP, sécurité, erreurs

| Question | Fichier |
|----------|---------|
| À quoi sert un intercepteur ? | `auth.interceptor.ts` |
| Intercepteur fonctionnel vs classe | `auth.interceptor.ts` (`HttpInterceptorFn`) |
| Gestion centralisée des erreurs | `erreur.interceptor.ts` |
| Qu'est-ce qu'un guard ? Est-ce de la sécurité ? | `auth.guard.ts`, `admin.guard.ts` |
| Où stocker le JWT ? | `auth.service.ts` — note de sécurité |

**Un guard n'est PAS de la sécurité** — c'est la réponse attendue. C'est du
confort utilisateur : on évite d'afficher un écran vide. N'importe qui peut
appeler l'API directement. La vraie sécurité est côté serveur (Spring Security,
`@PreAuthorize`, vérification de propriété des données).

**Stockage du jeton** : `localStorage` est vulnérable au XSS. L'alternative
robuste est un cookie `httpOnly` + `SameSite`, inaccessible au JavaScript, mais
qui impose de gérer le CSRF. Le choix est assumé ici pour la démo.

**L'ordre des intercepteurs compte** : ils s'exécutent dans l'ordre déclaré à
l'aller, et en ordre inverse au retour.

### Correspondance avec le backend Kotlin

Le type `MotifRefus` reproduit côté TypeScript la `sealed interface`
`ResultatCreationSeance` du backend. Le `@switch` du formulaire traite chaque
motif — c'est l'équivalent front du `when` exhaustif de Kotlin.

| Backend (Kotlin) | Frontend (TypeScript) |
|------------------|------------------------|
| `sealed interface ResultatCreationSeance` | `type MotifRefus = 'PLAFOND_HEBDOMADAIRE' \| 'DATE_TROP_LOINTAINE'` |
| `data class SeanceResponse` | `interface Seance` |
| `Page<SeanceResponse>` (Spring Data) | `interface Page<T>` |
| HTTP 422 + `RefusMetierResponse` | `@switch` sur `motif` dans le formulaire |
| HTTP 401 / 403 | `erreur.interceptor.ts` |

---

## Tests

| Fichier | Ce qui est testé | TestBed ? |
|---------|------------------|-----------|
| `allure.pipe.spec.ts` | formatage, arrondi à 60 s, valeurs nulles | non |
| `duree.pipe.spec.ts` | heures/minutes | non |
| `seance.validators.spec.ts` | date future, allure irréaliste | non |
| `auth.validators.spec.ts` | format d'e-mail, mots de passe triviaux, score de robustesse | non |
| `seance.service.spec.ts` | URL, méthode, params, 422 | `HttpTestingController` |
| `admin.service.spec.ts` | liste, métriques, propagation du 403 | `HttpTestingController` |
| `auth.interceptor.spec.ts` | en-tête ajouté / absent / routes publiques | `HttpTestingController` |
| `auth.guard.spec.ts` | autorisation et redirection | `runInInjectionContext` |

Soit **45 tests unitaires**.

Les pipes et validateurs se testent **sans TestBed** : ce sont des fonctions
pures, donc des tests en millisecondes. C'est la base de la pyramide côté front.

`httpMock.verify()` en fin de test échoue s'il reste une requête non consommée —
excellent garde-fou contre les appels involontaires.

### Bout en bout (Playwright)

39 tests dans `e2e/`, couvrant connexion, inscription, séances, statistiques,
administration et responsive.

```bash
npm run test:e2e                      # tous les projets
npx playwright test --project=mobile  # uniquement les tests @mobile
npm run test:e2e:ui                   # runner interactif
```

`playwright.config.ts` démarre `ng serve` lui-même (`reuseExistingServer`), mais
**le backend sur `:8080` est un prérequis qu'il ne peut pas démarrer** — il vit
dans l'autre dépôt.

Deux projets : `chromium` (bureau) et `mobile` (390 × 844, toujours Chromium — le
profil iPhone exige WebKit, 300 Mo de téléchargement sans bénéfice pour un
contrôle de débordement).

Trois partis pris qui expliquent la forme des tests :

- **La suite responsive vérifie une grandeur mesurable**, pas une impression
  esthétique : `document.scrollWidth <= clientWidth + 1`. Le débordement
  horizontal est le vrai défaut sur petit écran — c'est ainsi qu'un dépassement
  de 136 px a été détecté sur `/administration`.
- **L'état est préparé par l'API, pas par des clics** (`creerCompte`, `creerSeance`
  dans `e2e/aide.ts`) : construire l'état à la souris est lent et casse pour des
  raisons étrangères à ce que le test vérifie. Chaque test destructif
  d'administration travaille sur son propre compte fraîchement créé.
- **Aucune assertion sur une donnée modifiable** : le nom du compte de démo est
  éditable depuis `/profil`, les tests s'appuient donc sur l'e-mail.

`e2e/` est exclu de `tsconfig.json` — sans cela, `ng build` tente de compiler les
specs.

---

## Ce qui manque pour un vrai produit

- **Internationalisation** (`@angular/localize`)
- **Refresh token** et rafraîchissement silencieux du JWT
- Un **store** (NgRx ou signal store) si l'état partagé se complexifie
- **Accessibilité** : audit complet au lecteur d'écran, pas seulement le focus
- **SSR** (`@angular/ssr`) si le référencement devient un enjeu
