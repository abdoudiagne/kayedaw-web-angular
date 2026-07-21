# KayeDaw Web — frontend Angular

Interface du carnet d'entraînement KayeDaw, connectée à l'API Kotlin / Spring Boot.
Comme le backend, ce projet est conçu comme un **support de préparation à un
entretien** : chaque notion Angular attendue est illustrée par du code réel et
annotée sur place.

## Démarrage

```bash
npm install
npm start        # http://localhost:4200 (proxy vers l'API sur :8080)
npm test         # tests unitaires Karma / Jasmine
npm run test:e2e # tests de bout en bout Playwright (backend requis)
npm run build    # build de production
```

Le backend doit tourner en parallèle :

```bash
cd ../kayedaw-api && mvn spring-boot:run
```

### Comptes de démonstration

Recréés à chaque démarrage du backend (base H2 en mémoire) par
`config/DonneesInitiales.kt` :

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

1. **En local** — `kayedaw-api/config/application.yml` (déjà en place, ignoré
   par git, non empaqueté dans le JAR). Spring Boot le lit automatiquement :
   `mvn spring-boot:run` suffit, aucun profil à activer.
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
| `seance.service.spec.ts` | URL, méthode, params, 422 | `HttpTestingController` |
| `auth.interceptor.spec.ts` | en-tête ajouté / absent / routes publiques | `HttpTestingController` |
| `auth.guard.spec.ts` | autorisation et redirection | `runInInjectionContext` |

Les pipes et validateurs se testent **sans TestBed** : ce sont des fonctions
pures, donc des tests en millisecondes. C'est la base de la pyramide côté front.

`httpMock.verify()` en fin de test échoue s'il reste une requête non consommée —
excellent garde-fou contre les appels involontaires.

---

## Ce qui manque pour un vrai produit

- **Internationalisation** (`@angular/localize`)
- **Refresh token** et rafraîchissement silencieux du JWT
- Un **store** (NgRx ou signal store) si l'état partagé se complexifie
- **Accessibilité** : audit complet au lecteur d'écran, pas seulement le focus
- **SSR** (`@angular/ssr`) si le référencement devient un enjeu
