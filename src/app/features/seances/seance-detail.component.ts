import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LIBELLES_SOURCE, Seance, SourceMeteo } from '../../core/models/seance.model';
import { SeanceService } from '../../core/services/seance.service';
import { NotificationService } from '../../core/services/notification.service';
import { AllurePipe } from '../../shared/pipes/allure.pipe';
import { DureePipe } from '../../shared/pipes/duree.pipe';

@Component({
  selector: 'app-seance-detail',
  standalone: true,
  imports: [DatePipe, RouterLink, AllurePipe, DureePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (seance(); as s) {
      <article>
        <a routerLink="/seances" class="fil">‹ Mes séances</a>

        <header class="titre">
          <div>
            <span class="type" [attr.data-type]="s.type">{{ s.type }}</span>
            @if (s.estPlanifiee) { <span class="badge-planifiee">Planifiée</span> }
            <h1>{{ s.dateHeure | date:'EEEE d MMMM y, HH:mm' }}</h1>
          </div>
          <span class="intensite">Intensité {{ s.intensite }}</span>
        </header>

        <!--
          L'emoji est purement DÉCORATIF : le dt porte déjà l'intitulé.
          D'où aria-hidden sur chacun — sinon un lecteur d'écran annoncerait
          « règle droite Distance 12 kilomètres », ce qui parasite l'écoute.
        -->
        <dl class="mesures">
          <div>
            <dt><span class="pictogramme" aria-hidden="true">📏</span> Distance</dt>
            <dd>{{ s.distanceKm }} <small>km</small></dd>
          </div>
          <div>
            <dt><span class="pictogramme" aria-hidden="true">⏱️</span> Durée</dt>
            <dd>{{ s.dureeMinutes | duree }}</dd>
          </div>
          <div>
            <dt><span class="pictogramme" aria-hidden="true">🏃</span> Allure moyenne</dt>
            <dd>{{ s.allureMinParKm | allure }}</dd>
          </div>
          <div>
            <dt><span class="pictogramme" aria-hidden="true">⚡</span> Vitesse moyenne</dt>
            <dd>{{ s.vitesseKmH }} <small>km/h</small></dd>
          </div>
        </dl>

        @if (s.ville) {
          <section class="meteo carte">
            <h2>
              Conditions à {{ s.ville }}
              @if (s.sourceMeteo) {
                <span class="source" [class.prevision]="s.sourceMeteo === 'PREVISION_OPEN_METEO'">
                  {{ libelleSource(s.sourceMeteo) }}@if (s.stationMeteo) { · {{ s.stationMeteo }} }
                </span>
              }
            </h2>
            <!--
              Une liste de définitions plutôt qu'une suite de nombres : chaque
              valeur est explicitement rattachée à ce qu'elle mesure.
              L'ancien « ↕ 23 °C / 13 °C » n'indiquait pas lequel était le
              maximum, et les emojis seuls ne disent rien à un lecteur d'écran.
            -->
            <dl class="releve">
              @if (s.temperatureALHeureC !== null) {
                <div class="phare">
                  <dt>Température à l'heure de la séance</dt>
                  <dd><span aria-hidden="true">🌡️</span> {{ s.temperatureALHeureC }} °C</dd>
                </div>
              }
              @if (s.temperatureMaxC !== null) {
                <div>
                  <dt>Maximum du jour</dt>
                  <dd><span aria-hidden="true">🔺</span> {{ s.temperatureMaxC }} °C</dd>
                </div>
              }
              @if (s.temperatureMinC !== null) {
                <div>
                  <dt>Minimum du jour</dt>
                  <dd><span aria-hidden="true">🔻</span> {{ s.temperatureMinC }} °C</dd>
                </div>
              }
              @if (s.ventKmH !== null) {
                <div>
                  <dt>Vent maximal</dt>
                  <dd><span aria-hidden="true">💨</span> {{ s.ventKmH }} km/h</dd>
                </div>
              }
              @if (s.precipitationMm !== null) {
                <div>
                  <dt>Précipitations</dt>
                  <dd><span aria-hidden="true">🌧️</span> {{ s.precipitationMm }} mm</dd>
                </div>
              }
              @if (s.pm25 !== null) {
                <div>
                  <dt>Particules fines PM2.5</dt>
                  <dd><span aria-hidden="true">🫁</span> {{ s.pm25 }} µg/m³</dd>
                </div>
              }
            </dl>
            @if (s.alertesMeteo.length > 0) {
              <ul class="alertes">
                @for (alerte of s.alertesMeteo; track alerte) { <li>⚠ {{ alerte }}</li> }
              </ul>
            }
          </section>
        }

        @if (s.commentaire) {
          <section class="commentaire carte">
            <h2>Commentaire</h2>
            <p>{{ s.commentaire }}</p>
          </section>
        }

        <div class="actions">
          <a [routerLink]="['/seances', s.id, 'modifier']" class="bouton">Modifier</a>
          <button type="button" class="danger" (click)="supprimer(s.id)"
                  [disabled]="suppressionEnCours()">
            {{ suppressionEnCours() ? 'Suppression…' : 'Supprimer' }}
          </button>
        </div>
      </article>
    } @else {
      <div aria-busy="true">
        <p class="sr-only">Chargement de la séance…</p>
        <div class="squelette bloc-titre"></div>
        <div class="squelette bloc-mesures"></div>
      </div>
    }
  `,
  styles: [`
    .fil { display: inline-block; margin-bottom: .75rem; color: var(--texte-doux);
           text-decoration: none; font-size: .9rem; transition: color var(--transition); }
    .fil:hover { color: var(--azur); }

    .titre { display: flex; align-items: flex-start; justify-content: space-between;
             gap: 1rem; flex-wrap: wrap; }
    .titre h1 { margin-top: .35rem; text-transform: capitalize; }
    .badge-planifiee { margin-left: .5rem; padding: .28rem .6rem; border-radius: 999px;
                       font-size: .72rem; font-weight: 700;
                       background: rgba(43, 123, 191, .12); color: var(--azur); }
    .type { display: inline-block; padding: .28rem .6rem; border-radius: 999px;
            font-size: .72rem; font-weight: 700; letter-spacing: .02em;
            background: var(--surface-douce); color: var(--texte-doux); }
    .type[data-type="ENDURANCE"] { background: rgba(43, 123, 191, .12); color: var(--azur); }
    .type[data-type="FRACTIONNE"] { background: rgba(240, 126, 43, .14); color: #c05f16; }
    .type[data-type="SORTIE_LONGUE"] { background: rgba(15, 76, 129, .12); color: var(--marine); }
    .type[data-type="RECUPERATION"] { background: rgba(20, 168, 160, .14); color: #0c7a74; }
    .intensite { padding: .35rem .75rem; border-radius: 999px; background: var(--surface);
                 border: 1px solid var(--bordure); color: var(--texte-doux); font-size: .85rem; }

    .mesures {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: 1px; margin: 1.5rem 0; padding: 0; overflow: hidden;
      background: var(--bordure); border: 1px solid var(--bordure);
      border-radius: var(--rayon-large); box-shadow: var(--ombre-1);
    }
    /* Les séparateurs sont l'arrière-plan de la grille : une seule ligne nette,
       sans bordure double ni bord orphelin en fin de rangée. */
    .mesures > div { padding: 1.1rem 1.25rem; background: var(--surface); }
    dt { font-size: .8rem; color: var(--texte-doux); }
    /* Taille fixe et opacité légère : le pictogramme accompagne l'intitulé
       sans lui voler la vedette ni décaler l'alignement des colonnes. */
    .pictogramme { font-size: .95rem; opacity: .85; margin-right: .15rem; }
    dd { margin: .25rem 0 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -.02em;
         font-variant-numeric: tabular-nums; }
    dd small { font-size: .9rem; font-weight: 600; color: var(--texte-doux); }

    h2 { margin: 0 0 .5rem; font-size: 1rem; }
    .meteo, .commentaire { margin: 1.25rem 0; padding: 1.25rem; }
    .releve { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
              gap: 1rem 1.25rem; margin: 0; }
    /* Le dt porte l'intitulé, le dd la valeur : la relation est explicite
       dans le DOM, pas seulement visuelle. */
    .releve dt { font-size: .7rem; font-weight: 700; letter-spacing: .04em;
                 text-transform: uppercase; color: var(--texte-doux); }
    .releve dd { margin: .2rem 0 0; font-size: 1.05rem; font-weight: 600;
                 font-variant-numeric: tabular-nums; }
    .releve .phare dd { font-size: 1.4rem; font-weight: 700; letter-spacing: -.02em; }
    /* La provenance est une métadonnée : discrète, mais toujours visible */
    .source { display: inline-block; margin-left: .5rem; padding: .18rem .5rem;
              border-radius: 999px; font-size: .68rem; font-weight: 600;
              letter-spacing: .02em; text-transform: none;
              background: rgba(20, 168, 160, .14); color: #0c7a74; }
    .source.prevision { background: rgba(240, 126, 43, .14); color: #c05f16; }
    .commentaire p { margin: 0; color: var(--texte-doux); }
    .alertes { list-style: none; padding: 0; margin: .75rem 0 0; color: var(--alerte); font-size: .9rem; }

    .actions { display: flex; align-items: center; gap: .75rem; margin-top: 2rem; flex-wrap: wrap; }
    .danger { padding: .7rem 1.25rem; border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
              background: transparent; color: var(--danger); border-radius: .65rem;
              cursor: pointer; font: inherit; font-weight: 600;
              transition: background var(--transition), color var(--transition); }
    .danger:hover:not(:disabled) { background: var(--danger); color: #fff; }
    .danger:disabled { opacity: .55; cursor: not-allowed; }

    .bloc-titre { height: 3.5rem; max-width: 22rem; margin-bottom: 1.5rem; }
    .bloc-mesures { height: 7rem; border-radius: var(--rayon-large); }
  `]
})
export class SeanceDetailComponent implements OnInit {

  @Input() id!: string;

  private readonly service = inject(SeanceService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  protected readonly seance = signal<Seance | undefined>(undefined);
  protected readonly suppressionEnCours = signal(false);

  protected libelleSource(source: SourceMeteo): string {
    return LIBELLES_SOURCE[source];
  }

  ngOnInit(): void {
    this.service.parId(Number(this.id)).subscribe({
      next: (s) => this.seance.set(s),
      error: () => {
        this.notifications.erreur('Séance introuvable.');
        void this.router.navigate(['/seances']);
      }
    });
  }

  protected supprimer(id: number): void {
    if (!confirm('Supprimer définitivement cette séance ?')) {
      return;
    }

    this.suppressionEnCours.set(true);
    this.service.supprimer(id).subscribe({
      next: () => {
        this.notifications.succes('Séance supprimée.');
        void this.router.navigate(['/seances']);
      },
      error: () => this.suppressionEnCours.set(false)
    });
  }
}
