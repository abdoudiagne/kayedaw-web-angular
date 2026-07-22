import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { combineLatest, of } from 'rxjs';
import { catchError, debounceTime, filter, startWith, switchMap } from 'rxjs/operators';
import { libelleType, Statistiques, TypeSeance } from '../../core/models/seance.model';
import { SeanceService } from '../../core/services/seance.service';
import { AllurePipe } from '../../shared/pipes/allure.pipe';
import { DureePipe } from '../../shared/pipes/duree.pipe';

/**
 * ⚠️ PAS `toISOString()`, qui bascule en UTC.
 *
 * C'est le même piège que `maintenantLocalISO()` dans le formulaire de séance,
 * qui restait ici non corrigé : passé 22 h à Paris en été, `new Date()` rendu
 * en UTC désigne DÉJÀ le lendemain. Le raccourci « 7 jours » interrogeait donc
 * une fenêtre décalée d'un jour, et la borne « au » excluait la séance du soir
 * même — celle que l'utilisateur venait d'enregistrer.
 */
function dateLocaleISO(date: Date): string {
  const decalage = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 10);
}

@Component({
    selector: 'app-statistiques',
    imports: [ReactiveFormsModule, FormsModule, AllurePipe, DureePipe,
      SelectButtonModule, InputTextModule, SkeletonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './statistiques.component.html',
    styleUrl: './statistiques.component.scss'
})
export class StatistiquesComponent {

  private readonly service = inject(SeanceService);

  private readonly ilYA30Jours = dateLocaleISO(new Date(Date.now() - 30 * 86_400_000));
  private readonly aujourdhui = dateLocaleISO(new Date());

  protected readonly squelettes = [1, 2, 3, 4];

  protected readonly periodes = [
    { jours: 7, libelle: '7 jours' },
    { jours: 30, libelle: '30 jours' },
    { jours: 90, libelle: '3 mois' },
    { jours: 365, libelle: '1 an' }
  ] as const;

  protected readonly optionsPeriode = [
    { jours: 7, libelle: '7 jours' }, { jours: 30, libelle: '30 jours' },
    { jours: 90, libelle: '3 mois' }, { jours: 365, libelle: '1 an' }
  ];

  protected readonly debut = new FormControl(this.ilYA30Jours, { nonNullable: true });
  protected readonly fin = new FormControl(this.aujourdhui, { nonNullable: true });

  protected readonly libelleType = libelleType;

  /** Les deux bornes en un seul flux : elles ne s'interprètent qu'ensemble. */
  private readonly bornes$ = combineLatest([
    this.debut.valueChanges.pipe(startWith(this.debut.value)),
    this.fin.valueChanges.pipe(startWith(this.fin.value))
  ]);

  private readonly bornes = toSignal(this.bornes$, {
    initialValue: [this.debut.value, this.fin.value] as [string, string]
  });

  /**
   * Format `aaaa-mm-jj` : l'ordre lexicographique EST l'ordre chronologique,
   * aucune conversion en Date n'est nécessaire — et aucun fuseau ne s'invite.
   */
  protected readonly periodeInvalide = computed(() => {
    const [debut, fin] = this.bornes();
    return !!debut && !!fin && fin < debut;
  });

  protected readonly stats = toSignal<Statistiques | undefined>(
    this.bornes$.pipe(
      debounceTime(300),
      // On n'interroge pas le serveur sur une période impossible : la réponse
      // vide serait indiscernable d'une période sans aucune séance.
      filter(([debut, fin]) => !(debut && fin && fin < debut)),
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
    this.debut.setValue(dateLocaleISO(debut));
    this.fin.setValue(dateLocaleISO(fin));
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
