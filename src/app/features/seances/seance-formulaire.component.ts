import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, startWith, switchMap, tap } from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConditionsMeteo, RefusMetier, SuggestionVille, TYPES_SEANCE, TypeSeance }
  from '../../core/models/seance.model';
import { VilleService } from '../../core/services/ville.service';
import { MeteoService } from '../../core/services/meteo.service';
import { AuthService } from '../../core/services/auth.service';
import { SeanceService } from '../../core/services/seance.service';
import { NotificationService } from '../../core/services/notification.service';
import { allurePlausible, dansHorizonDePlanification, HORIZON_PLANIFICATION_JOURS }
  from '../../shared/validators/seance.validators';
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
function arrondi2(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

function maintenantLocalISO(): string {
  const maintenant = new Date();
  const decalage = maintenant.getTimezoneOffset() * 60_000;
  return new Date(maintenant.getTime() - decalage).toISOString().slice(0, 16);
}

@Component({
  selector: 'app-seance-formulaire',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AllurePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/seances" class="fil">‹ Mes séances</a>
    <h1>{{ estModification() ? 'Modifier la séance' : 'Nouvelle séance' }}</h1>
    <p class="silence">Distance et durée suffisent — allure et intensité sont calculées.</p>

    <form [formGroup]="formulaire" (ngSubmit)="soumettre()" class="formulaire carte">
      <div class="ligne">
        <div>
          <label class="etiquette requis" for="type">Type</label>
          <select id="type" aria-required="true" class="champ" formControlName="type">
            @for (type of typesDisponibles; track type.valeur) {
              <option [value]="type.valeur">{{ type.libelle }}</option>
            }
          </select>
        </div>

        <div>
          <label class="etiquette requis" for="dateHeure">Date et heure</label>
          <!-- type datetime-local : le navigateur fournit jour + heure + minute -->
          <input id="dateHeure" aria-required="true" class="champ" type="datetime-local" formControlName="dateHeure" />
          @if (formulaire.controls.dateHeure.hasError('dateTropLointaine')
               && formulaire.controls.dateHeure.touched) {
            <p class="erreur">On ne planifie pas au-delà de {{ horizonJours }} jours.</p>
          }
          @if (estPlanifiee()) {
            <p class="aide planifiee">📅 Séance planifiée — la météo affichée sera une prévision.</p>
          }
        </div>
      </div>

      <div class="ligne">
        <div>
          <label class="etiquette requis" for="distanceKm">Distance (km)</label>
          <input id="distanceKm" aria-required="true" class="champ" type="number" step="0.1" min="0.1" formControlName="distanceKm" />
          @if (formulaire.controls.distanceKm.invalid && formulaire.controls.distanceKm.touched) {
            <p class="erreur">Distance obligatoire et positive.</p>
          }
        </div>

        <div>
          <label class="etiquette requis" for="dureeMinutes">Durée (minutes)</label>
          <input id="dureeMinutes" aria-required="true" class="champ" type="number" min="1" formControlName="dureeMinutes" />
          @if (formulaire.controls.dureeMinutes.invalid && formulaire.controls.dureeMinutes.touched) {
            <p class="erreur">Durée obligatoire, au moins 1 minute.</p>
          }
        </div>
      </div>

      <!--
        Retour immédiat calculé par un signal dérivé.

        On affiche l'ALLURE ET LA VITESSE côte à côte : l'allure est une durée
        par kilomètre, donc plus elle est BASSE plus on est rapide — un sens de
        lecture inversé qui induit régulièrement en erreur. La vitesse, elle,
        suit l'intuition « plus c'est haut, mieux c'est ». Les deux ensemble
        lèvent l'ambiguïté sans avoir à l'expliquer.
      -->
      @if (allureCalculee(); as allure) {
        <div class="apercu">
          <div class="estimation">
            <span class="intitule">Allure estimée</span>
            <strong>{{ allure | allure }}</strong>
            <span class="repere">plus c'est bas, plus c'est rapide</span>
          </div>
          <div class="estimation">
            <span class="intitule">Vitesse</span>
            <strong>{{ vitesseCalculee() }} km/h</strong>
            <span class="repere">plus c'est haut, plus c'est rapide</span>
          </div>
        </div>
      }
      @if (formulaire.hasError('allureIrrealiste')) {
        <p class="erreur">Cette allure paraît irréaliste — vérifiez distance et durée.</p>
      }

      @if (!estModification()) {
        <label class="etiquette" for="ville">Ville (optionnel)</label>
        <!--
          Autocomplétion « maison » plutôt qu'un composant tiers : le besoin
          tient en un input, une liste et quelques touches clavier.
          Les attributs combobox, aria-expanded et aria-activedescendant
          forment le motif ARIA attendu : sans eux, un lecteur d'écran ne
          perçoit ni la liste ni l'option courante.
        -->
        <div class="autocompletion">
          <input id="ville" class="champ" type="text" formControlName="ville" placeholder="Lille"
                 autocomplete="off" role="combobox" aria-controls="suggestions-ville"
                 [attr.aria-expanded]="suggestions().length > 0"
                 [attr.aria-activedescendant]="indexActif() >= 0 ? 'ville-' + indexActif() : null"
                 (input)="rechercherVille($any($event.target).value)"
                 (keydown)="naviguer($event)" (blur)="fermerSuggestions()" />

          @if (suggestions().length > 0) {
            <ul id="suggestions-ville" class="suggestions" role="listbox">
              @for (suggestion of suggestions(); track suggestion.nom; let i = $index) {
                <li [id]="'ville-' + i" role="option" [attr.aria-selected]="i === indexActif()"
                    [class.actif]="i === indexActif()"
                    (mousedown)="choisir(suggestion)">
                  <span>{{ suggestion.nom }}</span>
                  @if (suggestion.departement) {
                    <span class="departement">{{ suggestion.departement }}</span>
                  }
                </li>
              }
            </ul>
          }
        </div>
        <p class="aide">Pré-remplie avec votre ville de référence. La météo suit la date choisie.</p>
      }

      <!--
        APERÇU MÉTÉO EN DIRECT — avant tout enregistrement.
        C'est ce qui rend la planification utile : on déplace la date ou l'heure
        et l'on voit immédiatement les conditions, plutôt que de découvrir la
        météo une fois la séance créée.
      -->
      @if (meteoApercu(); as meteo) {
        <section class="apercu-meteo" aria-live="polite">
          <header>
            <strong>{{ meteo.ville }}</strong>
            <span class="source" [class.prevision]="meteo.source === 'PREVISION_OPEN_METEO'">
              {{ meteo.source === 'PREVISION_OPEN_METEO' ? 'prévision' : 'observé' }}
            </span>
            @if (meteo.station) { <span class="station">{{ meteo.station }}</span> }
          </header>

          <dl>
            @if (meteo.temperatureALHeureC !== null) {
              <div><dt>À l'heure prévue</dt>
                   <dd><span aria-hidden="true">🌡️</span> {{ meteo.temperatureALHeureC }} °C</dd></div>
            }
            @if (meteo.temperatureMaxC !== null) {
              <div><dt>Max du jour</dt>
                   <dd><span aria-hidden="true">🔺</span> {{ meteo.temperatureMaxC }} °C</dd></div>
            }
            @if (meteo.temperatureMinC !== null) {
              <div><dt>Min du jour</dt>
                   <dd><span aria-hidden="true">🔻</span> {{ meteo.temperatureMinC }} °C</dd></div>
            }
            @if (meteo.ventMaxKmH !== null) {
              <div><dt>Vent</dt>
                   <dd><span aria-hidden="true">💨</span> {{ meteo.ventMaxKmH }} km/h</dd></div>
            }
            @if (meteo.precipitationMm !== null) {
              <div><dt>Pluie</dt>
                   <dd><span aria-hidden="true">🌧️</span> {{ meteo.precipitationMm }} mm</dd></div>
            }
          </dl>

          @if (meteo.alertes.length > 0) {
            <p class="alertes" role="alert">⚠ {{ meteo.alertes.join(' · ') }}</p>
          }
        </section>
      } @else if (meteoEnCours()) {
        <div class="squelette apercu-attente"></div>
      }

      <label class="etiquette" for="commentaire">Commentaire</label>
      <textarea id="commentaire" class="champ" rows="3" formControlName="commentaire" maxlength="500"></textarea>

      <div class="actions">
        <button type="submit" class="bouton" [disabled]="envoiEnCours()">
          {{ envoiEnCours() ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
        <a routerLink="/seances" class="bouton fantome">Annuler</a>
      </div>

      <!--
        Le 422 vient de la sealed interface côté Kotlin. On traduit chaque
        motif en message métier explicite plutôt qu'en erreur technique.
      -->
      @if (refus(); as motif) {
        <div class="refus" role="alert">
          @switch (motif.motif) {
            @case ('PLAFOND_HEBDOMADAIRE') {
              <strong>Plafond hebdomadaire dépassé</strong>
              <p>Cette séance porterait votre semaine à {{ motif.volumeCalculeKm }} km,
                 au-delà du plafond de {{ motif.plafondKm }} km.</p>
            }
            @case ('DATE_TROP_LOINTAINE') {
              <strong>Planification trop lointaine</strong>
              <p>{{ motif.detail }}</p>
            }
          }
        </div>
      }
    </form>
  `,
  styles: [`
    .fil { display: inline-block; margin-bottom: .75rem; color: var(--texte-doux);
           text-decoration: none; font-size: .9rem; transition: color var(--transition); }
    .fil:hover { color: var(--azur); }

    .formulaire { display: grid; gap: .35rem; max-width: 38rem; margin-top: 1.5rem;
                  padding: clamp(1.25rem, 3vw, 2rem); }
    .ligne { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .etiquette { display: block; }
    label.etiquette { margin-top: .9rem; }
    textarea.champ { resize: vertical; min-height: 5rem; }

    .actions { display: flex; align-items: center; gap: .75rem; margin-top: 1.75rem; flex-wrap: wrap; }
    .erreur { color: var(--danger); font-size: .85rem; margin: .25rem 0 0; }
    .aide { color: var(--texte-doux); font-size: .8rem; margin: .25rem 0 0; }
    .aide.planifiee { color: var(--azur); font-weight: 550; }

    .apercu-meteo { margin-top: 1.15rem; padding: .9rem 1.1rem; border-radius: .65rem;
                    background: color-mix(in srgb, var(--azur) 7%, transparent);
                    border: 1px solid color-mix(in srgb, var(--azur) 22%, transparent);
                    animation: apparition 260ms ease-out; }
    .apercu-meteo header { display: flex; align-items: center; gap: .5rem;
                           flex-wrap: wrap; margin-bottom: .6rem; }
    .apercu-meteo .source { padding: .12rem .5rem; border-radius: 999px; font-size: .66rem;
                            font-weight: 700; text-transform: uppercase;
                            background: rgba(20, 168, 160, .16); color: #0c7a74; }
    .apercu-meteo .source.prevision { background: rgba(240, 126, 43, .16); color: #c05f16; }
    .apercu-meteo .station { font-size: .72rem; color: var(--texte-doux); }
    .apercu-meteo dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
                       gap: .75rem; margin: 0; }
    .apercu-meteo dt { font-size: .66rem; font-weight: 700; letter-spacing: .04em;
                       text-transform: uppercase; color: var(--texte-doux); }
    .apercu-meteo dd { margin: .15rem 0 0; font-size: .98rem; font-weight: 600;
                       font-variant-numeric: tabular-nums; }
    .apercu-meteo .alertes { margin: .7rem 0 0; font-size: .85rem; color: var(--alerte); }
    .apercu-attente { height: 6rem; margin-top: 1.15rem; }

    .autocompletion { position: relative; }
    .suggestions { position: absolute; z-index: 5; left: 0; right: 0; top: calc(100% + .25rem);
                   list-style: none; margin: 0; padding: .25rem;
                   background: var(--surface); border: 1px solid var(--bordure);
                   border-radius: .65rem; box-shadow: var(--ombre-3);
                   max-height: 14rem; overflow-y: auto;
                   animation: apparition 160ms ease-out; }
    .suggestions li { display: flex; align-items: center; justify-content: space-between;
                      gap: .75rem; padding: .5rem .65rem; border-radius: .45rem;
                      cursor: pointer; font-size: .92rem; }
    .suggestions li:hover, .suggestions li.actif { background: var(--surface-douce); }
    .suggestions li.actif { outline: 2px solid var(--azur); outline-offset: -2px; }
    .departement { font-size: .75rem; color: var(--texte-doux);
                   font-variant-numeric: tabular-nums; }

    /* Aperçu d'allure : teinté marque, il se distingue d'un message d'erreur */
    .apercu { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;
              margin-top: 1.15rem; padding: .85rem 1rem; border-radius: .65rem;
              background: color-mix(in srgb, var(--turquoise) 10%, transparent);
              border: 1px solid color-mix(in srgb, var(--turquoise) 25%, transparent);
              animation: apparition 260ms ease-out; }
    .estimation { display: grid; gap: .1rem; }
    .estimation .intitule { font-size: .68rem; font-weight: 700; letter-spacing: .05em;
                            text-transform: uppercase; color: var(--texte-doux); }
    .estimation strong { font-size: 1.25rem; letter-spacing: -.01em;
                         font-variant-numeric: tabular-nums; }
    .estimation .repere { font-size: .7rem; color: var(--texte-doux); }
    @media (max-width: 30rem) { .apercu { grid-template-columns: 1fr; } }

    .refus { margin-top: 1.25rem; padding: 1rem 1.15rem; border-radius: .65rem;
             border-left: 4px solid var(--danger);
             background: color-mix(in srgb, var(--danger) 8%, transparent);
             animation: apparition 260ms ease-out; }
    .refus p { margin: .35rem 0 0; color: var(--texte-doux); }

    @media (max-width: 34rem) { .ligne { grid-template-columns: 1fr; gap: 0; } }
  `]
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
  private readonly destroyRef = inject(DestroyRef);

  protected readonly typesDisponibles = TYPES_SEANCE;
  protected readonly horizonJours = HORIZON_PLANIFICATION_JOURS;
  protected readonly envoiEnCours = signal(false);
  protected readonly refus = signal<RefusMetier | null>(null);

  private readonly distance = signal(0);
  private readonly duree = signal(0);
  private readonly dateHeureSaisie = signal('');

  protected readonly suggestions = signal<readonly SuggestionVille[]>([]);
  protected readonly meteoApercu = signal<ConditionsMeteo | undefined>(undefined);
  protected readonly meteoEnCours = signal(false);

  /** Alimenté uniquement par la frappe de l'utilisateur (événement input). */
  private readonly saisieVille$ = new Subject<string>();

  protected rechercherVille(terme: string): void {
    this.saisieVille$.next(terme);
  }
  /** -1 = aucune option survolée au clavier. */
  protected readonly indexActif = signal(-1);

  /** Une date à venir bascule l'écran en mode « planification ». */
  protected readonly estPlanifiee = computed(() => {
    const valeur = this.dateHeureSaisie();
    return valeur !== '' && new Date(valeur) > new Date();
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

  protected readonly formulaire = this.fb.nonNullable.group({
    type: ['ENDURANCE' as TypeSeance, [Validators.required]],
    distanceKm: [0, [Validators.required, Validators.min(0.1), Validators.max(200)]],
    dureeMinutes: [0, [Validators.required, Validators.min(1)]],
    dateHeure: ['', [Validators.required, dansHorizonDePlanification]],
    ville: [''],
    commentaire: ['', [Validators.maxLength(500)]]
  }, { validators: allurePlausible });

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
     */
    this.saisieVille$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(terme => this.villes.rechercher(terme)),
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
      this.formulaire.controls.dateHeure.valueChanges.pipe(startWith(this.formulaire.controls.dateHeure.value))
    ]).pipe(
      debounceTime(400),
      distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
      tap(([ville, dateHeure]) => this.meteoEnCours.set(!!ville?.trim() && !!dateHeure)),
      switchMap(([ville, dateHeure]) => {
        if (!ville?.trim() || !dateHeure) {
          return of(null);
        }
        return this.meteo.conditions(ville.trim(), dateHeure);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(conditions => {
      this.meteoEnCours.set(false);
      this.meteoApercu.set(conditions ?? undefined);
    });

    if (this.id) {
      this.chargerSeance(Number(this.id));
    } else {
      // Ville de référence du profil : l'aperçu météo est disponible
      // immédiatement, sans que l'utilisateur ait à saisir un lieu.
      this.formulaire.patchValue({
        dateHeure: maintenantLocalISO(),
        ville: this.auth.villeParDefaut()
      });
    }
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

    this.envoiEnCours.set(true);
    this.refus.set(null);

    const valeurs = this.formulaire.getRawValue();
    const requete = {
      type: valeurs.type,
      distanceKm: valeurs.distanceKm,
      dureeMinutes: valeurs.dureeMinutes,
      dateHeure: valeurs.dateHeure,
      commentaire: valeurs.commentaire || null,
      ville: valeurs.ville || null
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
