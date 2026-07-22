import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, Input, OnInit, computed,
  effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap, tap } from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { ConditionsMeteo, RefusMetier, SuggestionVille, TYPES_SEANCE, TypeSeance }
  from '../../core/models/seance.model';
import { VilleService } from '../../core/services/ville.service';
import { MeteoService } from '../../core/services/meteo.service';
import { AuthService } from '../../core/services/auth.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { Pays, PaysService } from '../../core/services/pays.service';
import { SeanceService } from '../../core/services/seance.service';
import { NotificationService } from '../../core/services/notification.service';
import { allurePlausible, dansHorizonDePlanification, HORIZON_PLANIFICATION_JOURS,
  PORTEE_PREVISION_JOURS, villeRequise } from '../../shared/validators/seance.validators';
import { AllurePipe } from '../../shared/pipes/allure.pipe';

/**
 * `toISOString()` bascule en UTC : à 00 h 30 à Paris en été, il renvoie la
 * veille 22 h 30 et le champ affiche le mauvais jour. On construit donc la
 * chaîne `datetime-local` à partir de l'heure LOCALE.
 */
/**
 * Miroir de la fonction d'extension `Double.arrondi2()` du backend.
 * Toute valeur destinée à être comparée à ce que le serveur renverra doit
 * passer par ici, sinon l'affichage diverge.
 */
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Le contrôle « ville » n'est PAS toujours une chaîne, malgré son type    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * `p-autoComplete.onOptionSelect` appelle `updateModel(option)` AVANT d'émettre
 * `onSelect` — et `getOptionValue()` renvoie l'objet suggestion entier faute de
 * `.value` dessus. Le contrôle reçoit donc `{nom, departement, …}` le temps
 * d'un tour, avant que `choisir()` n'y remette la chaîne.
 *
 * Ce n'est pas cosmétique : un `.trim()` posé sur cette émission transitoire
 * levait un TypeError À L'INTÉRIEUR d'un opérateur `map`, ce qui **termine la
 * souscription**. Le signal qui en dépend restait figé DÉFINITIVEMENT, et le
 * bouton « Enregistrer » ne se réactivait plus jamais.
 *
 * `nonNullable` ne protège de rien ici : TypeScript type le contrôle `string`
 * et ne voit pas ce que le composant tiers y écrit.
 */
function nomDeVille(valeur: unknown): string {
  if (typeof valeur === 'string') {
    return valeur;
  }
  return (valeur as SuggestionVille | null)?.nom ?? '';
}

function arrondi2(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

function localISO(date: Date): string {
  const decalage = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 16);
}

function maintenantLocalISO(): string {
  return localISO(new Date());
}

/** Aujourd'hui à 00 h 00 : la journée entière reste sélectionnable. */
function debutDeJournee(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return localISO(date);
}

/** Dans 30 jours à 23 h 59, borne haute du sélecteur natif. */
function borneHaute(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  date.setHours(23, 59, 0, 0);
  return localISO(date);
}

