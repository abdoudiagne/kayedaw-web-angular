import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { BehaviorSubject, interval, merge, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap, tap }
  from 'rxjs/operators';
import { libelleType, Page, PLAFOND_HEBDO_KM, Seance, TYPES_SEANCE, TypeSeance }
  from '../../core/models/seance.model';
import { SeanceService } from '../../core/services/seance.service';
import { NotificationService } from '../../core/services/notification.service';
import { AllurePipe } from '../../shared/pipes/allure.pipe';
import { DureePipe } from '../../shared/pipes/duree.pipe';
import { nomDuJour, telecharger } from '../../core/services/telechargement';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LES QUESTIONS RxJS QUI TOMBENT LE PLUS                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ► switchMap vs mergeMap vs concatMap vs exhaustMap
 *   switchMap ANNULE la requête précédente quand une nouvelle arrive. C'est
 *   exactement ce qu'il faut pour une recherche ou un filtre : si l'utilisateur
 *   change de filtre, le résultat de l'ancien ne nous intéresse plus — et sans
 *   annulation, une réponse lente pourrait écraser une réponse récente
 *   (problème de « race condition »).
 *   mergeMap parallélise · concatMap sérialise · exhaustMap ignore les nouvelles
 *   émissions tant que la précédente n'est pas terminée (idéal sur un bouton
 *   de soumission, contre le double-clic).
 *
 * ► debounceTime + distinctUntilChanged
 *   Sur un champ de saisie : on attend une pause de frappe, et on ignore une
 *   valeur identique à la précédente. Deux opérateurs, et le nombre d'appels
 *   réseau s'effondre.
 *
 * ► Comment éviter les fuites mémoire ?
 *   Trois approches : le pipe `async` (Angular désabonne tout seul),
 *   `takeUntilDestroyed()` (Angular 16+, utilisé ici), ou
 *   `takeUntil(this.destroy$)` avec un Subject émis dans ngOnDestroy.
 *   Ici on va plus loin : `toSignal` gère lui-même le cycle de vie.
 */
