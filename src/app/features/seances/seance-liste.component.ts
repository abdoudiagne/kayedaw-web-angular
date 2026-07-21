import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BehaviorSubject, combineLatest, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';
import { Page, PLAFOND_HEBDO_KM, Seance, TYPES_SEANCE, TypeSeance } from '../../core/models/seance.model';
import { SeanceService } from '../../core/services/seance.service';
import { NotificationService } from '../../core/services/notification.service';
import { AllurePipe } from '../../shared/pipes/allure.pipe';
import { DureePipe } from '../../shared/pipes/duree.pipe';

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
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet, RouterLink, ReactiveFormsModule, AllurePipe, DureePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="titre">
      <div>
        <h1>Mes séances</h1>
        <p class="silence">Votre carnet, sortie après sortie.</p>
      </div>
      <a routerLink="/seances/nouvelle" class="bouton">
        <span aria-hidden="true">+</span> Nouvelle séance
      </a>
    </header>

    @if (resume(); as r) {
      <!-- Résumé en tête : le contexte avant la liste, pas après -->
      <dl class="resume">
        <div>
          <dt>Cette semaine</dt>
          <dd>{{ r.volumeSemaine }} <small>/ {{ plafondKm }} km</small></dd>
          <div class="jauge"><span [style.width.%]="r.pourcentagePlafond"
                                   [class.proche]="r.pourcentagePlafond >= 80"></span></div>
        </div>
        <div><dt>À venir</dt><dd>{{ r.planifiees }}</dd></div>
        <div><dt>Sur la période</dt><dd>{{ r.total }}</dd></div>
      </dl>
    }

    <form class="filtres" [formGroup]="filtres">
      <div>
        <label class="etiquette" for="filtreType">Type</label>
        <select id="filtreType" class="champ" formControlName="type">
          <option [ngValue]="null">Tous</option>
          @for (type of typesDisponibles; track type.valeur) {
            <option [ngValue]="type.valeur">{{ type.libelle }}</option>
          }
        </select>
      </div>

      <div>
        <label class="etiquette" for="debut">Du</label>
        <input id="debut" class="champ" type="date" formControlName="debut" />
      </div>

      <div>
        <label class="etiquette" for="fin">Au</label>
        <input id="fin" class="champ" type="date" formControlName="fin" />
      </div>

      <div class="large">
        <label class="etiquette" for="recherche">Recherche</label>
        <input id="recherche" class="champ" type="search" formControlName="recherche"
               placeholder="commentaire ou ville" />
      </div>

      <div>
        <label class="etiquette" for="tri">Trier par</label>
        <select id="tri" class="champ" formControlName="tri">
          @for (option of trisDisponibles; track option.valeur) {
            <option [ngValue]="option.valeur">{{ option.libelle }}</option>
          }
        </select>
      </div>

      @if (filtresActifs()) {
        <button type="button" class="lien-reinit" (click)="reinitialiser()">Réinitialiser</button>
      }
    </form>

    @if (resultat(); as page) {
      @if (page.content.length === 0) {
        <div class="vide">
          <img src="assets/favicon.png" alt="" width="72" height="72" />
          <h2>Aucune séance pour le moment</h2>
          <p class="silence">Enregistrez votre première sortie, le reste se calcule tout seul.</p>
          <a routerLink="/seances/nouvelle" class="bouton">Enregistrer une séance</a>
        </div>
      } @else {
        <!--
          Séparer l'à-venir du réalisé : une séance planifiée ne se lit pas
          comme une séance courue, les mélanger dans une même liste triée
          obligeait à décoder le badge ligne par ligne.
        -->
        @if (planifiees().length > 0) {
          <h2 class="section-liste">À venir <span class="compteur">{{ planifiees().length }}</span></h2>
          <ul class="liste">
            @for (seance of planifiees(); track seance.id; let i = $index) {
              <li class="seance planifiee" [style.animation-delay.ms]="i * 35">
                <ng-container *ngTemplateOutlet="ligne; context: { $implicit: seance }" />
              </li>
            }
          </ul>
        }

        @if (realisees().length > 0) {
          <h2 class="section-liste">Réalisées</h2>
        }
        <ul class="liste">
          <!--
            track est OBLIGATOIRE avec @for. Il permet à Angular de réutiliser
            les nœuds DOM existants au lieu de tout recréer. Utiliser l'index
            comme clé annule ce bénéfice dès que la liste est réordonnée.
          -->
          @for (seance of realisees(); track seance.id; let i = $index) {
            <!-- Décalage d'apparition : la liste se déroule au lieu de surgir d'un bloc -->
            <li class="seance" [style.animation-delay.ms]="i * 35">
              <ng-container *ngTemplateOutlet="ligne; context: { $implicit: seance }" />
            </li>
          }
        </ul>

        <!--
          Une seule définition de ligne pour les deux listes : sans ce template
          partagé, toute évolution devrait être faite en double, et finirait
          par diverger.
        -->
        <ng-template #ligne let-seance>
          <a [routerLink]="['/seances', seance.id]">
            <span class="type" [attr.data-type]="seance.type">{{ libelle(seance.type) }}</span>
            <span class="date">{{ seance.dateHeure | date:'dd/MM à HH:mm' }}</span>
            <!--
              Chaque mesure porte son ÉTIQUETTE : sans elle, « 1h02 » posé
              juste après « 20/07 à 07:30 » se lit comme une heure et non
              comme une durée, et rien ne distingue l'allure du reste.
              L'étiquette est visuellement discrète mais lue par les lecteurs
              d'écran, qui annonçaient jusqu'ici trois nombres sans contexte.
            -->
            <span class="mesure m-distance">
              <span class="intitule">Distance</span>
              <span class="valeur"><strong>{{ seance.distanceKm }}</strong> km</span>
            </span>
            <span class="mesure m-duree">
              <span class="intitule">Durée</span>
              <span class="valeur">{{ seance.dureeMinutes | duree }}</span>
            </span>
            <span class="mesure m-allure">
              <span class="intitule">Allure</span>
              <span class="valeur allure">{{ seance.allureMinParKm | allure }}</span>
            </span>
            <!-- La vitesse accompagne l'allure : son sens de lecture est
                 inverse, les voir ensemble évite de confondre les deux. -->
            <span class="mesure m-vitesse">
              <span class="intitule">Vitesse</span>
              <span class="valeur">{{ seance.vitesseKmH }} km/h</span>
            </span>
            <span class="chevron" aria-hidden="true">›</span>
          </a>

          <!-- Météo : visible aussi sur les séances à venir, avec sa nature -->
          @if (seance.temperatureMaxC !== null || seance.alertesMeteo.length > 0) {
            <p class="meteo-ligne">
              @if (seance.ville) { <span class="ville">{{ seance.ville }}</span> }
              <!-- L'emoji décore, le mot informe : seul, un pictogramme est
                   ambigu et invisible pour un lecteur d'écran. -->
              @if (seance.temperatureALHeureC !== null) {
                <span><span aria-hidden="true">🌡️</span> {{ seance.temperatureALHeureC }} °C</span>
              } @else if (seance.temperatureMaxC !== null) {
                <span><span aria-hidden="true">🌡️</span> {{ seance.temperatureMaxC }} °C max</span>
              }
              @if (seance.ventKmH !== null) {
                <span><span aria-hidden="true">💨</span> vent {{ seance.ventKmH }} km/h</span>
              }
              @if (seance.sourceMeteo === 'PREVISION_OPEN_METEO') {
                <span class="prevision">prévision</span>
              }
              @if (seance.alertesMeteo.length > 0) {
                <span class="alertes">⚠ {{ seance.alertesMeteo.join(' · ') }}</span>
              }
            </p>
          }
        </ng-template>

        <nav class="pagination" aria-label="Pagination">
          <button type="button" class="bouton fantome" [disabled]="page.first"
                  (click)="allerPage(page.number - 1)">Précédent</button>
          <span class="silence">Page {{ page.number + 1 }} sur {{ page.totalPages || 1 }}</span>
          <button type="button" class="bouton fantome" [disabled]="page.last"
                  (click)="allerPage(page.number + 1)">Suivant</button>
        </nav>
      }
    } @else {
      <!-- Squelettes plutôt qu'un texte : on montre la forme de ce qui arrive -->
      <ul class="liste" aria-busy="true">
        <li class="sr-only">Chargement des séances…</li>
        @for (barre of squelettes; track barre) {
          <li class="squelette ligne"></li>
        }
      </ul>
    }
  `,
  styles: [`
    .titre { display: flex; align-items: flex-end; justify-content: space-between;
             gap: 1rem; flex-wrap: wrap; }
    .titre .silence { margin: 0; font-size: .95rem; }

    .resume { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
              gap: 1rem; margin: 1.5rem 0; }
    .resume > div { position: relative; overflow: hidden; padding: 1rem 1.15rem;
                    border-radius: var(--rayon); background: var(--surface);
                    border: 1px solid var(--bordure); box-shadow: var(--ombre-1); }
    .resume dt { font-size: .78rem; color: var(--texte-doux); }
    .resume dd { margin: .25rem 0 0; font-size: 1.5rem; font-weight: 700;
                 letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
    .resume dd small { font-size: .85rem; font-weight: 600; color: var(--texte-doux); }
    .jauge { height: 4px; margin-top: .6rem; border-radius: 2px; background: var(--bordure);
             overflow: hidden; }
    .jauge > span { display: block; height: 100%; background: var(--degrade-marque);
                    transition: width var(--transition); }
    /* Au-delà de 80 % du plafond, la couleur alerte sans bloquer */
    .jauge > span.proche { background: var(--degrade-accent); }

    .filtres { display: flex; align-items: flex-end; gap: .75rem; flex-wrap: wrap;
               margin: 1.5rem 0 1.25rem; padding: 1rem 1.15rem; background: var(--surface);
               border: 1px solid var(--bordure); border-radius: var(--rayon); }
    .filtres .etiquette { margin: 0 0 .25rem; display: block; white-space: nowrap; }
    .filtres > div { display: grid; }
    .filtres .large { flex: 1; min-width: 12rem; }
    .filtres .champ { width: auto; }
    .filtres .large .champ { width: 100%; }
    .lien-reinit { align-self: flex-end; background: none; border: 0; color: var(--azur);
                   font: inherit; font-size: .85rem; cursor: pointer; padding: .5rem .2rem;
                   text-decoration: underline; }

    .section-liste { display: flex; align-items: center; gap: .6rem; margin: 1.75rem 0 .75rem;
                     font-size: .95rem; }
    .compteur { padding: .1rem .5rem; border-radius: 999px; font-size: .72rem; font-weight: 700;
                background: rgba(43, 123, 191, .12); color: var(--azur); }
    .seance.planifiee { border-left: 3px solid var(--azur); }

    .meteo-ligne { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center;
                   margin: .55rem 0 0; font-size: .82rem; color: var(--texte-doux); }
    .meteo-ligne .ville { font-weight: 600; color: var(--texte); }
    .meteo-ligne .prevision { padding: .1rem .45rem; border-radius: 999px; font-size: .68rem;
                              font-weight: 700; text-transform: uppercase;
                              background: rgba(240, 126, 43, .14); color: #c05f16; }

    .liste { list-style: none; padding: 0; margin: 0; display: grid; gap: .6rem; }
    .seance {
      background: var(--surface); border: 1px solid var(--bordure);
      border-radius: var(--rayon); padding: .85rem 1.1rem;
      box-shadow: var(--ombre-1);
      transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
      animation: apparition 380ms cubic-bezier(.2, .8, .3, 1) backwards;
    }
    .seance:hover { transform: translateY(-2px); box-shadow: var(--ombre-2); border-color: #c9dbef; }
    .seance:hover .chevron { transform: translateX(3px); color: var(--azur); }
    .seance a { display: grid; grid-template-columns: 8.5rem 7.5rem repeat(4, minmax(4.6rem, auto)) 1fr auto;
                gap: 1rem; align-items: center; text-decoration: none; color: inherit; }

    /* Badge coloré par type : repère visuel immédiat dans une longue liste */
    .type { justify-self: start; padding: .28rem .6rem; border-radius: 999px;
            font-size: .72rem; font-weight: 700; letter-spacing: .02em;
            background: var(--surface-douce); color: var(--texte-doux); }
    .type[data-type="ENDURANCE"] { background: rgba(43, 123, 191, .12); color: var(--azur); }
    .type[data-type="FRACTIONNE"] { background: rgba(240, 126, 43, .14); color: #c05f16; }
    .type[data-type="SORTIE_LONGUE"] { background: rgba(15, 76, 129, .12); color: var(--marine); }
    .type[data-type="RECUPERATION"] { background: rgba(20, 168, 160, .14); color: #0c7a74; }

    .date { color: var(--texte-doux); font-size: .9rem; font-variant-numeric: tabular-nums; }
    .planifiee { display: block; font-size: .68rem; font-weight: 700; letter-spacing: .04em;
                 text-transform: uppercase; color: var(--azur); }
    /* Chiffres à chasse fixe : les colonnes restent alignées d'une ligne à l'autre */
    .mesure { display: grid; gap: .1rem; font-variant-numeric: tabular-nums; }
    .intitule { font-size: .64rem; font-weight: 700; letter-spacing: .06em;
                text-transform: uppercase; color: var(--texte-doux); }
    .mesure .valeur { font-size: .95rem; }
    .mesure strong { font-size: 1.05rem; }
    .allure { color: var(--texte-doux); }
    .chevron { font-size: 1.35rem; color: var(--bordure); transition: transform var(--transition), color var(--transition); }
    .alertes { color: var(--alerte); }

    .ligne { height: 3.6rem; }

    .pagination { display: flex; align-items: center; gap: 1rem; justify-content: center; margin-top: 1.75rem; }
    .pagination .bouton { padding: .5rem 1rem; }

    .vide { display: grid; justify-items: center; gap: .5rem; padding: 3.5rem 1rem;
            text-align: center; background: var(--surface); border: 1px dashed var(--bordure);
            border-radius: var(--rayon-large); }
    .vide img { opacity: .55; }
    .vide h2 { margin: .5rem 0 0; }
    .vide .bouton { margin-top: 1rem; }

    /* Entre 62 et 48rem, quatre mesures ne tiennent plus confortablement :
       la vitesse, la plus redondante avec l'allure, s'efface en premier. */
    @media (max-width: 62rem) and (min-width: 48.01rem) {
      .seance a { grid-template-columns: 8rem 7rem repeat(3, minmax(4.6rem, auto)) 1fr auto; }
      .m-vitesse { display: none; }
    }

    @media (max-width: 48rem) {
      /* En dessous de 48rem, la grille en colonnes devient illisible :
         on repasse en flux libre plutôt que de rétrécir le texte. */
      .seance a { grid-template-columns: 1fr auto; gap: .5rem 1rem; }
      .seance .date { grid-column: 2; text-align: right; }
      /* Les mesures passent sur deux rangées, étiquettes comprises :
         display:inline-block les aurait aplaties et masqué les intitulés.

         ⚠️ Classes explicites et NON :nth-of-type : les frères sont tous des
         <span>, donc :nth-of-type(1) désignait span.type et ces règles ne
         s'appliquaient à aucune mesure. */
      .m-distance { grid-column: 1 / 2; grid-row: 3; }
      .m-duree { grid-column: 2 / 3; grid-row: 3; text-align: right; }
      .m-allure { grid-column: 1 / 2; grid-row: 4; }
      .m-vitesse { grid-column: 2 / 3; grid-row: 4; text-align: right; }
      .chevron { display: none; }
    }
  `]
})
export class SeanceListeComponent {

  private readonly service = inject(SeanceService);
  private readonly notifications = inject(NotificationService);

  protected readonly typesDisponibles = TYPES_SEANCE;
  protected readonly plafondKm = PLAFOND_HEBDO_KM;

  /** Le tri est envoyé tel quel à Spring Data (`propriété,sens`). */
  protected readonly trisDisponibles = [
    { valeur: 'dateHeure,desc', libelle: 'Date (récent)' },
    { valeur: 'dateHeure,asc', libelle: 'Date (ancien)' },
    { valeur: 'distanceKm,desc', libelle: 'Distance' },
    { valeur: 'dureeMinutes,desc', libelle: 'Durée' }
  ] as const;

  /** Nombre de lignes fantômes affichées pendant le chargement. */
  protected readonly squelettes = [1, 2, 3, 4, 5];

  /** ENDURANCE → « Endurance » : on n'affiche pas une constante technique. */
  protected libelle(type: TypeSeance): string {
    return TYPES_SEANCE.find(t => t.valeur === type)?.libelle ?? type;
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
   * `combineLatest` réémet dès que l'une des sources change : on obtient une
   * requête unique déclenchée par le filtre OU par la pagination.
   *
   * `toSignal` convertit l'Observable en signal :
   *   - lecture synchrone dans le template, sans pipe async
   *   - désabonnement automatique à la destruction du composant
   *   - fonctionne parfaitement avec OnPush
   */
  protected readonly resultat = toSignal<Page<Seance> | undefined>(
    combineLatest([
      this.filtres.valueChanges.pipe(
        startWith(this.filtres.getRawValue()),
        debounceTime(300),            // laisse retomber la frappe et les clics rapides
        // Comparaison STRUCTURELLE : sans elle, chaque frappe rejouerait la
        // requête même quand la valeur retombe sur la précédente.
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      ),
      this.page$
    ]).pipe(
      switchMap(([valeurs, page]) =>
        this.service.lister({
          page,
          taille: 20,
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
      map(page => page)
    ),
    { initialValue: undefined }
  );

  /** Séances à venir, les plus proches d'abord : c'est l'ordre du coureur. */
  protected readonly planifiees = computed(() =>
    (this.resultat()?.content ?? [])
      .filter(s => s.estPlanifiee)
      .slice()
      .sort((a, b) => a.dateHeure.localeCompare(b.dateHeure))
  );

  protected readonly realisees = computed(() =>
    (this.resultat()?.content ?? []).filter(s => !s.estPlanifiee)
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

  /** Sert à n'afficher « Réinitialiser » que si quelque chose est filtré. */
  protected readonly filtresActifs = computed(() => {
    const v = this.filtres.getRawValue();
    return !!(v.type || v.debut || v.fin || v.recherche);
  });

  protected reinitialiser(): void {
    this.filtres.reset({ type: null, debut: '', fin: '', recherche: '', tri: 'dateHeure,desc' });
    this.page$.next(0);
  }

  protected allerPage(numero: number): void {
    this.page$.next(Math.max(0, numero));
  }
}
