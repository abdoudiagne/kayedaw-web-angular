# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                                   # ng serve on :4200 with proxy.conf.json
npm run build                               # production build (default configuration)
npm test                                    # Karma/Jasmine, watch mode
npm run test:ci                             # 48 unit tests, single run, ChromeHeadless
npm run test:e2e                            # 96 Playwright tests, 100 runs (backend required)
npx ng test --include='**/allure.pipe.spec.ts' --watch=false   # one spec file
```

**Node ≥ 24 is required** (Angular 21). `nvm use 26.3.0` if the shell is older —
`ng` refuses to run otherwise, with an engine error rather than a useful message.

`npm run lint` is declared in package.json but **no linter is installed** (`@angular-eslint` is absent) — the script fails. Don't rely on it; use `npx tsc --noEmit`-style checking via `npm run build` instead.

The app calls `/api/**`, which `proxy.conf.json` forwards to `http://localhost:8080`. The Kotlin/Spring backend lives at **`../kayedaw-api-kotlin`** and must be up or every screen shows "Serveur injoignable" — start it with `mvn spring-boot:run` (103 tests across 16 files).

⚠️ **Redémarrer le backend remet les comptes de démonstration à leur mot de passe d'origine** — la base est en mémoire. C'est le remède quand la suite e2e échoue en masse sur la connexion. Both repos are published under `github.com/abdoudiagne` (`kayedaw-api-kotlin`, `kayedaw-web-angular`), branch `main`.

⚠️ Le dossier local et toute la documentation disent `kayedaw-api-kotlin`, mais le **remote git du backend pointe encore sur `kayedaw-api-koltin`** — l'ancienne faute de frappe. Le dépôt GitHub n'a pas été renommé : le faire, puis mettre l'URL locale à jour, sont deux gestes qui restent à poser. Ne pas « corriger » l'URL avant le renommage GitHub, les `push` casseraient.

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

## Pile

**Angular 22 est écarté**, comme **PrimeNG 22** : la version 22 de PrimeNG embarque `@primeui/license-manager`, et sans clé enregistrée deux points d'appel injectent un bandeau rouge « Invalid PrimeUI License » dans un **shadow root fermé** (impossible à masquer depuis le CSS de la page, `z-index: 2147483647`, id volontairement obscur). Les versions 19, 20 et 21 n'ont pas ce mécanisme. La pile est donc figée à **Angular 21 + PrimeNG 21**. Node ≥ 24 requis.

Monter en 22 n'est plus une mise à jour mais un achat de licence : à ne faire qu'avec une clé PrimeUI, passée dans `providePrimeNG({ license })`.

### PrimeNG

Thème **Aura** en mode styled (`providePrimeNG` dans `app.config.ts`), aucun fichier de thème dans `angular.json` — seul `primeicons.css` y est déclaré.

- `darkModeSelector: '[data-theme="sombre"]'` — et c'est pour cela que `PreferencesService` **résout** « Automatique » en `clair`/`sombre` au lieu de retirer l'attribut : le sélecteur de PrimeNG est du CSS, il ne sait pas observer `prefers-color-scheme`. Sans cette résolution, les champs PrimeNG restaient blancs sur une page sombre.
- `cssLayer: { name: 'primeng' }` — les styles PrimeNG vivent dans une couche de priorité inférieure, donc le pont de jetons de `styles.css` (`--p-form-field-background`, `--p-content-background`, `--p-primary-color`…) l'emporte **sans `!important`**. Ce pont existe parce qu'Aura sombre pose des surfaces presque noires, illisibles à côté du bleu marine de la marque.
- `translation.aria` porte les libellés du paginateur : ce sont des `aria-label`, invisibles à l'écran mais lus par les lecteurs d'écran et visés par les tests.

**Régression assumée** : `p-password` rend son révélateur en simple icône, sans rôle ni nom accessible et hors ordre de tabulation, là où l'implémentation maison était un `<button>` étiqueté. Documenté dans `connexion.component.ts` et dans le test correspondant.

**Seul contrôle resté natif** : `datetime-local` du formulaire de séance, habillé par `pInputText`. `p-datepicker` lie un objet `Date` alors que ce contrôle porte une chaîne ISO locale envoyée telle quelle à l'API ; basculer imposerait de refaire la conversion de fuseau que `maintenantLocalISO()` documente et que deux tests protègent.

### Piloter PrimeNG depuis les tests e2e

Les aides sont dans `e2e/aide.ts` — sans elles, les tests échouent de façon trompeuse :

- `saisirNombre` / `saisirNombreDans` : `p-inputnumber` intercepte la frappe, un `fill()` se fait réécrire par le composant. **Et il suit la locale** : en `fr-FR`, il attend une VIRGULE — taper « 7.5 » produisait 75, rendait l'allure irréaliste et faisait échouer le test trois assertions plus loin.
- `choisirDansSelect` : `p-select` n'est pas un `<select>`, `selectOption()` ne s'y applique pas.
- La boîte de confirmation porte le rôle **`alertdialog`**, pas `dialog`, et l'hôte comme la boîte le portent — d'où `.last()`.
- Le paginateur n'a pas de texte visible : ses boutons se visent par `aria-label` (« Page suivante »).

### Autocomplétion des villes — deux pièges non évidents

- ⚠️ **La clé de déduplication doit porter le PAYS, pas seulement le terme.** `distinctUntilChanged()` posé sur le seul texte saisi a produit un défaut signalé en usage : taper « Bambilor » avec le pays sur France (rien), corriger le pays en Sénégal, retaper le MÊME mot — et toujours rien, l'opérateur écartant un terme identique au précédent. Le même mot sous un autre pays est une autre question. Corrigé dans `seance-formulaire.component.ts` **et** `inscription.component.ts` ; `profil.component.ts` appelle le service directement et n'était pas touché.
- ⚠️ **Le géocodeur cherche par RESSEMBLANCE, pas par préfixe**, et pénalise l'écart de longueur. Mesuré au Sénégal : « bamb » rend Banba, Bamba, Mbamb — tous de cinq lettres — et **jamais** Bambilor, qui n'apparaît qu'à « bambi ». Ce n'est pas une troncature de notre côté : à `count=100` et sans filtre de pays, Bambilor est absent des cent résultats. Nominatim, essayé en comparaison, fait pire. **Rien côté client ne peut le rattraper** — d'où le message « continuez à saisir » plutôt qu'une liste vide, qui se lirait « cette ville n'existe pas ».

### Réglages d'affichage dans l'en-tête

Thème et langue vivaient dans les préférences du COMPTE, sur `/profil` : inaccessibles sans session, et à trois clics pour les autres. Ils sont désormais dans l'en-tête, **tout à droite, après les actions de compte**, connecté ou non — deux listes réduites à leur icône (les options gardent leur libellé : une liste de pictogrammes nus serait indéchiffrable au moment de choisir).

Deux niveaux de persistance, dans cet ordre : le **navigateur toujours** (seule mémoire d'un visiteur), puis le **compte si une session existe**, pour que le réglage suive d'un appareil à l'autre.

⚠️ `PreferencesService.persisterAuCompteSiConnecte` **n'injecte pas `AuthService`** : celui-ci appelle déjà le service à la déconnexion, le cycle serait immédiat. L'absence de session se reconnaît à l'absence de préférences chargées.

⚠️ **Défaut corrigé, facile à réintroduire** : `oublier()` effaçait la clé `kayedaw.theme` du navigateur. Or l'effet d'`app.component` l'appelle à chaque rendu **sans session**, donc à chaque chargement de page pour un visiteur : le thème choisi était appliqué, mémorisé… puis effacé au rechargement suivant. Le réglage semblait ne pas tenir. Un thème n'est pas une donnée confidentielle : la mémoire locale survit maintenant à la déconnexion.

⚠️ **L'ordre compte au changement de langue** : `TraductionService.appliquer` RECHARGE la page, ce qui annulerait une requête partie après lui. On persiste d'abord, sans attendre la réponse.

### Export PDF

`core/services/telechargement.ts`. ⚠️ Un simple `<a href="/api/…/export.pdf" download>` ne peut pas marcher : le jeton vit dans `localStorage` et n'est posé que par `authInterceptor`, or une navigation déclenchée par le navigateur ne passe pas par `HttpClient` — elle partirait sans `Authorization` et recevrait un 401. Le fichier est donc récupéré en `blob`, puis le téléchargement fabriqué à la main. `revokeObjectURL` n'est pas optionnel : sans lui chaque export retient son blob jusqu'à la fermeture de l'onglet.

Le test e2e attend l'événement `download` : c'est la seule preuve qu'un FICHIER est parti. Vérifier le bouton, ou même l'appel réseau, ne dirait rien du résultat.

### Trois pièges PrimeNG structurels, hors tests

- **`<p-button routerLink>` rend un `<button>`, pas un `<a>`** : plus de clic milieu, plus d'ouverture dans un nouvel onglet, plus d'aperçu de la cible, et « bouton » annoncé là où un lecteur d'écran attend « lien ». Les dix navigations de l'application sont donc des `<a pButton>`. ⚠️ Corollaire : `styles.scss` et `app.component.scss` doivent **exclure** ces ancres de leurs règles de lien (`a:not([pButton])`). Ces règles vivent hors couche CSS et écrasent le thème PrimeNG (cf. `cssLayer`) : sans l'exclusion, les libellés des boutons principaux s'affichaient azur sur fond azur, illisibles.
- **`p-autocomplete` ne met PAS toujours une chaîne dans son contrôle**, malgré le type. Deux cas distincts, tous deux payés :
  - **champ vidé → `null`**, jamais `''` : `updateModel()` traite toute valeur FALSY comme « aucune sélection » ;
  - **option choisie → l'OBJET suggestion entier**. `onOptionSelect` appelle `updateModel(option)` **avant** d'émettre `onSelect`, et `getOptionValue()` renvoie l'objet faute de `.value` dessus. Le champ affiche le bon libellé (via `optionLabel`), mais tout ce qui LIT le contrôle voit passer l'objet.

  `nonNullable` ne protège de rien : TypeScript type le contrôle `string` et ne voit pas ce qu'un composant tiers y écrit. Conséquences réelles constatées : une séance créée en choisissant sa ville dans la liste envoyait un objet là où l'API attend une chaîne, et surtout un `.trim()` sur l'émission transitoire levait **à l'intérieur d'un opérateur `map`** — ce qui **termine la souscription**. Le signal dérivé restait figé DÉFINITIVEMENT et le bouton « Enregistrer » ne se réactivait plus jamais.

  ⚠️ **`optionValue="nom"` n'est PAS la solution** : PrimeNG applique la même résolution à la chaîne tapée au clavier, qui devient `undefined` — le champ se vide à chaque frappe. La normalisation se fait côté composant (`nomDeVille()` dans `seance-formulaire.component.ts`), à chaque point de lecture : `valueChanges`, aperçu météo, envoi, et jusque dans le validateur.

## Architecture

Angular 21, fully **standalone** — no NgModule anywhere. `main.ts` bootstraps `AppComponent` with `appConfig`. Since Angular 19 `standalone: true` is implicit and no longer written.

- `src/app/app.config.ts` — providers. Interceptor order is significant and documented there: `authInterceptor` then `erreurInterceptor` (request order; response order is reversed). `withComponentInputBinding()` is enabled, so route params arrive as `@Input()` (see `@Input() id` in `seance-formulaire.component.ts`) — never subscribe to `ActivatedRoute` for a `:id`.
- `src/app/app.routes.ts` — every route is lazy via `loadComponent`. Guards chain (`[authGuard, adminGuard]`).

**La racine `''` est une page d'accueil publique** (`features/accueil/`), et `/a-propos` la carte d'identité technique. ⚠️ **Ni l'une ni l'autre n'a de garde**, et c'est un revirement assumé : l'accueil a d'abord été réservé aux visiteurs par `invitéGuard`, mais « Accueil » et « À propos » figurent en permanence dans l'en-tête, connecté ou non. Un lien qui rebondit ailleurs est un lien MENTEUR — il annonce une destination, en livre une autre, et ne s'allume jamais en `routerLinkActive` puisque l'URL finale n'est pas la sienne.

L'accueil **s'adapte à la session** plutôt que de se fermer : ses appels à l'action deviennent ceux du rôle (membre → « Mes séances » + « Nouvelle séance », admin → « Administrer les comptes », visiteur → les deux portes d'entrée). `invitéGuard` sert toujours pour `/connexion` et `/inscription`, et la route générique `**` garde son `redirectTo` fonctionnel.

⚠️ `routerLinkActive` sur « Accueil » exige `[routerLinkActiveOptions]="{ exact: true }"` : `/` étant préfixe de toute URL, le lien resterait allumé sur chaque écran.

⚠️ Les chiffres de cette page sont **importés des constantes qui font foi** (`PLAFOND_HEBDO_KM`, `HORIZON_PLANIFICATION_JOURS`, `TYPES_SEANCE`, `PaysService`), jamais recopiés — une vitrine qui annonce une règle périmée ment, et personne ne pense à la relire. `e2e/accueil.spec.ts` compare l'affichage à ces constantes.

⚠️ **Two places decide the landing screen**, and forgetting the second is a bug that was shipped: the wildcard `redirectTo` only fires on an unknown URL. A real sign-in goes through `connexion.component.ts`, which navigates explicitly — its fallback is role-aware too, and reads `reponse.role` (the server's answer, already at hand) rather than `auth.estAdmin()`. The `redirige` query param, when present, wins over both: bringing the user back to the page the guard interrupted is the whole point of that param.

An **admin sees neither Mes séances nor Statistiques** in the navigation: the account exists to administer, and an empty log with zero statistics informs nobody. The routes stay reachable by URL — this is ergonomics, not a security rule (guards never are). En revanche **« Accueil » et « À propos » sont présents dans TOUS les cas**, connecté ou non : ce sont les deux seules pages sans garde.
- `src/app/core/` — `guards/`, `interceptors/`, `models/`, `services/`. All services are `providedIn: 'root'`.
- `src/app/features/<domaine>/` — one standalone component per screen.
- `src/app/shared/` — `pipes/` (`allure`, `duree`), `validators/`.

**Three files per component**: `x.component.ts`, `x.component.html`, `x.component.scss`, side by side, wired with `templateUrl` / `styleUrl`. The project was single-file until this split; nothing else changed, so any comment still referring to an inline template is stale.

Styles are **SCSS** (`src/styles.scss` globally). `angular.json` sets `schematics.@schematics/angular:component.style = "scss"`, so `ng generate component` produces SCSS without a flag. The extracted files are plain CSS syntactically — SCSS is a superset, nothing had to be rewritten.

⚠️ The backtick trap disappears with the split: a template in its own `.html` can contain backticks freely. Only what remains **inline in a `.ts`** (there is none today) would still be affected.

### Design system

`src/styles.scss` holds the design tokens — brand colors sampled from `src/assets/logo.png` (marine `#0f4c81`, azur, turquoise, orange), surfaces, three shadow levels, radii, and `--degrade-marque`. **Never hardcode a hex in a component**; use the variables.

⚠️ The hand-built primitives `.bouton`, `.champ` and `.squelette` are **gone** — PrimeNG replaced them. What remains global: `.carte`, `.etiquette`, `.silence`, `.sr-only`, the `apparition` keyframes, and the `.etiquette-type` / `.etiquette-role` badges. The **pastille tokens** (`--pastille-azur-texte`…) exist because brand colors do not survive on their own translucent background: `--azur` gives 3.9:1 in light mode and `--marine` falls to 1.5:1 in dark. Each token is the darkened (light) or lightened (dark) variant, all above 4.5:1.

Dark mode has **two triggers, one set of values**: `prefers-color-scheme` (unless the user forced light) and `data-theme="sombre"`. The dark token block is written **twice on purpose** — CSS cannot share a rule body between a media query and an attribute selector. `color-scheme` follows, otherwise the native `datetime-local` picker stays white on a dark page.

**`.pleine-largeur` est un utilitaire GLOBAL**, et il devait l'être : six gabarits la posaient sur leurs contrôles PrimeNG, une seule feuille la définissait — celle de la connexion, sous `:host ::ng-deep`. Le style ne franchissait donc pas l'encapsulation de son composant et l'attribut était sans effet partout ailleurs, visible à l'œil sur `/profil` où la ville faisait la moitié de la largeur de ses voisins. ⚠️ N'y mettez PAS `.p-select-label` : ce libellé est un enfant flex à côté du chevron, l'élargir à 100 % pousse le chevron à la ligne et double la hauteur du champ.

⚠️ **Corollaire déjà payé** : tout jeton ajouté d'un côté doit l'être des deux, sinon la valeur claire fuit en thème sombre. `--pastille-neutre-fond` a été codé en dur dans `:root` seulement — l'étiquette « Marche à pied », la seule neutre, s'affichait alors en pastille BLANCHE sur page sombre. Ce jeton porte d'ailleurs une teinte propre et non un alias de `--surface-douce` : celle-ci ne se distingue de `--fond` que d'un point (`#f7f9fd` sur `#f4f7fb`), donc la pastille disparaissait purement et simplement en thème clair.

Assets live in `src/assets` (declared in `angular.json`): `logo.png` (header/login, downscaled to 560px), `favicon.png` and `apple-touch-icon.png` (cropped from the logo emblem with `sips`). The logo artwork is dark-on-light, so both places that render it put it on a white chip under `prefers-color-scheme: dark`.

### State model

Signals for application state, RxJS for HTTP. `AuthService` and `NotificationService` hold a private writable `signal` exposed via `.asReadonly()`, with `computed` derivations (`estConnecte`, `estAdmin`, `initiales`). Do not introduce `BehaviorSubject` for shared state. Observables stay in services returning `HttpClient` calls; components convert with `toSignal` (which handles unsubscription).

Every component uses `ChangeDetectionStrategy.OnPush`; signal updates must be immutable (`update(liste => [...liste, x])`), never in-place mutation.

### Séance scheduling model

A séance carries a full `dateHeure` (`LocalDateTime` back, `datetime-local` front), **not** a date — two sessions can share a day, and weather is resolved per hour. Sessions may be **planned up to 30 days ahead** (`kayedaw.entrainement.planification-max-jours`, mirrored front-side by `HORIZON_PLANIFICATION_JOURS` in `shared/validators/seance.validators.ts` — keep the two in sync). The `datetime-local` field also carries `min`/`max` so the native picker never offers an out-of-range day; `min` is dropped when editing, since a past session sits below it. **The horizon outruns the forecast** : Open-Meteo ne rend de VALEURS que jusqu'à **J+14**, donc une séance posée au-delà est valide mais revient sans météo — `PORTEE_PREVISION_JOURS` pilote l'avertissement affiché à la saisie.

⚠️ **La borne utile est J+14, pas J+15**, et la constante valait 15 — faux d'un jour. Mesuré sur l'API : J+14 rend une valeur, **J+15 est accepté mais ne rend RIEN**, J+16 est refusé. Prendre le dernier jour ACCEPTÉ pour le dernier jour COUVERT laissait une séance à J+15 échapper à l'avertissement tout en revenant sans mesure — exactement le cas qu'il doit couvrir. La comparaison porte en outre sur la FIN du dernier jour (`setHours(23,59,59,999)`), sinon une séance à 20 h le dernier jour utile était signalée à tort quand l'écran était ouvert le matin.

### Le lieu d'une séance : ville ET pays

⚠️ **Le pays appartient à la SÉANCE, plus seulement au compte** — on ne court pas toujours chez soi. Le géocodage se faisait sur le pays de l'utilisateur : un Français en déplacement à Dakar ne trouvait aucune ville étrangère dans l'autocomplétion, et sa séance revenait sans météo, en silence. Le compte n'est plus qu'un **défaut** : `paysDemande = request.pays ?: utilisateur.pays`, donc un client plus ancien qui n'envoie rien fonctionne à l'identique.

- Le pays est **stocké** sur la séance : le relire sur le profil prêterait à un compte déménagé des séances qu'il n'a jamais courues là.
- À l'écran, **le pays vient AVANT la ville** — c'est lui qui borne les suggestions. Même ordre sur `/profil` (section « Informations ») et à l'inscription.
- Changer de pays **vide la ville sur le formulaire de séance** (une paire saisie pour une sortie donnée), mais **PAS sur le profil** (une donnée de référence qu'on édite : corriger un pays erroné sur une ville juste est plausible, et l'effacement y créait une impasse muette — la ville étant obligatoire, « Enregistrer » cessait de répondre sans rien dire). Branché sur `onChange`, jamais sur `valueChanges`, qui se déclencherait aussi au pré-remplissage.
- Le pays s'affiche dans la **liste** et sur le **détail**, systématiquement et non « seulement s'il diffère du profil » : le masquer ferait dépendre la liste d'une donnée de compte modifiable.

⚠️ **Changer de pays VIDE la ville — sur TOUS les écrans** (formulaire de séance, profil, inscription, édition d'un compte en administration). Une ville appartient à son pays. Toujours branché sur l'événement `onChange` du `p-select`, **jamais** sur `valueChanges` : celui-ci se déclenche aussi au pré-remplissage et effacerait la ville d'un formulaire que personne n'a touché.

**Ville et pays sont OBLIGATOIRES à la création** (`villeRequise` dans `shared/validators/seance.validators.ts` et `Validators.required`), et ce sont les seuls champs dans ce cas : la météo est résolue puis STOCKÉE à l'enregistrement, et l'écran de modification n'offre pas le champ ville. Une séance créée sans lieu reste définitivement sans météo, là où une distance fautive se corrige. `Validators.required` ne suffit pas — il laisse passer des espaces, qui atteindraient le géocodeur sans désigner aucun lieu.

⚠️ Les deux validateurs sont **levés en modification** (`removeValidators` dans `ngOnInit`) : les champs n'y sont ni rendus ni renseignés, un `required` actif rendrait la séance impossible à corriger sur des champs invisibles. Le bouton « Enregistrer » est désactivé sur ce seul motif — pas sur l'invalidité complète du formulaire — et la raison est écrite à côté dans une région `role="status"`, un bouton désactivé ne prenant pas le focus.

**La ville doit aussi EXISTER dans le pays choisi**, pas seulement être non vide. Cas constaté dans le journal du serveur : « Dakar » saisi avec le pays resté sur France — aucune suggestion (la liste est bornée au pays), frappe libre acceptée, séance enregistrée sans météo, définitivement, sans un mot.

- La vérification est un **flux explicite** (`brancherVerificationDeVille`), pas un `AsyncValidatorFn`. ⚠️ Écrite d'abord en validateur asynchrone, elle laissait le contrôle bloqué sur `PENDING` : Angular relance la validation à chaque `updateValueAndValidity` en annulant la précédente, et propage à `setErrors` l'option `emitEvent` de l'appel d'origine — la résolution arrivait donc sans `statusChanges`. Trois lancements pour une frappe, et rien n'en sortait jamais.
- `VilleService.existe()` rend **trois** états : `true`, `false`, et **`null` quand le service n'a pas répondu**. `rechercher()` ne convient pas pour valider : elle masque la panne derrière une liste vide, ce qui transformerait une indisponibilité du géocodeur en erreur de saisie et bloquerait l'enregistrement d'une ville pourtant juste. **L'indécision vaut acceptation.**

Rules, deliberately asymmetric:
- A planned séance **counts toward the weekly 80 km cap** (catch over-planning early).
- A planned séance is **excluded from statistics** — `seancesDeLaPeriode` filters on `estPlanifiee()`, and the `volumeParType` JPQL takes a `maintenant` bound. Stats must reflect what was actually run.

### Préférences utilisateur

`GET`/`PUT /api/profil/preferences` portent trois réglages **de compte** (pas de navigateur) : les valeurs par défaut de distance et durée **par type de séance**, le thème et la langue. Le serveur renvoie **toujours les cinq types**, complétant avec ses valeurs d'usine (`PreferenceService.DEFAUTS`) : l'écran n'a donc jamais de repli à inventer, et un type ajouté côté serveur apparaît seul.

- `seance-formulaire.component.ts` pré-remplit distance et durée au changement de type, **uniquement si le contrôle est `pristine`**. `patchValue`/`setValue` ne salissent pas un contrôle, donc plusieurs changements de type s'enchaînent tant que l'utilisateur n'a rien tapé — mais une valeur saisie à la main n'est jamais écrasée. En modification, le mécanisme n'est pas branché du tout.
- Le thème pose **toujours** `data-theme="clair|sombre"` sur `<html>` : « Automatique » est RÉSOLU via `matchMedia`, il ne retire plus l'attribut. Raison : le `darkModeSelector` de PrimeNG est un sélecteur CSS et ne sait pas observer `prefers-color-scheme` — sans cette résolution, les champs PrimeNG restaient blancs sur une page sombre. Le service se désabonne du media query avant d'en poser un nouveau.
- Les valeurs d'usine sont **identiques pour les cinq types** (5 km / 60 min, soit 12 min/km) : une allure plausible partout, donc le formulaire ne s'ouvre jamais sur une erreur d'allure irréaliste.
- Le compte porte aussi un **pays**, « France » par défaut. ⚠️ Le défaut est posé **en base** (`columnDefinition`) et pas seulement en Kotlin : avec `ddl-auto: update`, ajouter une colonne `NOT NULL` à une table peuplée échoue sur les lignes existantes. Dans les requêtes de modification il est **optionnel** — absent, il reste inchangé, sinon un client plus ancien l'écraserait à chaque enregistrement.
- ⚠️ **Piège OnPush déjà payé** : remplir un `FormArray` depuis une réponse HTTP ne marque **pas** un composant OnPush comme à revérifier. La section préférences de `/profil` restait bloquée sur son squelette une fois sur trois sous charge, selon l'ordre d'arrivée des deux requêtes. Le rendu est piloté par le signal `etatPreferences` (`chargement | pret | erreur`), écrit **après** le remplissage.

### Traduction FR/EN

Widget **Google Translate**, sans fichier de traduction (choix explicite). `TraductionService` pilote par le **cookie `googtrans`**, pas par le `<select>` du widget : écrire `.goog-te-combo.value` et émettre un `change` ne déclenche rien — vérifié, le sélecteur passait à « en » et la page restait en français. Le widget ne lit son cookie qu'à l'initialisation, **chaque bascule recharge donc la page**. Le script n'est chargé qu'en anglais : en français, aucune requête ne part vers Google.

Conséquences mesurées, à connaître avant d'y toucher : « Type » → « Kind », « Recherche » → « Research », « Du »/« Au » → « Of »/« At », initiales « CE » → « THIS ». D'où les `translate="no"` sur les initiales, le nom et l'email. Les sélecteurs e2e **ne doivent pas** viser un libellé traduisible quand la traduction est active — `#filtreType` et `selectOption({ index })` plutôt que `getByLabel('Type')`.

`main.ts` pose un correctif défensif sur `removeChild`/`insertBefore` ; il est **préventif** — le plantage classique n'a pas été reproduit sur les parcours de cette application, correctif retiré.

### Administration

`/administration` est le seul écran d'un compte ADMIN. Ce qu'il permet, et les règles qui le bornent — toutes côté serveur, le front ne fait que les relayer :

| Action | Garde-fou |
|---|---|
| Promouvoir / rétrograder | pas soi-même ; jamais le dernier administrateur |
| Modifier nom / ville / pays | l'**email n'est pas modifiable** : identifiant de connexion et clé unique |
| Réinitialiser le mot de passe | l'ancien n'est **pas** demandé — un administrateur ne le connaît pas |
| Bloquer / débloquer | pas soi-même ; jamais le dernier administrateur **actif** |
| Supprimer (unitaire ou en masse) | pas soi-même ; jamais le dernier administrateur |

- **Tri des colonnes** : `p-table` est en mode `lazy`, elle n'a qu'une page en mémoire — trier localement classerait dix lignes sur quarante. Le critère part au serveur au format Spring Data `propriété,sens`, et **remet à la première page** : sinon trier depuis la page 3 renvoie une tranche arbitraire du nouvel ordre.
- **Suppression en masse** : `DELETE /api/admin/utilisateurs` répond **200 et un rapport**, jamais 204 — le résultat est partiel par nature. Son propre compte n'est **pas sélectionnable** (`rowSelectable`) : le serveur le refuserait, et l'afficher comme sélectionné mentirait sur ce qui va partir.
- **Blocage vs suppression** : le blocage est réversible et conserve séances et historique ; la suppression emporte tout (voir plus bas). Un compte bloqué reçoit **403** à la connexion, pas 401 — l'identité est bonne, c'est l'accès qui est suspendu.

### Suppression d'un compte : ce qui part

Trois entités seulement dans le schéma — `Utilisateur`, `Seance`, `PreferenceSeance`. Les deux dernières portent `utilisateur_id` et sont effacées **avant** le compte (contrainte de clé étrangère). Les **statistiques n'ont rien à effacer** : elles sont calculées à la volée depuis les séances, aucune ligne n'est stockée.

Un **canari de schéma** (`SuppressionCompleteTest`) interroge `INFORMATION_SCHEMA` et compare les tables portant `utilisateur_id` à celles que `AdminService.supprimer` traite. Il ne décrit pas le présent, il fait échouer l'avenir : ajouter une table liée sans compléter la suppression casse ce test. Vérifié qu'il se déclenche réellement — un garde qui ne se déclenche jamais ne garde rien.

### Mot de passe et inscription

- **Minimum 5 caractères**, aligné front et back. Il valait 5 côté front et 8 côté serveur : un mot de passe de 5 à 7 caractères passait la validation à l'écran puis se faisait refuser par l'API. C'était l'origine d'un « La création du compte a échoué » sans cause visible.
- **Aucune liste de mots de passe courants** : `TROP_COURANTS` a été retiré des deux côtés, « password » est accepté.
- **L'inscription n'ouvre pas de session.** `AuthService.inscrire` ignore délibérément le jeton renvoyé : l'utilisateur repasse par `/connexion` avec un message de confirmation. Le contrat de l'API n'a **pas** changé — elle renvoie toujours un jeton, dont `creerCompte` se sert dans les tests.
- **Les refus du serveur sont relayés tels quels.** Le repli était « La création du compte a échoué. » pour tout ce qui n'était pas un 409 : l'utilisateur voyait un échec sans savoir quoi corriger, alors que l'API disait précisément « le nom ne peut pas dépasser 100 caractères ». `expliquer()` lit `erreur.error.message` du contrat normalisé et retire le préfixe de champ.

### Weather sources

Three sources, picked in `EnrichissementMeteoService` and reported to the client via `sourceMeteo`:

| Case | Source | Value |
|------|--------|-------|
| Past séance, station available | `OBSERVATION_METEO_FRANCE` (DPClim) | real station observations + `temperatureALHeureC` at the séance hour |
| Past séance, DPClim unavailable | `ARCHIVE_OPEN_METEO` | reanalysis, daily aggregates only |
| Planned séance | `PREVISION_OPEN_METEO` | forecast — valeurs jusqu'à **J+14** seulement |

Open-Meteo's archive returns 400 on a future date, so the past/future branch in `MeteoClient.meteoDuJour` is load-bearing.

**Météo-France DPClim is order-then-poll**, not a plain REST call: `/liste-stations/horaire` → `/commande-station/horaire` (202 + command id) → `/commande/fichier` (201 ready / 204 not yet). The CSV is `;`-separated with **comma decimals** and mostly empty columns; `AnalyseurCsvDpclim` parses it. Wind comes in m/s and is converted to km/h.

**Le géocodage est CONSCIENT DU PAYS.** Il était verrouillé sur `countryCode=FR` : aucune ville étrangère n'était trouvable, et la séance partait sans ville *ni* météo, en silence. Le compte porte donc un `pays` (« France » par défaut) qui lève l'homonymie — « Saint-Louis » désigne le Missouri autant que le Sénégal.

- Le référentiel est servi par l'API (`GET /api/meteo/pays`, 249 pays depuis `Locale.getISOCountries()`), **jamais écrit en dur côté front** : deux listes divergentes rendraient sélectionnables des pays sans ville trouvable. Front : `core/services/pays.service.ts`, avec `shareReplay` et repli sur la seule France.
- Le rapprochement se fait sur le **code ISO** (`Pays.code(nom)`), le nom normalisé n'étant qu'un repli : le géocodeur ne répond pas toujours dans la langue de la saisie.
- ⚠️ `MINIMUM_RESULTATS = 2` contourne un bug d'Open-Meteo : avec `count=1` l'API renvoie parfois un résultat d'un autre pays. On demande plus, puis on filtre.
- Le **fuseau** vient de la réponse du géocodeur. Codé en dur sur `Europe/Paris`, il décalait de deux heures la température « à l'heure de la séance » à Dakar.
- Le champ pays est une **liste filtrable** et non un texte libre : un pays mal orthographié ne trouve rien, et la faute serait invisible.

**La météo est STOCKÉE à l'enregistrement**, pas recalculée à l'affichage : une observation passée ne bouge plus, et une séance de l'an dernier resterait sans mesure le jour où l'API tierce tombe ou change de contrat. C'est aussi ce qui rend la ville obligatoire à la création (voir plus haut).

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

**96 tests across 9 spec files, 100 runs**: `seances` (27), `administration` (19), `accueil` (9), `connexion` (9), `inscription` (8), `liste-filtres` (8), `preferences` (7), `statistiques` (5), `responsive` (4). The four `@mobile` tests run on **both** projects — hence 100 runs for 96 declarations.

⚠️ **`e2e/prerequis.ts` est le `globalSetup`** et il vaut d'être compris : la suite lit les identifiants de démonstration comme des constantes, or **n'importe qui peut les changer en se servant de l'application** — la base étant en mémoire, seul un redémarrage du backend les rétablit. Le cas s'est produit : un `PUT /api/profil/mot-de-passe` fait à la main depuis le navigateur a rendu **vingt-cinq tests** rouges, tous sur `toHaveURL(/seances/)` avec « received: /connexion », sans qu'aucun message ne nomme la cause. Le contrôle transforme ces vingt-cinq symptômes en une phrase qui dit quoi faire. Il distingue 401 (mot de passe changé) de 403 (compte bloqué).

Le plus utile du lot est **`parcours complet : création à l'étranger, modification, suppression`** : les trois opérations enchaînées sur UNE séance, dans l'ordre où un utilisateur les fait. Testées séparément, chacune passait alors que l'enchaînement cassait — c'est ce test qui a révélé que choisir une ville dans la liste écrivait l'objet suggestion dans le contrôle.

**`e2e/nettoyage.ts` est le `globalTeardown`** : chaque test qui écrit crée son compte, une exécution complète en laissait une quarantaine et `/administration` devenait illisible. Il les efface par la suppression en masse de l'API, en ne visant que le domaine `@exemple.fr` — réservé aux tests (RFC 2606), donc hors d'atteinte d'un compte réel, et les comptes de démo sont en `@kayedaw.fr`. ⚠️ Il ne doit **jamais** faire échouer la suite : un backend déjà arrêté ne transforme pas une exécution verte en rouge, d'où le try/catch qui se contente d'un avertissement.

Setup patterns in `e2e/aide.ts`, all worth keeping:
- **Seed through the API, drive only the screen under test** (`creerCompte`, `creerSeance`). Building state by clicking is slow and fails for reasons unrelated to what a test checks. **Every test that writes data works on its own freshly-created account** — the one test that used the shared demo account accumulated séances across runs until the weekly 80 km cap refused the creation, ten runs later, in a test about something else entirely.
- **Unique per-test markers.** Admin tests search by a `Date.now()`-suffixed name so a search matches exactly one row regardless of accounts other tests left behind — a shared prefix returned 3 rows and broke the count assertion.
- The admin search is **debounced**: wait for `tbody tr` to reach the expected count before acting on a row, or you operate on the pre-filter row still on screen.
- **Never wait on a "loading finished" flag.** Filters are debounced 300 ms, so `aria-busy=false` is still true when `selectOption` returns — the test read the old list. Use auto-retrying assertions (`toHaveCount`, `expect.poll`) instead.
- **`getByText` matches substrings, case-insensitively.** `getByText('Enregistré')` matched the idle message « …est enregistrée automatiquement » and the test passed without any save happening. Assert on the exact text of a targeted element.
- The notification stack occupies a permanent empty `role="alert"` region — correct ARIA, since a live region must exist before its content. `getByRole('alert')` is therefore ambiguous; target the specific element.

## Testing

Karma + Jasmine. Pipes and validators are tested as pure functions **without TestBed** — keep them that way. Services and interceptors use `HttpTestingController` with `afterEach(() => httpMock.verify())`, which fails on any unconsumed request. Guards are tested through `runInInjectionContext`.

48 unit tests across 8 spec files. **No component spec exists** — that is why the PrimeNG migration touched no unit test, and why every UI guarantee is carried by the e2e suite.

⚠️ Since TypeScript 6 was briefly in play (Angular 22 attempt), `tsconfig.json` declares `types: ["jasmine"]` explicitly. The project has a **single** `tsconfig.json`, so `ng build` compiles the specs too — dropping that entry breaks the build with `Cannot find name 'it'`.

## Traps that cost time here

- **A backtick inside an inline template or `styles` comment closes the template literal.** The compiler then blames the `@Component` decorator or reports "styles at position 1", never the real line. It happened five times before templates were extracted to `.html`/`.scss`, which removes the trap — it only ever applied to inline literals.
- **Du CSS mort est pire qu'un commentaire périmé** — on le recopie en croyant qu'il sert. `connexion.component.scss` gardait une grille à deux colonnes (`1.05fr .95fr`) longtemps après le départ de sa colonne d'argumentaire vers la page d'accueil : avec un seul enfant, la carte se calait à gauche, étirée sur la moitié de la largeur, face à un vide. Cinq règles et une requête média pilotaient des éléments que le gabarit ne contenait plus.
- **A `computed()` that reads a non-signal never recomputes.** `filtresActifs` read `filtres.getRawValue()` — a FormGroup — so it was evaluated once and frozen at `false`: the "Réinitialiser" button could never appear. Cross the boundary with `toSignal(valueChanges)`.
- **Mutating a `FormArray` from an HTTP response does not mark an OnPush component dirty.** The preferences section stayed on its skeleton one run in three under load. Drive the render from a signal written *after* the fill.
- **Un `computed()` qui lève une exception fige le gabarit sans planter visiblement.** `p-autocomplete` écrivant `null` dans un contrôle typé `string`, un `.trim()` levait un `TypeError` dans le computed : plus aucune mise à jour de la vue, et un bouton resté actif alors qu'il devait être désactivé. Normaliser les valeurs venant d'un CVA tiers, le typage ne les couvre pas.
- **`LOCALE_ID` vaut « en-US » par défaut**, quelle que soit la langue du système ou l'attribut `lang` de la page : les dates sortaient en « Wednesday 22 July 2026 ». Il faut les DEUX gestes dans `app.config.ts` — `registerLocaleData(localeFr, 'fr-FR')` et le provider `LOCALE_ID`. Le provider seul lève « Missing locale data ».
- **`ng update` is not trustworthy on the source it rewrites.** Going to 22 it produced syntactically invalid code (`withXhr()withXhr()`), removed `lib` from `tsconfig.json`, and left a `$safeNavigationMigration(...)` marker in a template. Read every diff it produces.