@Component({
    selector: 'app-seance-formulaire',
    imports: [ReactiveFormsModule, RouterLink, AllurePipe, SelectModule, InputNumberModule,
      InputTextModule, TextareaModule, ButtonModule, AutoCompleteModule, SkeletonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './seance-formulaire.component.html',
    styleUrl: './seance-formulaire.component.scss'
})
export class SeanceFormulaireComponent implements OnInit {

  /**
   * Grâce à `withComponentInputBinding()` dans app.config, le paramètre de
   * route `:id` est injecté ici directement. Plus besoin de s'abonner à
   * ActivatedRoute — moins de code, et une souscription de moins à gérer.
   */
  @Input() id?: string;

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SeanceService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly villes = inject(VilleService);
  private readonly meteo = inject(MeteoService);
  private readonly auth = inject(AuthService);
  private readonly preferences = inject(PreferencesService);
  private readonly referentielPays = inject(PaysService);
  private readonly destroyRef = inject(DestroyRef);
  /** `effect()` exige un contexte d'injection : ngOnInit n'en est pas un. */
  private readonly injecteur = inject(Injector);

  protected readonly typesDisponibles = TYPES_SEANCE;
  /** p-select attend un tableau mutable : TYPES_SEANCE est readonly. */
  protected readonly optionsType = [...TYPES_SEANCE];
  protected readonly horizonJours = HORIZON_PLANIFICATION_JOURS;
  protected readonly envoiEnCours = signal(false);
  protected readonly refus = signal<RefusMetier | null>(null);

  private readonly distance = signal(0);
  private readonly duree = signal(0);
  private readonly dateHeureSaisie = signal('');

  protected readonly suggestions = signal<readonly SuggestionVille[]>([]);
  /** p-autoComplete exige un tableau mutable. */
  protected readonly suggestionsVilles = computed(() => [...this.suggestions()]);
  protected readonly meteoApercu = signal<ConditionsMeteo | undefined>(undefined);
  protected readonly meteoEnCours = signal(false);

  /** Alimenté uniquement par la frappe de l'utilisateur (événement input). */
  private readonly saisieVille$ = new Subject<string>();

  protected rechercherVille(terme: string): void {
    this.saisieVille$.next(terme);
  }
  /** -1 = aucune option survolée au clavier. */
  protected readonly indexActif = signal(-1);

  /** Bornes du sélecteur natif : aujourd'hui 00 h 00 → J+30 à 23 h 59. */
  protected readonly dateMin = debutDeJournee();
  protected readonly dateMax = borneHaute();
  protected readonly porteePrevisionJours = PORTEE_PREVISION_JOURS;

  /** Une date à venir bascule l'écran en mode « planification ». */
  protected readonly estPlanifiee = computed(() => {
    const valeur = this.dateHeureSaisie();
    return valeur !== '' && new Date(valeur) > new Date();
  });

  /**
   * Séance planifiée AU-DELÀ de ce qu'Open-Meteo sait prévoir.
   * L'horizon de planification vaut 30 jours, les prévisions 15 : entre les
   * deux, la séance est parfaitement valide mais n'aura pas de météo.
   */
  protected readonly horsPorteePrevision = computed(() => {
    const valeur = this.dateHeureSaisie();
    if (valeur === '') {
      return false;
    }
    /*
     * ⚠️ La borne est la FIN du dernier jour couvert, pas l'instant présent
     * décalé de N jours. Sans `setHours(23,59,59,999)`, une séance posée à
     * 20 h le dernier jour utile tombait « hors portée » si l'écran était
     * ouvert à 9 h du matin — un avertissement faux, sur une séance qui aura
     * bel et bien sa météo.
     */
    const limite = new Date();
    limite.setDate(limite.getDate() + PORTEE_PREVISION_JOURS);
    limite.setHours(23, 59, 59, 999);
    return new Date(valeur) > limite;
  });

  /**
   * Signal dérivé : l'allure se recalcule dès qu'un des deux champs change.
   *
   * ⚠️ L'arrondi à 2 décimales n'est PAS cosmétique : il reproduit exactement
   * celui que le backend applique dans Seance.allureMinParKm(). Sans lui,
   * l'estimation affichée ici et la valeur enregistrée divergeaient d'une
   * seconde dans 13,7 % des saisies réalistes — 0,01 min vaut 0,6 s, donc
   * l'arrondi serveur fait basculer la seconde affichée. L'utilisateur voyait
   * « 7'42" » avant d'enregistrer, puis « 7'41" » sur le détail.
   *
   * Le rôle de cette estimation est de PRÉDIRE ce qui sera enregistré : elle
   * doit donc arrondir comme le serveur, pas plus finement.
   */
  protected readonly allureCalculee = computed(() => {
    const d = this.distance();
    const t = this.duree();
    if (d <= 0 || t <= 0) {
      return null;
    }
    return arrondi2(t / d);
  });

  /**
   * Vitesse en km/h — miroir de Seance.vitesseKmH() côté backend, arrondi
   * compris, pour que l'estimation corresponde à la valeur qui sera stockée.
   */
  protected readonly vitesseCalculee = computed(() => {
    const d = this.distance();
    const t = this.duree();
    if (d <= 0 || t <= 0) {
      return 0;
    }
    return arrondi2(d / (t / 60));
  });

  /**
   * ⚠️ Distance et durée démarrent à `null`, PAS à 0.
   *
   * Un contrôle non nullable initialisé à 0 affiche « 0 » dans le champ : il
   * fallait l'effacer avant de saisir, et un oubli envoyait une distance nulle
   * que seul le validateur rattrapait. `null` laisse le champ VIDE, ce qui est
   * l'état réel — rien n'a encore été saisi — et laisse le placeholder visible.
   *
   * Le groupe n'est donc plus entièrement `nonNullable` : ces deux contrôles
   * sont déclarés à part, les autres gardent leur valeur de repli.
   */
  protected readonly formulaire = this.fb.group({
    type: this.fb.nonNullable.control<TypeSeance>('ENDURANCE', [Validators.required]),
    distanceKm: this.fb.control<number | null>(
      null, [Validators.required, Validators.min(0.1), Validators.max(200)]),
    dureeMinutes: this.fb.control<number | null>(
      null, [Validators.required, Validators.min(1)]),
    dateHeure: this.fb.nonNullable.control('', [Validators.required, dansHorizonDePlanification]),
    /*
     * Le pays est porté par la SÉANCE, pas seulement par le compte : on ne
     * court pas toujours chez soi. Il est pré-rempli sur le pays du profil —
     * le cas courant n'exige donc aucune saisie — et il PILOTE l'autocomplétion
     * de la ville, qui vient juste après lui à l'écran pour cette raison.
     */
    pays: this.fb.nonNullable.control('', [Validators.required]),
    ville: this.fb.nonNullable.control('', [villeRequise]),
    commentaire: this.fb.nonNullable.control('', [Validators.maxLength(500)])
  }, { validators: allurePlausible });

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ La ville suivie EN SIGNAL, et non lue depuis le contrôle              │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Piège déjà payé ailleurs dans ce projet : un `computed()` qui lit
   * `controls.ville.value` ne lit AUCUN signal. Il est évalué une fois, puis
   * figé — ici sur « manquante », et le bouton ne se réactiverait jamais.
   * `toSignal(valueChanges)` franchit la frontière RxJS → signaux.
   *
   * ⚠️ Le `?? ''` n'est pas de la prudence décorative. `p-autoComplete` écrit
   * `null` — jamais `''` — dès que le champ est vidé : son `updateModel()`
   * traite toute valeur FALSY comme « aucune sélection ». Le contrôle est
   * pourtant déclaré `nonNullable`, donc TypeScript continue de le typer
   * `string` et ne voit pas le trou. Sans normalisation, `.trim()` levait un
   * TypeError DANS le computed : le gabarit cessait de se rafraîchir et le
   * bouton restait actif — exactement l'inverse de la règle qu'il porte.
   */
  private readonly villeSaisie = toSignal(
    this.formulaire.controls.ville.valueChanges.pipe(map(nomDeVille)),
    { initialValue: '' }
  );

  /**
   * Référentiel des pays, servi par l'API et jamais écrit en dur : le
   * géocodage s'appuie sur la même liste, deux listes divergentes rendraient
   * sélectionnables des pays sans aucune ville trouvable.
   * Copie mutable — `p-select` refuse un tableau `readonly`.
   */
  protected readonly optionsPays = toSignal(
    this.referentielPays.tous().pipe(map(liste => [...liste])),
    { initialValue: [] as Pays[] }
  );

  private readonly paysSaisi = toSignal(
    this.formulaire.controls.pays.valueChanges.pipe(map(valeur => valeur ?? '')),
    { initialValue: '' }
  );

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ EXISTENCE DE LA VILLE — un flux, PAS un validateur asynchrone         │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Écrit d'abord en `AsyncValidatorFn`, puis abandonné : le contrôle restait
   * bloqué sur `PENDING`. Angular relance la validation à chaque
   * `updateValueAndValidity` en annulant la précédente, et propage à
   * `setErrors` l'option `emitEvent` de l'appel d'origine — la résolution
   * arrivait donc sans `statusChanges`, et rien ne sortait jamais de l'état
   * « vérification en cours ». Trois lancements pour une seule frappe.
   *
   * Un flux explicite rend le cycle lisible et le met sous le même régime que
   * l'aperçu météo juste en dessous : `debounceTime` pour ne pas interroger à
   * chaque touche, `switchMap` pour qu'une réponse lente n'écrase pas une
   * réponse récente.
   */
  protected readonly villeInconnue = signal(false);
  protected readonly villeEnVerification = signal(false);

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ « J'ai tapé bamb au Sénégal et Bambilor ne sort pas »                 │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Constaté en usage réel, et la cause est CHEZ LE GÉOCODEUR : Open-Meteo ne
   * fait pas une recherche par préfixe mais par ressemblance, en pénalisant
   * l'écart de longueur. Mesuré sur le Sénégal :
   *
   *   « bamb »  → Banba, Bamba, Mbamb — tous de cinq lettres, PAS Bambilor
   *   « bambi » → Bambilor
   *
   * Ce n'est pas une troncature de notre côté : à `count=100` et sans filtre
   * de pays, Bambilor est absent des cent résultats. Nominatim, essayé en
   * comparaison, fait pire — il ne le trouve à aucune des deux longueurs.
   *
   * On ne peut donc pas le corriger. Ce qu'on peut faire, c'est ne pas laisser
   * l'utilisateur devant une liste vide qui se lit « cette ville n'existe
   * pas » : on lui dit de continuer à saisir. Le silence était le vrai défaut.
   */
  protected readonly saisieTropCourte = computed(() => {
    const terme = this.villeSaisie().trim();
    return !this.estModification()
      && this.suggestions().length === 0
      && terme.length >= 2 && terme.length < 5
      && this.formulaire.controls.ville.dirty;
  });

  /** Vrais tant que le lieu manque — à la CRÉATION seulement. */
  protected readonly paysManquant = computed(
    () => !this.estModification() && this.paysSaisi().trim().length === 0
  );
  protected readonly villeManquante = computed(
    () => !this.estModification() && this.villeSaisie().trim().length === 0
  );
  /**
   * Le lieu n'est pas exploitable : manquant, inconnu, ou pas encore vérifié.
   * C'est cette seule condition qui désactive « Enregistrer ».
   */
  protected readonly lieuIncomplet = computed(
    () => this.paysManquant() || this.villeManquante()
       || this.villeInconnue() || this.villeEnVerification()
  );

  ngOnInit(): void {
    // Alimente les signaux pour le calcul d'allure en direct
    this.formulaire.controls.distanceKm.valueChanges
      .subscribe(v => this.distance.set(Number(v) || 0));
    this.formulaire.controls.dureeMinutes.valueChanges
      .subscribe(v => this.duree.set(Number(v) || 0));
    this.formulaire.controls.dateHeure.valueChanges
      .subscribe(v => this.dateHeureSaisie.set(v ?? ''));

    /*
     * ┌───────────────────────────────────────────────────────────────────┐
     * │ L'AUTOCOMPLÉTION ÉCOUTE LA SAISIE, PAS valueChanges               │
     * └───────────────────────────────────────────────────────────────────┘
     *
     * `valueChanges` se déclenche AUSSI sur les affectations programmatiques.
     * La liste se dépliait donc toute seule à l'ouverture de l'écran, la ville
     * étant pré-remplie depuis le profil — et de même au chargement d'une
     * séance en modification.
     *
     * L'événement `input` natif, lui, n'existe que si l'utilisateur tape :
     * la liste ne s'ouvre plus que sur une intention réelle.
     *
     * debounceTime évite d'interroger à chaque frappe · distinctUntilChanged
     * ignore un retour à la même valeur · switchMap ANNULE la requête
     * précédente, sans quoi une réponse lente écraserait une réponse récente.
     *
     * ┌───────────────────────────────────────────────────────────────────┐
     * │ ⚠️ La clé de déduplication inclut le PAYS, et c'est load-bearing  │
     * └───────────────────────────────────────────────────────────────────┘
     *
     * `distinctUntilChanged()` sur le seul terme a produit un défaut signalé
     * en usage réel : taper « Bambilor » avec le pays sur France (aucun
     * résultat), corriger le pays en Sénégal, retaper « Bambilor » — et
     * toujours rien. Le terme étant IDENTIQUE au précédent, l'opérateur
     * l'écartait ; aucune requête ne partait, la liste restait vide, et
     * l'utilisateur voyait une ville pourtant connue du référentiel lui être
     * refusée.
     *
     * Le même mot sous un autre pays est une AUTRE question : la clé de
     * comparaison doit donc porter les deux.
     */
    this.saisieVille$.pipe(
      debounceTime(250),
      /*
       * Le pays du FORMULAIRE borne les suggestions, et non celui du compte :
       * sans pays « Dakar » proposerait ses homonymes de Syrie et d'Inde, et
       * avec le pays du compte un Français en déplacement ne trouverait
       * jamais Dakar. C'est le champ juste au-dessus qui commande.
       */
      map(terme => [terme, this.formulaire.controls.pays.value] as const),
      distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
      switchMap(([terme, pays]) => this.villes.rechercher(terme, pays || undefined)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(resultats => {
      this.suggestions.set(resultats);
      this.indexActif.set(-1);
    });

    /*
     * APERÇU MÉTÉO : recalculé dès que la VILLE ou la DATE change.
     *
     * combineLatest réémet sur l'un OU l'autre — c'est exactement le besoin.
     * switchMap annule la requête précédente : sans lui, en déplaçant la date
     * rapidement, une réponse lente écraserait une réponse plus récente et
     * l'écran afficherait la météo d'un créneau qu'on a déjà quitté.
     */
    combineLatest([
      this.formulaire.controls.ville.valueChanges.pipe(startWith(this.formulaire.controls.ville.value)),
      this.formulaire.controls.dateHeure.valueChanges.pipe(startWith(this.formulaire.controls.dateHeure.value)),
      // Le PAYS entre dans le combineLatest : changer de pays sans changer de
      // ville désigne un autre lieu (Saint-Louis au Sénégal ou dans le
      // Missouri). Laissé dehors, l'aperçu restait celui du pays précédent.
      this.formulaire.controls.pays.valueChanges.pipe(startWith(this.formulaire.controls.pays.value))
    ]).pipe(
      debounceTime(400),
      distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]),
      tap(([ville, dateHeure]) => this.meteoEnCours.set(!!nomDeVille(ville).trim() && !!dateHeure)),
      switchMap(([villeBrute, dateHeure, pays]) => {
        const ville = nomDeVille(villeBrute).trim();
        if (!ville || !dateHeure) {
          return of(null);
        }
        return this.meteo.conditions(ville, dateHeure, pays || undefined);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(conditions => {
      this.meteoEnCours.set(false);
      this.meteoApercu.set(conditions ?? undefined);
    });

    if (this.id) {
      /*
       * ⚠️ La contrainte est levée en MODIFICATION, et ce n'est pas un
       * relâchement de la règle : l'écran d'édition n'affiche pas le champ
       * ville (@if (!estModification()) dans le gabarit) et `chargerSeance`
       * ne le renseigne pas. Le contrôle resterait donc vide, le formulaire
       * définitivement invalide, et la séance impossible à corriger — sur un
       * champ que l'utilisateur ne voit même pas.
       */
      this.formulaire.controls.ville.removeValidators(villeRequise);
      this.formulaire.controls.ville.updateValueAndValidity();
      this.formulaire.controls.pays.removeValidators(Validators.required);
      this.formulaire.controls.pays.updateValueAndValidity();
      this.chargerSeance(Number(this.id));
    } else {
      // Ville de référence du profil : l'aperçu météo est disponible
      // immédiatement, sans que l'utilisateur ait à saisir un lieu.
      this.brancherVerificationDeVille();

      this.formulaire.patchValue({
        dateHeure: maintenantLocalISO(),
        pays: this.auth.pays(),
        ville: this.auth.villeParDefaut()
      });
      this.brancherDefautsParType();
    }
  }

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ PRÉ-REMPLISSAGE PAR TYPE — et pourquoi il ne piétine jamais la saisie │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Le pré-remplissage n'est appliqué qu'à un champ resté PRISTINE, c'est-à-dire
   * jamais modifié par l'utilisateur. Écraser systématiquement à chaque
   * changement de type effacerait une distance saisie à la main dès qu'on
   * corrige le type — le raccourci deviendrait un piège.
   *
   * `patchValue` ne salit PAS le contrôle (contrairement à une saisie clavier) :
   * un pré-remplissage reste donc « propre », et plusieurs changements de type
   * successifs continuent de fonctionner tant que l'utilisateur n'a rien tapé.
   *
   * En MODIFICATION, la méthode n'est pas branchée du tout : une séance
   * existante porte ses propres valeurs, qu'aucun défaut ne doit remplacer.
   */
  /**
   * Vérifie que la ville saisie EXISTE dans le pays choisi.
   *
   * Branché à la création seulement : l'écran de modification n'affiche pas le
   * lieu, il n'y aurait rien à vérifier ni à corriger.
   *
   * ⚠️ `existe()` rend `null` quand le service ne répond pas — et l'indécision
   * vaut ACCEPTATION. Une panne du géocodeur ne doit pas se transformer en
   * erreur de saisie : on préfère laisser passer une ville douteuse plutôt que
   * de retenir en otage une saisie correcte.
   */
  private brancherVerificationDeVille(): void {
    combineLatest([
      this.formulaire.controls.ville.valueChanges.pipe(startWith(this.formulaire.controls.ville.value)),
      this.formulaire.controls.pays.valueChanges.pipe(startWith(this.formulaire.controls.pays.value))
    ]).pipe(
      map(([ville, pays]) => [nomDeVille(ville).trim(), (pays ?? '').trim()] as const),
      distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
      tap(() => this.villeInconnue.set(false)),
      debounceTime(400),
      tap(([ville, pays]) => this.villeEnVerification.set(!!ville && !!pays)),
      switchMap(([ville, pays]) => {
        // Champ vide ou pays pas encore choisi : `villeRequise` et le `required`
        // du pays s'en chargent. Deux messages pour une seule cause n'en valent
        // aucun.
        if (!ville || !pays) {
          return of(null);
        }
        return this.villes.existe(ville, pays);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(existe => {
      this.villeEnVerification.set(false);
      this.villeInconnue.set(existe === false);
    });
  }

  private brancherDefautsParType(): void {
    this.formulaire.controls.type.valueChanges
      .pipe(startWith(this.formulaire.controls.type.value), takeUntilDestroyed(this.destroyRef))
      .subscribe(type => this.appliquerDefauts(type));

    // Les préférences arrivent par le réseau : elles peuvent être en retard sur
    // l'ouverture de l'écran. On réapplique à leur arrivée, toujours sous la
    // même condition de champ vierge.
    effect(() => {
      this.preferences.defautsParType();
      this.appliquerDefauts(this.formulaire.controls.type.value);
    }, { injector: this.injecteur, allowSignalWrites: true });
  }

  private appliquerDefauts(type: TypeSeance): void {
    const defaut = this.preferences.defautsParType().get(type);
    if (!defaut) {
      return;
    }
    const { distanceKm, dureeMinutes } = this.formulaire.controls;
    if (distanceKm.pristine) {
      distanceKm.setValue(defaut.distanceKm);
    }
    if (dureeMinutes.pristine) {
      dureeMinutes.setValue(defaut.dureeMinutes);
    }
  }

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ Changer de pays vide la ville — sur l'ÉVÉNEMENT, pas sur valueChanges │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Même raisonnement que pour l'autocomplétion juste au-dessus : `onChange`
   * n'existe que si l'utilisateur agit, là où `valueChanges` se déclencherait
   * aussi au pré-remplissage — ce qui effacerait la ville du profil à
   * l'ouverture de l'écran, sur un formulaire que personne n'a touché.
   *
   * Une ville appartient à son pays : « Lille » gardé après un passage au
   * Sénégal ne désigne plus rien, et l'aperçu météo reviendrait vide sans
   * qu'on comprenne pourquoi.
   */
  protected changerPays(): void {
    this.formulaire.controls.ville.setValue('');
    this.formulaire.controls.ville.markAsPristine();
    this.suggestions.set([]);
    this.indexActif.set(-1);
  }

  protected choisir(suggestion: SuggestionVille): void {
    this.formulaire.controls.ville.setValue(suggestion.nom);
    this.suggestions.set([]);
    this.indexActif.set(-1);
  }

  protected fermerSuggestions(): void {
    // Léger différé : sans lui, le blur ferme la liste AVANT que le clic
    // sur une suggestion ne soit pris en compte.
    setTimeout(() => this.suggestions.set([]), 150);
  }

  /** Flèches pour parcourir, Entrée pour valider, Échap pour fermer. */
  protected naviguer(evenement: KeyboardEvent): void {
    const total = this.suggestions().length;
    if (total === 0) {
      return;
    }

    switch (evenement.key) {
      case 'ArrowDown':
        evenement.preventDefault();
        this.indexActif.update(i => (i + 1) % total);
        break;
      case 'ArrowUp':
        evenement.preventDefault();
        this.indexActif.update(i => (i - 1 + total) % total);
        break;
      case 'Enter':
        if (this.indexActif() >= 0) {
          // On empêche la soumission du formulaire : l'Entrée sert ici à choisir
          evenement.preventDefault();
          this.choisir(this.suggestions()[this.indexActif()]);
        }
        break;
      case 'Escape':
        this.suggestions.set([]);
        this.indexActif.set(-1);
        break;
    }
  }

  protected estModification(): boolean {
    return this.id !== undefined;
  }

  private chargerSeance(id: number): void {
    this.service.parId(id).subscribe({
      next: (seance) => this.formulaire.patchValue({
        type: seance.type,
        distanceKm: seance.distanceKm,
        dureeMinutes: seance.dureeMinutes,
        dateHeure: seance.dateHeure.slice(0, 16),
        commentaire: seance.commentaire ?? ''
      }),
      error: () => {
        this.notifications.erreur('Séance introuvable.');
        void this.router.navigate(['/seances']);
      }
    });
  }

  protected soumettre(): void {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }

    const valeurs = this.formulaire.getRawValue();
    // Inatteignable : Validators.required a déjà rendu le formulaire invalide.
    // Le test est là pour que le typage reflète cette garantie sans `!`.
    if (valeurs.distanceKm === null || valeurs.dureeMinutes === null) {
      return;
    }

    this.envoiEnCours.set(true);
    this.refus.set(null);

    const requete = {
      type: valeurs.type,
      distanceKm: valeurs.distanceKm,
      dureeMinutes: valeurs.dureeMinutes,
      dateHeure: valeurs.dateHeure,
      commentaire: valeurs.commentaire || null,
      ville: nomDeVille(valeurs.ville).trim() || null,
      pays: (valeurs.pays ?? '').trim() || null
    };

    const appel = this.id
      ? this.service.modifier(Number(this.id), requete)
      : this.service.creer(requete);

    appel.subscribe({
      next: () => {
        this.notifications.succes(this.id ? 'Séance modifiée.' : 'Séance enregistrée.');
        void this.router.navigate(['/seances']);
      },
      error: (erreur: HttpErrorResponse) => {
        this.envoiEnCours.set(false);
        if (erreur.status === 422) {
          this.refus.set(erreur.error as RefusMetier);   // règle métier : message dédié
        }
      }
    });
  }
}