@Component({
    selector: 'app-seance-liste',
    imports: [DatePipe, NgTemplateOutlet, RouterLink, ReactiveFormsModule, AllurePipe, DureePipe,
      SelectModule, InputTextModule, ButtonModule, PaginatorModule, SkeletonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './seance-liste.component.html',
    styleUrl: './seance-liste.component.scss'
})
export class SeanceListeComponent {

  private readonly service = inject(SeanceService);
  private readonly notifications = inject(NotificationService);

  protected readonly typesDisponibles = TYPES_SEANCE;
  protected readonly optionsType = [...TYPES_SEANCE];
  protected readonly plafondKm = PLAFOND_HEBDO_KM;

  /** Le tri est envoyé tel quel à Spring Data (`propriété,sens`). */
  protected readonly trisDisponibles = [
    { valeur: 'dateHeure,desc', libelle: 'Date (récent)' },
    { valeur: 'dateHeure,asc', libelle: 'Date (ancien)' },
    { valeur: 'distanceKm,desc', libelle: 'Distance' },
    { valeur: 'dureeMinutes,desc', libelle: 'Durée' }
  ] as const;

  protected readonly optionsTri = [...([
    { valeur: 'dateHeure,desc', libelle: 'Date (récent)' },
    { valeur: 'dateHeure,asc', libelle: 'Date (ancien)' },
    { valeur: 'distanceKm,desc', libelle: 'Distance' },
    { valeur: 'dureeMinutes,desc', libelle: 'Durée' }
  ])];

  /** Nombre de lignes fantômes affichées pendant le chargement. */
  protected readonly squelettes = [1, 2, 3, 4, 5];

  /** Exposé au template : ENDURANCE → « Endurance ». Défini dans le modèle
      pour que les quatre écrans concernés partagent le même libellé. */
  protected readonly libelleType = libelleType;

  /**
   * Garde d'affichage de la ligne météo : vraie dès qu'UN des champs réellement
   * rendus porte une valeur.
   *
   * ⚠️ Elle ne testait que `temperatureMaxC`. Or les trois sources ne remplissent
   * pas les mêmes colonnes : une observation Météo-France peut livrer la
   * température à l'heure de la séance sans agrégat du jour, et la ligne entière
   * disparaissait alors qu'il y avait de la matière à montrer. Une garde doit
   * couvrir l'union des champs affichés, jamais un seul d'entre eux.
   *
   * `ville` et le badge « prévision » en sont volontairement exclus : seuls, ils
   * n'apprennent rien sur la météo et afficheraient une ligne vide de mesures.
   */
  protected aMeteo(seance: Seance): boolean {
    return seance.temperatureALHeureC !== null
      || seance.temperatureMaxC !== null
      || seance.temperatureMinC !== null
      || seance.ventKmH !== null
      || seance.precipitationMm !== null
      || seance.alertesMeteo.length > 0;
  }

  /**
   * Un seul FormGroup pour tous les filtres : `valueChanges` du groupe émet
   * dès qu'un champ change, ce qui évite de combiner cinq flux à la main.
   */
  protected readonly filtres = new FormGroup({
    type: new FormControl<TypeSeance | null>(null),
    debut: new FormControl<string>('', { nonNullable: true }),
    fin: new FormControl<string>('', { nonNullable: true }),
    recherche: new FormControl<string>('', { nonNullable: true }),
    tri: new FormControl<string>('dateHeure,desc', { nonNullable: true })
  });

  private readonly page$ = new BehaviorSubject<number>(0);

  /**
   * Nombre de séances par page.
   *
   * ⚠️ Déclaré AVANT le flux qui le lit : les champs s'initialisent dans
   * l'ordre d'écriture, et le placer plus bas donne « used before its
   * initialization ».
   */
  private readonly taille$ = new BehaviorSubject<number>(20);

  /**
   * Les critères de filtrage, débruités.
   *
   * ⚠️ Déclaré en CHAMP et non dans le corps de `toSignal` : celui-ci reçoit
   * une EXPRESSION, où un `const` est illégal. Le champ doit venir après
   * `filtres` et `page$`, qu'il référence — l'ordre d'initialisation des
   * champs est celui de leur écriture.
   */
  private readonly filtres$ = this.filtres.valueChanges.pipe(
    debounceTime(300),            // laisse retomber la frappe et les clics rapides
    // Comparaison STRUCTURELLE : sans elle, chaque frappe rejouerait la
    // requête même quand la valeur retombe sur la précédente.
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    // Remet le SUJET à zéro, pas seulement la requête : sans cela le
    // paginateur repartirait de son ancien numéro au clic suivant.
    tap(() => this.page$.next(0)),
    /*
     * ⚠️ `startWith` APRÈS le `tap`, et l'ordre est tout le sujet.
     *
     * Placé avant, la valeur initiale traversait le `tap` : la remise à zéro
     * partait 300 ms après l'ouverture de l'écran, c'est-à-dire souvent APRÈS
     * un premier clic sur « page suivante » — qu'elle annulait aussitôt. La
     * liste revenait à la page 1 toute seule, sans que rien ne l'explique.
     *
     * Après le `tap`, l'émission initiale ne fait que déclencher le premier
     * chargement, sans toucher à la pagination. Seul un vrai changement de
     * filtre remet à zéro.
     */
    startWith(this.filtres.getRawValue())
  );

  /**
   * Vrai pendant une requête déclenchée par un filtre ou la pagination.
   *
   * Le squelette ne couvrait que le TOUT PREMIER rendu : ensuite, `resultat()`
   * conservait la page précédente et l'écran restait figé sur d'anciens
   * résultats pendant les 300 ms de debounce plus la latence réseau. Aucun
   * signe ne distinguait « rien ne correspond » de « ça arrive ».
   */
  protected readonly enChargement = signal(false);

  /** Format aaaa-mm-jj : l'ordre alphabétique est l'ordre chronologique. */
  protected readonly periodeInvalide = signal(false);

  /**
   * `combineLatest` réémet dès que l'une des sources change : on obtient une
   * requête unique déclenchée par le filtre OU par la pagination.
   *
   * `toSignal` convertit l'Observable en signal :
   *   - lecture synchrone dans le template, sans pipe async
   *   - désabonnement automatique à la destruction du composant
   *   - fonctionne parfaitement avec OnPush
   */
  protected readonly resultat = toSignal<Page<Seance> | undefined>(
    /*
     * ┌───────────────────────────────────────────────────────────────────┐
     * │ TOUT CHANGEMENT DE FILTRE REPART À LA PREMIÈRE PAGE               │
     * └───────────────────────────────────────────────────────────────────┘
     *
     * Défaut constaté en usage : depuis la page 2, choisir un type envoyait
     * `page=1&type=FRACTIONNE`. Les douze résultats tenant sur une seule page,
     * la page 1 était VIDE — l'écran se vidait et le filtre passait pour cassé
     * alors qu'il fonctionnait parfaitement.
     *
     * Le numéro de page n'a de sens que RELATIVEMENT à un jeu de résultats :
     * en changer le critère invalide la position. C'est la même règle que le
     * tri de l'écran d'administration, qui la posait déjà — elle manquait ici.
     */
    /*
     * `merge` et non `combineLatest` : chaque source porte le critère COMPLET.
     * Un changement de filtre impose la page 0 ; un changement de page reprend
     * les filtres courants. `distinctUntilChanged` absorbe le doublon que
     * produit la remise à zéro ci-dessus — sinon deux requêtes identiques
     * partaient à chaque filtrage.
     */
    merge(
      this.filtres$.pipe(map(valeurs => [valeurs, 0, this.taille$.value] as const)),
      this.page$.pipe(map(page => [this.filtres.getRawValue(), page, this.taille$.value] as const)),
      this.taille$.pipe(map(taille => [this.filtres.getRawValue(), 0, taille] as const))
    ).pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      tap(([valeurs]) => {
        this.periodeInvalide.set(
          !!valeurs.debut && !!valeurs.fin && valeurs.fin < valeurs.debut
        );
        this.enChargement.set(true);
      }),
      switchMap(([valeurs, page, taille]) =>
        this.service.lister({
          page,
          taille,
          tri: valeurs.tri ?? 'dateHeure,desc',
          type: valeurs.type ?? null,
          debut: valeurs.debut || null,
          fin: valeurs.fin || null,
          recherche: valeurs.recherche || null
        }).pipe(
          // Erreur isolée : la liste reste affichée, on ne casse pas le flux.
          // Sans ce catchError, une seule erreur TERMINERAIT l'Observable
          // et le composant ne réagirait plus jamais aux filtres.
          catchError(() => {
            this.notifications.erreur('Impossible de charger les séances.');
            return of(undefined);
          })
        )
      ),
      // Après le switchMap : l'attente se termine sur la réponse RETENUE,
      // pas sur une requête annulée par un filtre plus récent.
      tap(() => this.enChargement.set(false))
    ),
    { initialValue: undefined }
  );

  /**
   * Battement d'une minute.
   *
   * Sans lui, « en cours » ne serait évalué qu'au chargement de la liste : une
   * séance commencée pendant que l'écran est ouvert n'apparaîtrait jamais, et
   * une séance terminée y resterait jusqu'au prochain rechargement. Le signal
   * ne sert qu'à DATER le calcul, sa valeur elle-même n'a aucun sens.
   */
  private readonly battement = toSignal(interval(60_000).pipe(startWith(0)), { initialValue: 0 });

  /**
   * Séance EN COURS : commencée mais pas encore terminée.
   *
   * Le backend ne connaît que deux états — `estPlanifiee` vaut `dateHeure >
   * maintenant. Une séance commencée il y a dix minutes est donc « réalisée »
   * pour lui, et se noyait au milieu de l'historique. C'est pourtant la seule
   * ligne de l'écran qui décrive l'instant présent.
   *
   * La fin se déduit de la durée : le modèle ne porte pas d'heure de fin.
   */
  protected readonly enCours = computed(() => {
    this.battement();                       // dépendance temporelle explicite
    const maintenant = Date.now();
    return (this.resultat()?.content ?? []).filter(s => {
      const debut = new Date(s.dateHeure).getTime();
      return debut <= maintenant && maintenant < debut + s.dureeMinutes * 60_000;
    });
  });

  private readonly idsEnCours = computed(() => new Set(this.enCours().map(s => s.id)));

  /** Séances à venir, les plus proches d'abord : c'est l'ordre du coureur. */
  protected readonly planifiees = computed(() =>
    (this.resultat()?.content ?? [])
      .filter(s => s.estPlanifiee)
      .slice()
      .sort((a, b) => a.dateHeure.localeCompare(b.dateHeure))
  );

  /** Ni planifiée, ni en train de se dérouler : l'historique proprement dit. */
  protected readonly realisees = computed(() =>
    (this.resultat()?.content ?? [])
      .filter(s => !s.estPlanifiee && !this.idsEnCours().has(s.id))
  );

  /**
   * Résumé de tête. Le volume hebdomadaire est calculé sur la SEMAINE COURANTE
   * (lundi → dimanche), pas sur la page affichée : c'est la même borne que le
   * plafond vérifié par le backend, sinon les deux chiffres divergeraient.
   */
  protected readonly resume = computed(() => {
    const page = this.resultat();
    if (!page) {
      return undefined;
    }

    const lundi = new Date();
    lundi.setHours(0, 0, 0, 0);
    // getDay() : 0 = dimanche. On ramène au lundi précédent.
    lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
    const dimanche = new Date(lundi);
    dimanche.setDate(dimanche.getDate() + 7);

    const volumeSemaine = page.content
      .filter(s => {
        const d = new Date(s.dateHeure);
        return d >= lundi && d < dimanche;
      })
      .reduce((somme, s) => somme + s.distanceKm, 0);

    return {
      volumeSemaine: Math.round(volumeSemaine * 10) / 10,
      pourcentagePlafond: Math.min(100, Math.round((volumeSemaine / PLAFOND_HEBDO_KM) * 100)),
      planifiees: this.planifiees().length,
      total: page.totalElements
    };
  });

  /**
   * ⚠️ Un `computed` ne se recalcule QUE si l'un des signaux qu'il lit a changé.
   *
   * Celui-ci lisait `filtres.getRawValue()` — un FormGroup, pas un signal. Il
   * n'avait donc AUCUNE dépendance réactive : évalué une fois au premier
   * rendu, il gardait sa valeur `false` pour toujours et le bouton
   * « Réinitialiser » n'apparaissait jamais, quel que soit le filtre posé.
   *
   * C'est le piège classique du mélange Reactive Forms / signals : il faut
   * franchir explicitement la frontière avec `toSignal(valueChanges)`.
   * Le test e2e « Réinitialiser » couvre désormais cette régression.
   */
  private readonly valeursFiltrees = toSignal(
    this.filtres.valueChanges.pipe(startWith(this.filtres.getRawValue())),
    { initialValue: this.filtres.getRawValue() }
  );

  /** Sert à n'afficher « Réinitialiser » que si quelque chose est filtré. */
  protected readonly filtresActifs = computed(() => {
    const v = this.valeursFiltrees();
    return !!(v.type || v.debut || v.fin || v.recherche);
  });

  protected reinitialiser(): void {
    this.filtres.reset({ type: null, debut: '', fin: '', recherche: '', tri: 'dateHeure,desc' });
    this.page$.next(0);
  }

  /** p-paginator émet un index de page 0-based, comme Spring Data. */
  protected allerPageParIndex(index: number): void {
    this.allerPage(index);
  }

  /**
   * Navigation ET changement du nombre de lignes, sur le même événement.
   *
   * ⚠️ Élargir la page REMET à la première : depuis la page 3 en 20 lignes,
   * passer à 50 demanderait les séances 150 à 200 d'un jeu qui n'en compte
   * plus que deux pages — l'écran reviendrait vide, exactement comme le
   * faisait le filtrage avant sa correction.
   */
  protected changerPagination(index: number, lignes: number): void {
    if (lignes !== this.taille$.value) {
      this.taille$.next(lignes);
      return;                    // le flux repart de la page 0 de lui-même
    }
    this.allerPage(index);
  }

  protected allerPage(numero: number): void {
    this.page$.next(Math.max(0, numero));
  }

  protected readonly exportEnCours = signal(false);

  /**
   * Le refus d'un export ne doit pas passer inaperçu.
   *
   * ⚠️ `erreur.interceptor` laisse remonter les statuts métier, mais un échec
   * de téléchargement n'affiche RIEN par lui-même : sans ce `error`,
   * l'utilisateur verrait le bouton tourner puis s'arrêter, sans fichier et
   * sans explication.
   */
  protected exporter(): void {
    this.exportEnCours.set(true);
    this.service.exporterPdf().subscribe({
      next: (fichier) => {
        telecharger(fichier, nomDuJour('seances'));
        this.exportEnCours.set(false);
      },
      error: () => {
        this.exportEnCours.set(false);
        this.notifications.erreur("L'export n'a pas pu être généré.");
      }
    });
  }
}
