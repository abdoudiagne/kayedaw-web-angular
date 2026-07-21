import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { combineLatest, of } from 'rxjs';
import { catchError, debounceTime, startWith, switchMap } from 'rxjs/operators';
import { Statistiques, TypeSeance } from '../../core/models/seance.model';
import { SeanceService } from '../../core/services/seance.service';
import { AllurePipe } from '../../shared/pipes/allure.pipe';
import { DureePipe } from '../../shared/pipes/duree.pipe';

@Component({
  selector: 'app-statistiques',
  standalone: true,
  imports: [ReactiveFormsModule, AllurePipe, DureePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Statistiques</h1>
    <p class="silence">Ce que racontent vos sorties sur la période choisie.</p>

    <div class="periode carte">
      <!-- Raccourcis : deux dates à saisir à la main à chaque consultation
           était le principal frein à l'usage de cet écran. -->
      <div class="raccourcis" role="group" aria-label="Périodes prédéfinies">
        @for (p of periodes; track p.jours) {
          <button type="button" class="raccourci" [class.actif]="joursActifs() === p.jours"
                  (click)="appliquerPeriode(p.jours)">{{ p.libelle }}</button>
        }
      </div>
      <div class="dates">
        <label class="etiquette" for="debut">Du</label>
        <input id="debut" class="champ" type="date" [formControl]="debut" />
        <label class="etiquette" for="fin">au</label>
        <input id="fin" class="champ" type="date" [formControl]="fin" />
      </div>
    </div>

    @if (stats(); as s) {
      <dl class="indicateurs">
        <div class="tuile">
          <dt>Séances</dt><dd>{{ s.nombreSeances }}</dd>
          @if (s.comparaison; as c) {
            <p class="ecart">{{ c.nombreSeances }} sur la période précédente</p>
          }
        </div>
        <div class="tuile">
          <dt>Distance totale</dt><dd>{{ s.distanceTotaleKm }} <small>km</small></dd>
          <!-- On teste explicitement le null : un @if sur la valeur seule
               masquait une variation de 0 %, qui est pourtant une information. -->
          @if (s.comparaison?.variationDistancePourcent !== null
               && s.comparaison?.variationDistancePourcent !== undefined) {
            <!-- Un chiffre seul ne dit rien : la variation lui donne un sens -->
            <p class="ecart" [class.hausse]="variationPourcent() > 0" [class.baisse]="variationPourcent() < 0">
              {{ variationPourcent() > 0 ? '▲' : variationPourcent() < 0 ? '▼' : '=' }}
              {{ absolu(variationPourcent()) }} % vs période précédente
            </p>
          }
        </div>
        <div class="tuile"><dt>Temps total</dt><dd>{{ s.dureeTotaleMinutes | duree }}</dd></div>
        <div class="tuile"><dt>Allure moyenne</dt><dd>{{ s.allureMoyenneMinParKm | allure }}</dd></div>
      </dl>

      @if (courbe(); as c) {
        <section>
          <h2>Évolution hebdomadaire</h2>
          <!--
            Graphique en SVG pur : aucune dépendance ajoutée pour une courbe
            aussi simple. Une bibliothèque coûterait plus lourd que l'écran.
          -->
          <figure class="graphique">
            <svg [attr.viewBox]="'0 0 ' + c.largeur + ' ' + c.hauteur" role="img"
                 [attr.aria-label]="'Volume hebdomadaire, de ' + c.min + ' à ' + c.max + ' km'"
                 preserveAspectRatio="none">
              <defs>
                <linearGradient id="remplissage" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--azur)" stop-opacity=".28" />
                  <stop offset="100%" stop-color="var(--azur)" stop-opacity="0" />
                </linearGradient>
              </defs>
              <!-- Ligne de base à zéro : matérialise l'origine de l'échelle -->
              <line x1="0" [attr.y1]="c.hauteur - 12" [attr.x2]="c.largeur" [attr.y2]="c.hauteur - 12"
                    stroke="var(--bordure)" stroke-width="1" vector-effect="non-scaling-stroke" />
              <path [attr.d]="c.aire" fill="url(#remplissage)" />
              <path [attr.d]="c.ligne" fill="none" stroke="var(--azur)" stroke-width="2"
                    stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              @for (point of c.points; track point.x) {
                <circle [attr.cx]="point.x" [attr.cy]="point.y" r="3" fill="var(--marine)" />
              }
            </svg>
            <figcaption class="legende">
              @for (etiquette of c.etiquettes; track etiquette) { <span>{{ etiquette }}</span> }
            </figcaption>
            <!-- L'échelle en clair : une courbe sans graduation n'est pas une donnée -->
            <p class="echelle">Échelle 0 → {{ c.plafond }} km par semaine</p>
          </figure>
        </section>
      }

      @if (records(); as r) {
        <section>
          <h2>Records personnels</h2>
          <p class="silence rappel">Calculés sur l'ensemble de vos séances réalisées.</p>
          <dl class="records">
            <div><dt>Plus longue sortie</dt><dd>{{ r.plusLongueDistanceKm ?? '—' }} <small>km</small></dd></div>
            <div><dt>Plus longue durée</dt>
              <dd>@if (r.plusLongueDuree !== null) { {{ r.plusLongueDuree | duree }} } @else { — }</dd></div>
            <div><dt>Meilleure allure</dt>
              <dd>@if (r.meilleureAllureMinParKm !== null) { {{ r.meilleureAllureMinParKm | allure }} } @else { — }</dd></div>
            <div><dt>Plus grosse semaine</dt><dd>{{ r.plusGrosseSemaineKm ?? '—' }} <small>km</small></dd></div>
            <div><dt>Séances au total</dt><dd>{{ r.nombreTotalSeances }}</dd></div>
            <div><dt>Distance cumulée</dt><dd>{{ r.distanceCumuleeKm }} <small>km</small></dd></div>
          </dl>
        </section>
      }

      @if (repartition().length > 0) {
        <section>
          <h2>Répartition par type</h2>
          <!-- Barres en CSS pur : pas de dépendance graphique pour si peu -->
          <ul class="repartition">
            @for (ligne of repartition(); track ligne.type) {
              <li>
                <span class="libelle">{{ ligne.type }}</span>
                <span class="barre">
                  <span [style.width.%]="ligne.pourcentage" [attr.data-type]="ligne.type"></span>
                </span>
                <span class="valeur">{{ ligne.km }} km</span>
              </li>
            }
          </ul>
        </section>
      } @else {
        <p class="vide">Aucune séance sur cette période.</p>
      }
    } @else {
      <dl class="indicateurs" aria-busy="true">
        @for (tuile of squelettes; track tuile) { <div class="squelette tuile-vide"></div> }
      </dl>
    }
  `,
  styles: [`
    .periode { display: grid; gap: .9rem; margin: 1.5rem 0; padding: 1rem 1.25rem; }
    .raccourcis { display: flex; gap: .4rem; flex-wrap: wrap; }
    .raccourci { padding: .4rem .85rem; border: 1px solid var(--bordure); border-radius: 999px;
                 background: transparent; color: var(--texte-doux); font: inherit;
                 font-size: .85rem; cursor: pointer;
                 transition: all var(--transition); }
    .raccourci:hover { border-color: var(--azur); color: var(--azur); }
    .raccourci.actif { background: var(--degrade-marque); color: #fff; border-color: transparent;
                       font-weight: 600; }
    .dates { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
    .periode .etiquette { margin: 0; }
    .periode .champ { width: auto; }

    .indicateurs { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
                   gap: 1rem; margin: 1.5rem 0; }
    .tuile {
      position: relative; overflow: hidden;
      padding: 1.15rem 1.25rem; border-radius: var(--rayon);
      background: var(--surface); border: 1px solid var(--bordure); box-shadow: var(--ombre-1);
      transition: transform var(--transition), box-shadow var(--transition);
    }
    .tuile:hover { transform: translateY(-3px); box-shadow: var(--ombre-2); }
    /* Filet dégradé en haut de tuile : la marque, sans surcharger la lecture */
    .tuile::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px;
                     background: var(--degrade-marque); }
    .tuile-vide { height: 6.2rem; }
    dt { font-size: .8rem; color: var(--texte-doux); }
    dd { margin: .3rem 0 0; font-size: clamp(1.5rem, 1.2rem + .9vw, 1.9rem); font-weight: 700;
         letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
    dd small { font-size: .95rem; font-weight: 600; color: var(--texte-doux); }

    .ecart { margin: .4rem 0 0; font-size: .76rem; color: var(--texte-doux); }
    .ecart.hausse { color: var(--succes); font-weight: 600; }
    .ecart.baisse { color: var(--orange); font-weight: 600; }

    .graphique { margin: 0; padding: 1rem 1.15rem; background: var(--surface);
                 border: 1px solid var(--bordure); border-radius: var(--rayon);
                 box-shadow: var(--ombre-1); }
    .graphique svg { display: block; width: 100%; height: 10rem; }
    .legende { display: flex; justify-content: space-between; margin-top: .5rem;
               font-size: .75rem; color: var(--texte-doux); font-variant-numeric: tabular-nums; }
    .echelle { margin: .35rem 0 0; font-size: .72rem; color: var(--texte-doux); }

    .records { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
               gap: 1px; padding: 0; overflow: hidden; background: var(--bordure);
               border: 1px solid var(--bordure); border-radius: var(--rayon-large);
               box-shadow: var(--ombre-1); }
    .records > div { padding: 1rem 1.15rem; background: var(--surface); }
    .records dd { font-size: 1.25rem; }
    .rappel { margin: -.25rem 0 .75rem; font-size: .82rem; }

    .repartition { list-style: none; padding: 0; display: grid; gap: .7rem; }
    .repartition li { display: grid; grid-template-columns: 9rem 1fr 5rem; align-items: center; gap: 1rem; }
    .libelle { font-size: .85rem; }
    .barre { height: .95rem; background: var(--surface-douce); border: 1px solid var(--bordure);
             border-radius: 999px; overflow: hidden; }
    /* La barre se déploie à l'affichage : la comparaison se lit d'un coup d'œil */
    .barre > span { display: block; height: 100%; border-radius: 999px;
                    background: var(--degrade-marque);
                    animation: deploiement 620ms cubic-bezier(.2, .8, .3, 1); }
    .barre > span[data-type="FRACTIONNE"] { background: var(--degrade-accent); }
    .barre > span[data-type="RECUPERATION"] { background: linear-gradient(135deg, var(--turquoise), var(--menthe)); }
    @keyframes deploiement { from { width: 0 !important; } }
    .valeur { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .vide { color: var(--texte-doux); padding: 2rem 0; }

    @media (max-width: 40rem) {
      .repartition li { grid-template-columns: 7rem 1fr 4rem; gap: .6rem; }
    }
  `]
})
export class StatistiquesComponent {

  private readonly service = inject(SeanceService);

  private readonly ilYA30Jours = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  private readonly aujourdhui = new Date().toISOString().slice(0, 10);

  protected readonly squelettes = [1, 2, 3, 4];

  protected readonly periodes = [
    { jours: 7, libelle: '7 jours' },
    { jours: 30, libelle: '30 jours' },
    { jours: 90, libelle: '3 mois' },
    { jours: 365, libelle: '1 an' }
  ] as const;

  protected readonly debut = new FormControl(this.ilYA30Jours, { nonNullable: true });
  protected readonly fin = new FormControl(this.aujourdhui, { nonNullable: true });

  protected readonly stats = toSignal<Statistiques | undefined>(
    combineLatest([
      this.debut.valueChanges.pipe(startWith(this.debut.value)),
      this.fin.valueChanges.pipe(startWith(this.fin.value))
    ]).pipe(
      debounceTime(300),
      switchMap(([debut, fin]) =>
        this.service.statistiques(debut, fin).pipe(catchError(() => of(undefined)))
      )
    ),
    { initialValue: undefined }
  );

  /** Records : chargés une fois, indépendants de la période affichée. */
  protected readonly records = toSignal(
    this.service.records().pipe(catchError(() => of(undefined))),
    { initialValue: undefined }
  );

  /** Surligne le raccourci correspondant à la période courante, s'il y en a un. */
  protected readonly joursActifs = computed(() => {
    const stats = this.stats();          // relit après chaque changement de dates
    void stats;
    const debut = new Date(this.debut.value);
    const fin = new Date(this.fin.value);
    const jours = Math.round((fin.getTime() - debut.getTime()) / 86_400_000);
    return this.periodes.find(p => p.jours === jours)?.jours ?? null;
  });

  protected appliquerPeriode(jours: number): void {
    const fin = new Date();
    const debut = new Date();
    debut.setDate(debut.getDate() - jours);
    this.debut.setValue(debut.toISOString().slice(0, 10));
    this.fin.setValue(fin.toISOString().slice(0, 10));
  }

  protected absolu(valeur: number): number {
    return Math.abs(valeur);
  }

  /** Variation en pourcentage, 0 compris (et non « absente »). */
  protected readonly variationPourcent = computed(
    () => this.stats()?.comparaison?.variationDistancePourcent ?? 0
  );

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ COURBE EN SVG PUR — pourquoi pas de bibliothèque ?                    │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Chart.js ou D3 pèsent plus lourd que l'écran entier pour tracer une
   * polyligne. On projette ici les points dans un viewBox et on construit
   * deux chemins : la ligne et l'aire sous la courbe.
   *
   * Le `viewBox` rend le graphique responsive sans calcul de largeur en
   * pixels — le SVG s'étire, les coordonnées restent dans leur repère.
   */
  protected readonly courbe = computed(() => {
    const points = this.stats()?.evolution ?? [];
    if (points.length < 2) {
      return undefined;      // une courbe à un seul point n'apprend rien
    }

    const largeur = 600;
    const hauteur = 160;
    const marge = 12;
    const valeurs = points.map(p => p.distanceKm);
    const max = Math.max(...valeurs);
    const min = Math.min(...valeurs);

    /*
     * ⚠️ L'ÉCHELLE PART DE ZÉRO, pas du minimum de la série.
     *
     * Caler la base sur le minimum donne une courbe TROMPEUSE : trois semaines
     * à 20, 21 et 22 km (10 % d'écart réel) balayaient toute la hauteur du
     * graphique et suggéraient une explosion du volume. Sur une grandeur de
     * quantité comme un kilométrage, l'axe doit commencer à zéro pour que la
     * pente perçue corresponde à la variation réelle.
     *
     * Le `|| 1` protège le cas où toutes les valeurs sont nulles.
     */
    const plafond = max || 1;

    const coordonnees = points.map((p, i) => ({
      x: marge + (i * (largeur - 2 * marge)) / (points.length - 1),
      y: hauteur - marge - (p.distanceKm / plafond) * (hauteur - 2 * marge)
    }));

    const ligne = coordonnees
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const aire = `${ligne} L ${coordonnees[coordonnees.length - 1].x.toFixed(1)} ${hauteur - marge}`
      + ` L ${coordonnees[0].x.toFixed(1)} ${hauteur - marge} Z`;

    return {
      largeur, hauteur, ligne, aire, points: coordonnees,
      min: Math.round(min), max: Math.round(max),
      // Repère haut de l'axe : sans lui, la courbe n'est pas chiffrable
      plafond: Math.round(plafond * 10) / 10,
      // On n'affiche que quelques repères : au-delà, les dates se chevauchent
      etiquettes: points
        .filter((_, i) => i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2))
        .map(p => p.semaine.slice(5))
    };
  });

  /**
   * Signal dérivé : transforme la carte volumeParType en lignes affichables,
   * triées et avec un pourcentage. Recalculé uniquement quand `stats` change.
   */
  protected readonly repartition = computed(() => {
    const s = this.stats();
    if (!s || s.nombreSeances === 0) {
      return [];
    }

    const entrees = Object.entries(s.volumeParType) as Array<[TypeSeance, number]>;
    const total = entrees.reduce((somme, [, km]) => somme + km, 0);

    return entrees
      .map(([type, km]) => ({
        type,
        km,
        pourcentage: total > 0 ? Math.round((km / total) * 100) : 0
      }))
      .sort((a, b) => b.km - a.km);
  });
}
