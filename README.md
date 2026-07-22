# KayeDaw Web — frontend Angular

Interface du carnet d'entraînement KayeDaw, connectée à l'API Kotlin / Spring Boot.
Comme le backend, ce projet est conçu comme un **support de préparation à un
entretien** : chaque notion Angular attendue est illustrée par du code réel et
annotée sur place.

## Démarrage

```bash
npm install
npm start        # http://localhost:4200 (proxy vers l'API sur :8080)
npm test         # 48 tests unitaires Karma / Jasmine
npm run test:ci  # même chose en un seul passage, ChromeHeadless
npm run test:e2e # 96 tests Playwright de bout en bout (backend requis)
npm run build    # build de production
```

> **Node ≥ 24 requis** (Angular 21). Avec une version antérieure, `ng` refuse de
> démarrer sur une erreur de moteur peu explicite : `nvm use 26.3.0`.

> `npm run lint` est déclaré dans `package.json` mais **aucun linter n'est
> installé** (`@angular-eslint` est absent) : le script échoue. Le typage est
> vérifié par `npm run build`.

Le backend doit tourner en parallèle :

```bash
cd ../kayedaw-api-kotlin && mvn spring-boot:run
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

1. **En local** — `kayedaw-api-kotlin/config/application.yml` (déjà en place,
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
| `/` | **Accueil** — ce que fait l'application, ses chiffres, ses sources météo | aucune |
| `/a-propos` | **À propos** — la pile, les partis pris, le sort des données | aucune |
| `/connexion` | Connexion | invité uniquement |
| `/inscription` | Création de compte | invité uniquement |
| `/seances` | Liste paginée, filtres, tri, **export PDF** — sections *En cours*, *À venir*, *Réalisées* | `authGuard` |
| `/seances/nouvelle` | Création / planification jusqu'à 30 jours (date-heure, **pays et ville obligatoires**) | `authGuard` |
| `/seances/:id` | Détail + suppression | `authGuard` |
| `/seances/:id/modifier` | Modification | `authGuard` |
| `/profil` | Profil (avec **Annuler**), préférences (valeurs par défaut par type, thème, langue), mot de passe | `authGuard` |
| `/statistiques` | Indicateurs + répartition par type | `authGuard` |
| `/administration` | Comptes : tri, édition, blocage, suppression unitaire ou groupée, **export PDF** + métriques | `authGuard` + `adminGuard` |

L'écran d'arrivée après connexion dépend du **rôle** : `/administration` pour un
administrateur, `/seances` pour un membre. Un administrateur ne voit d'ailleurs
ni « Mes séances » ni « Statistiques » — son compte sert à administrer, un
carnet vide n'apprend rien.

La racine menait autrefois droit au formulaire de connexion : il fallait saisir
des identifiants avant même de savoir ce que fait l'application, et
l'argumentaire vivait *sur* l'écran de connexion, où il encombrait deux champs.
Il est passé sur `/`, et la connexion est redevenue un formulaire. Les chiffres
qu'affiche cette page sont **importés des constantes qui font foi** (plafond
hebdomadaire, horizon de planification, types de séance, référentiel des pays),
jamais recopiés : une vitrine qui annonce « 14 jours » quand le code en applique
30 est pire que muette, et personne ne pense à la relire en changeant une règle.
Un test e2e compare d'ailleurs l'affichage à ces constantes.

⚠️ **Ni `/` ni `/a-propos` n'ont de garde**, et c'est un revirement. L'accueil a
d'abord été réservé aux visiteurs, un compte ouvert y étant renvoyé vers son
propre écran. Mais « Accueil » et « À propos » figurent en permanence dans
l'en-tête : un lien qui rebondit ailleurs annonce une destination et en livre
une autre, sans jamais s'allumer comme lien actif. L'accueil **s'adapte donc à
la session** au lieu de se fermer — ses appels à l'action deviennent ceux du
rôle, car proposer « Créer un compte » à qui en a déjà un ne veut rien dire.

⚠️ Deux endroits décident de cet écran, et n'en corriger qu'un est un bug qui a
été livré : le `redirectTo` **fonctionnel** de la racine ne joue que si l'on
ouvre `/` avec une session déjà active. Une vraie connexion passe par
`connexion.component.ts`, qui navigue explicitement. Le paramètre `redirige`,
lui, prime sur les deux : y ramener l'utilisateur est tout l'objet du garde qui
l'a posé.

## Pile

**Angular 21 · PrimeNG 21 (thème Aura) · TypeScript 5.9 · RxJS 7 · Node ≥ 24.**

L'interface est entièrement bâtie sur PrimeNG. La montée en **version 22 est
volontairement écartée** : PrimeNG 22 embarque `@primeui/license-manager` et,
sans clé enregistrée, injecte en permanence un bandeau rouge « Invalid PrimeUI
License » dans un *shadow root* fermé que le CSS de la page ne peut pas
atteindre. Les versions 19 à 21 n'ont pas ce mécanisme. Y monter suppose donc
d'acheter une licence, pas de lancer `ng update`.

Deux arbitrages assumés, documentés dans le code :

- **`p-password` est un recul d'accessibilité** : son révélateur est une icône
  sans rôle ni nom accessible, hors de l'ordre de tabulation, là où
  l'implémentation maison était un `<button>` étiqueté.
- **Le champ date reste natif** (`datetime-local` habillé par `pInputText`) :
  `p-datepicker` lie un objet `Date` alors que ce contrôle porte une chaîne ISO
  locale envoyée telle quelle à l'API. Basculer imposerait de refaire la
  conversion de fuseau que deux tests protègent.

### Trois pièges PrimeNG déjà payés

- **`<p-button routerLink>` rend un `<button>`, pas un `<a>`.** Le clic milieu,
  l'ouverture dans un nouvel onglet et l'aperçu de la cible disparaissent, et un
  lecteur d'écran annonce « bouton » là où il attend « lien ». Les dix
  navigations de l'application utilisent donc `<a pButton>` : même apparence, la
  directive portant le style.
- **Les styles PrimeNG vivent dans une couche CSS de priorité inférieure**
  (`cssLayer`), ce qui permet au pont de jetons de `styles.scss` de l'emporter
  sans `!important`. Le revers : une règle aussi anodine que `a { color }` écrase
  le thème. Les libellés des boutons principaux se sont retrouvés azur sur fond
  azur, parfaitement illisibles — d'où les `a:not([pButton])` de `styles.scss` et
  de l'en-tête, qui sont *load-bearing* et non cosmétiques.
- **`p-autocomplete` ne met pas toujours une chaîne dans son contrôle**, malgré
  le type déclaré. Vider le champ y écrit `null` — son `updateModel()` traite
  toute valeur *falsy* comme « aucune sélection » — et **choisir une option y
  écrit l'objet suggestion entier**, `updateModel(option)` étant appelé avant
  l'émission de `onSelect`. Le champ affiche pourtant le bon libellé, ce qui
  rend le défaut invisible à l'œil.

  Deux dégâts constatés : une séance créée en choisissant sa ville dans la liste
  envoyait un objet là où l'API attend une chaîne, et un `.trim()` sur
  l'émission transitoire levait **dans un opérateur `map`** — ce qui *termine la
  souscription*. Le signal dérivé restait figé définitivement, et le bouton
  « Enregistrer » ne se réactivait plus jamais.

  ⚠️ `optionValue="nom"` semble corriger cela et casse pire : PrimeNG applique la
  même résolution à la chaîne tapée au clavier, qui devient `undefined`. La
  normalisation se fait donc côté composant, à chaque point de lecture — jusque
  dans le validateur, une exception dans un validateur laissant le formulaire
  dans un état incohérent.

---

## Organisation d'un composant

Trois fichiers côte à côte, comme le veut la convention Angular :

```
seance-liste.component.ts     logique, signaux, flux RxJS
seance-liste.component.html   gabarit
seance-liste.component.scss   styles encapsulés
```

Les styles sont en **SCSS** (`src/styles.scss` pour les jetons globaux), et
`angular.json` configure les schematics en conséquence : `ng generate component`
produit directement du SCSS.

Le projet a longtemps tenu chaque composant en un seul fichier. La séparation
n'a rien changé d'autre — si un commentaire évoque encore un gabarit « en
ligne », il est simplement périmé.

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
| `seance.validators.spec.ts` | horizon de planification, allure irréaliste, ville requise | non |
| `auth.validators.spec.ts` | format d'e-mail, score de robustesse | non |
| `seance.service.spec.ts` | URL, méthode, params, 422 | `HttpTestingController` |
| `admin.service.spec.ts` | liste, métriques, propagation du 403 | `HttpTestingController` |
| `auth.interceptor.spec.ts` | en-tête ajouté / absent / routes publiques | `HttpTestingController` |
| `auth.guard.spec.ts` | autorisation et redirection | `runInInjectionContext` |

Soit **48 tests unitaires**.

Les pipes et validateurs se testent **sans TestBed** : ce sont des fonctions
pures, donc des tests en millisecondes. C'est la base de la pyramide côté front.

`httpMock.verify()` en fin de test échoue s'il reste une requête non consommée —
excellent garde-fou contre les appels involontaires.

### Bout en bout (Playwright)

**96 tests** dans `e2e/`, répartis en neuf fichiers : `seances` (27),
`administration` (19), `accueil` (9), `connexion` (9), `inscription` (8),
`liste-filtres` (8), `preferences` (7), `statistiques` (5), `responsive` (4).
Les quatre tests `@mobile` tournant sur les deux projets, l'exécution complète
en compte **100**.

⚠️ **La suite vérifie ses prérequis avant de démarrer** (`e2e/prerequis.ts`).
Elle lit les identifiants de démonstration comme des constantes — mais
n'importe qui peut les changer en se servant de l'application, et la base étant
en mémoire, seul un redémarrage du backend les rétablit. Le cas s'est produit :
un mot de passe modifié à la main depuis le navigateur a rendu **vingt-cinq
tests** rouges, tous sur la même assertion d'URL, sans qu'un seul message ne
nomme la cause. Le contrôle les remplace par une phrase qui dit quoi faire.

Le plus utile du lot enchaîne **création à l'étranger, modification et
suppression sur une même séance**, dans l'ordre où un utilisateur les fait.
Testées séparément, les trois opérations passaient alors que l'enchaînement
cassait : c'est ce test qui a révélé que choisir une ville dans la liste
d'autocomplétion écrivait l'objet suggestion dans le contrôle, et non son nom.

C'est ici que se trouvent toutes les garanties d'interface : **aucun test
unitaire ne monte de composant**. C'est aussi pourquoi la migration vers PrimeNG
n'a modifié aucun test unitaire.

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
- **Chaque test qui écrit travaille sur son propre compte.** Le seul qui
  utilisait le compte de démonstration y accumulait des séances : dix
  exécutions plus tard, le plafond hebdomadaire de 80 km refusait la création
  et faisait échouer un test qui parlait d'autre chose.

Piloter PrimeNG en test demande des aides dédiées (`e2e/aide.ts`) — sans elles,
les échecs sont trompeurs :

| Contrôle | Piège |
|----------|-------|
| `p-inputnumber` | Intercepte la frappe : `fill()` est réécrit par le composant. **Et il suit la locale** — en `fr-FR` il attend une virgule, « 7.5 » devenait 75 |
| `p-select` | N'est pas un `<select>` : `selectOption()` ne s'applique pas |
| `p-confirmdialog` | Porte le rôle `alertdialog`, et l'hôte comme la boîte le portent |
| `p-paginator` | Aucun texte visible : ses boutons se visent par `aria-label` |
| `p-autocomplete` | Le contrôle reçoit **`null`** si on vide, l'**objet suggestion** si on choisit — voir plus bas |
| `.pleine-largeur` | Utilitaire **global** : une définition scopée `:host ::ng-deep` ne sert que son propre composant |

`e2e/` est exclu de `tsconfig.json` — sans cela, `ng build` tente de compiler les
specs.

**La suite se nettoie derrière elle.** Chaque test qui écrit crée son compte :
une exécution complète en laisse une quarantaine, et l'écran d'administration
devenait illisible au bout de quelques passes. Le `globalTeardown`
(`e2e/nettoyage.ts`) les efface par la suppression en masse de l'API, en ne
visant que le domaine `@exemple.fr` — réservé aux tests par la RFC 2606, donc
hors d'atteinte de tout compte réel, et les comptes de démonstration sont en
`@kayedaw.fr`. Il ne fait **jamais** échouer la suite : un backend déjà arrêté
ne doit pas transformer une exécution verte en rouge.

---

## Administration des comptes

Réservé au rôle ADMIN, protégé côté serveur par une règle d'URL **et** par
`@PreAuthorize` — le garde Angular n'est que du confort.

| Action | Ce qui la borne |
|---|---|
| Promouvoir / rétrograder | jamais soi-même, jamais le dernier administrateur |
| Modifier nom, ville, pays | l'**email n'est pas modifiable** : identifiant de connexion et clé unique |
| Réinitialiser le mot de passe | l'ancien n'est pas demandé — un administrateur ne le connaît pas |
| Bloquer / débloquer | jamais soi-même, jamais le dernier administrateur **actif** |
| Supprimer, seul ou en lot | jamais soi-même, jamais le dernier administrateur |

**Bloquer n'est pas supprimer.** Le blocage est réversible et conserve séances
et historique ; il pose `disabled` sur l'identité Spring Security — donc le
refus intervient *avant* la comparaison du mot de passe — et le filtre JWT
vérifie l'état à chaque requête, sans quoi un jeton déjà émis resterait valable
une heure et le blocage ne serait qu'un affichage. Un compte bloqué reçoit
**403**, pas 401 : l'identité est bonne, c'est l'accès qui est suspendu.

**La suppression en masse rend compte.** Elle répond 200 avec
`{ supprimes, refuses }` et non 204 : le résultat est partiel par nature, un
identifiant refusé n'empêchant pas les autres de partir. Son propre compte n'est
pas sélectionnable — le serveur le refuserait, et l'afficher comme sélectionné
mentirait sur ce qui va réellement disparaître.

**Le tri est fait par le serveur.** La table n'a qu'une page en mémoire : trier
localement classerait dix lignes sur quarante et donnerait un ordre faux dès la
deuxième page. Changer de tri **repart de la première page**, sinon on reçoit
une tranche arbitraire du nouvel ordre.

### Supprimer un compte efface-t-il tout ?

Oui, et c'est vérifié plutôt qu'affirmé. Le schéma ne compte que trois entités ;
`seance` et `preference_seance` portent `utilisateur_id` et partent avant le
compte. Les **statistiques n'ont rien à effacer** : elles sont calculées à la
volée depuis les séances.

Un test interroge `INFORMATION_SCHEMA` et compare les tables liées à
l'utilisateur à celles que la suppression traite : ajouter demain une table sans
compléter le nettoyage **fait échouer ce test**. Son déclenchement a été vérifié
en simulant une table oubliée — un garde qui ne se déclenche jamais ne garde
rien.

## Préférences utilisateur

`GET`/`PUT /api/profil/preferences` — des données **de compte**, pas de
navigateur : elles suivent l'utilisateur d'un appareil à l'autre.

- **Valeurs par défaut par type de séance** : le formulaire pré-remplit distance
  et durée au changement de type, mais **uniquement si le champ n'a jamais été
  touché**. Un raccourci qui efface une saisie devient un piège — c'est la
  non-régression la plus importante du lot, et elle est testée.
- **Thème** : Automatique / Clair / Sombre, en vignettes d'aperçu, appliqué
  avant l'enregistrement. « Automatique » est *résolu* en valeur concrète, car
  le `darkModeSelector` de PrimeNG est un sélecteur CSS et ne sait pas observer
  `prefers-color-scheme`.
- **Pays** : « France » par défaut, à côté de la ville de référence. Le défaut
  est posé **en base** et pas seulement en Kotlin — avec `ddl-auto: update`,
  ajouter une colonne `NOT NULL` à une table peuplée échoue sur les lignes
  existantes.
- **Langue** : bascule FR/EN par le widget Google Translate, sans fichier de
  traduction. Choix assumé, avec ses coûts mesurés : « Type » → « Kind »,
  « Recherche » → « Research », et les initiales « CE » rendues en « THIS » —
  d'où les `translate="no"` sur les données. Le pilotage passe par le cookie
  `googtrans`, le seul mécanisme que le widget lit ; chaque bascule **recharge
  la page**.

L'enregistrement est **automatique** (debounce + `switchMap`), sans bouton : un
réglage qu'il faut penser à valider est un réglage qu'on croit avoir posé.

## Météo : n'importe quelle ville, n'importe quel pays

Le géocodeur était verrouillé sur `countryCode=FR`. Conséquence : aucune ville
hors de France n'était trouvable, et une séance à Dakar ou à Thiès partait sans
ville *et* sans météo — sans message, puisque la météo est un confort qui ne
doit jamais casser un écran.

**Le pays appartient à la SÉANCE**, pas seulement au compte : on ne court pas
toujours chez soi. Un Français en déplacement à Dakar ne trouvait aucune ville
étrangère dans l'autocomplétion, et sa séance revenait sans météo — en silence,
puisque la météo est un confort qui ne casse jamais un écran. Le pays du compte
n'est plus qu'un **défaut**, celui du cas courant, qui n'exige aucune saisie ;
un client plus ancien qui ne l'envoie pas fonctionne exactement comme avant.

Il reste indispensable pour lever l'homonymie : sans lui, « Saint-Louis »
désigne aussi bien le Missouri que le Sénégal. Le référentiel des 249 pays est servi par l'API (`GET /api/meteo/pays`)
et non écrit en dur côté front — deux listes divergentes rendraient
sélectionnables des pays pour lesquels aucune ville ne serait trouvable.
Le champ est une **liste déroulante filtrable**, pas un texte libre : un pays
mal orthographié ne trouve rien, et la faute serait invisible.

Le rapprochement se fait sur le **code ISO** (`FR`, `SN`) plutôt que sur le nom,
le géocodeur ne répondant pas toujours dans la même langue que la saisie ; le
nom normalisé ne sert que de repli. Le **fuseau horaire** vient lui aussi de la
réponse du géocodeur : il était codé sur `Europe/Paris`, ce qui décalait de deux
heures la température « à l'heure de la séance » à Dakar.

**La météo est stockée à l'enregistrement**, pas recalculée à l'affichage. Une
observation passée ne change plus, et une séance de l'an dernier resterait sans
mesure le jour où l'API tierce est indisponible ou change de contrat.

À l'écran, **le pays précède la ville**, sur le formulaire de séance comme au
profil et à l'inscription : c'est lui qui borne les suggestions, il vient donc
avant celle qu'il commande. Changer de pays vide la ville sur le formulaire de
séance — une paire saisie pour une sortie donnée — mais **pas au profil**, où
c'est une donnée de référence qu'on édite : corriger un pays erroné sur une
ville juste est plausible, et l'effacement y détruisait une valeur correcte en
créant une impasse muette.

C'est aussi ce qui rend **pays et ville obligatoires à la création** — et eux
seuls parmi les champs qui pourraient sembler accessoires. La météo est résolue puis figée
au moment de l'enregistrement, et l'écran de modification n'offre pas le champ
ville : une séance créée sans lieu reste définitivement sans température, sans
vent et sans pluie, alors qu'une distance fautive se corrige en dix secondes. Le
bouton « Enregistrer » est donc inactif tant que le lieu est incomplet, avec le
motif écrit à côté : un bouton désactivé ne prend pas le focus, un lecteur
d'écran ne le rencontrerait jamais en tabulant.

**Et la ville doit EXISTER dans le pays choisi**, pas seulement être non vide.
Le cas s'est produit : « Dakar » saisi avec le pays resté sur France. Aucune
suggestion — la liste est bornée au pays — la frappe libre acceptée, et la
séance serait partie sans météo pour toujours, sans un mot. L'écran le dit
maintenant : « *« Dakar » est introuvable en France* », et corriger le pays
suffit à lever le refus.

⚠️ **Une panne du géocodeur ne bloque personne.** La vérification distingue
trois états — connue, inconnue, et *service muet*. Confondre les deux derniers
transformerait une indisponibilité en erreur de saisie et retiendrait en otage
une ville pourtant juste : l'indécision vaut acceptation.

**Changer de pays vide la ville**, sur tous les écrans : une ville appartient à
son pays.

Le pays est **stocké sur la séance** et affiché dans la liste comme sur le
détail — systématiquement, et non « seulement s'il diffère du profil » : le
masquer ferait dépendre l'affichage d'une donnée de compte modifiable.

## Export PDF

Deux boutons, un sur `/seances` et un sur `/administration`. Le fichier est
**généré par le serveur** : l'autorisation y est déjà, les données aussi, et le
document ne dépend ni du navigateur ni de sa configuration d'impression.
L'export porte sur **tout** le carnet, jamais sur la page affichée ni sur les
filtres en cours — un document dont le contenu dépend de l'état de l'écran au
moment du clic est impossible à relire six mois plus tard.

⚠️ Un simple `<a download>` ne pouvait pas fonctionner : le jeton n'est posé
sur la requête que par l'intercepteur, et une navigation déclenchée par le
navigateur ne passe pas par `HttpClient` — elle serait partie sans en-tête
`Authorization`. Le fichier transite donc par un `blob`, avec libération de
l'URL objet derrière lui.

## Réglages d'affichage dans l'en-tête

Thème et langue sont **à portée de tous**, connecté ou non, tout à droite de la
barre. Ils vivaient dans les préférences du compte, sur `/profil` :
inaccessibles à un visiteur, et à trois clics pour les autres. Lire une page en
plein soleil ou dans le noir ne demande pourtant pas de créer un compte.

Le réglage est mémorisé **dans le navigateur toujours** — seule mémoire d'un
visiteur — et **dans le compte s'il y en a un**, pour suivre d'un appareil à
l'autre. Les déclencheurs sont réduits à une icône ; les options gardent leur
libellé, une liste de pictogrammes nus étant indéchiffrable au moment de
choisir. Le globe de la langue est constant : aucune icône ne distingue
honnêtement deux langues, un drapeau désigne un pays.

## Ce que le géocodeur sait faire, et ce qu'il ne sait pas

Deux limites mesurées, à connaître avant de croire à un bug :

- **Il cherche par RESSEMBLANCE, pas par préfixe**, et pénalise l'écart de
  longueur. Au Sénégal, « bamb » rend Banba, Bamba et Mbamb — tous de cinq
  lettres — mais **jamais** Bambilor, qui n'apparaît qu'à « bambi ». Ce n'est
  pas nous qui tronquons : à `count=100` et sans filtre de pays, Bambilor est
  absent des cent résultats. Nominatim, essayé en comparaison, fait pire. Rien
  côté client ne peut le rattraper — l'écran affiche donc « continuez à
  saisir » plutôt qu'une liste vide, qui se lirait « cette ville n'existe pas ».
- **Il classe MONDIALEMENT avant de tronquer, puis filtre par pays.** Une
  commune modeste est évincée par ses homonymes plus peuplés bien avant que son
  pays n'entre en jeu, d'où une profondeur de recherche portée au maximum
  accepté (100). Les grandes villes restent en tête : « dak » rend toujours
  Dakar en premier.

**Le filtre par pays, lui, est étanche** — vérifié sur sept préfixes en
recoupant chaque suggestion avec le pays réel : aucune ne vient d'ailleurs. Ce
qui manquait était la **lisibilité** : hors de France le repère venait du code
postal français, donc de nulle part, et la liste n'affichait que des noms nus
qu'on pouvait prendre pour du bruit. Chaque suggestion porte désormais sa
région administrative — `Banba · Tambacounda`.

## Dates en français

`LOCALE_ID` vaut « en-US » par défaut, quelle que soit la langue du système ou
l'attribut `lang` de la page : le détail d'une séance affichait « Wednesday 22
July 2026 » au milieu d'une interface entièrement francophone. Il faut **deux**
gestes, `registerLocaleData(localeFr, 'fr-FR')` et le provider `LOCALE_ID` —
fournir le second sans le premier lève « Missing locale data » à la première
date affichée.

## Inscription et mot de passe

**L'inscription n'ouvre pas de session.** Le jeton renvoyé par l'API est
délibérément ignoré côté front : l'utilisateur repasse par l'écran de connexion
avec un message de confirmation. Saisir soi-même les identifiants qu'on vient de
choisir les ancre et vérifie tout de suite qu'ils fonctionnent ; sur un poste
partagé, une inscription faite pour quelqu'un d'autre n'ouvre pas sa session à
son insu. Le contrat de l'API n'a pas changé — elle renvoie toujours un jeton,
dont les tests se servent pour préparer un compte sans passer par l'écran.

**Le minimum est de 5 caractères**, aligné front et serveur. Il valait 5 d'un
côté et 8 de l'autre : un mot de passe de 5 à 7 caractères passait la validation
à l'écran puis se faisait refuser par l'API — c'était l'origine d'un « La
création du compte a échoué » sans cause visible. Il n'y a **pas** de liste de
mots de passe courants.

**Les refus du serveur sont affichés tels quels.** Tout ce qui n'était pas un
409 produisait un message passe-partout : l'utilisateur constatait l'échec sans
savoir quoi corriger, alors que l'API le disait précisément. Deux contrôles
manquaient d'ailleurs côté serveur et ont été ajoutés — un nom de 300 caractères
renvoyait un **500** (débordement de colonne) au lieu d'un 400.

## Ce qui manque pour un vrai produit

- **Internationalisation réelle** (`@angular/localize`) à la place du widget
- **Refresh token** et rafraîchissement silencieux du JWT
- Un **store** (NgRx ou signal store) si l'état partagé se complexifie
- **Accessibilité** : audit complet au lecteur d'écran, pas seulement le focus
- **SSR** (`@angular/ssr`) si le référencement devient un enjeu
