import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { libelleType, LIBELLES_SOURCE, Seance, SourceMeteo } from '../../core/models/seance.model';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { SeanceService } from '../../core/services/seance.service';
import { NotificationService } from '../../core/services/notification.service';
import { AllurePipe } from '../../shared/pipes/allure.pipe';
import { DureePipe } from '../../shared/pipes/duree.pipe';

@Component({
    selector: 'app-seance-detail',
    imports: [DatePipe, RouterLink, AllurePipe, DureePipe, ButtonModule, SkeletonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './seance-detail.component.html',
    styleUrl: './seance-detail.component.scss'
})
export class SeanceDetailComponent implements OnInit {

  @Input() id!: string;

  private readonly service = inject(SeanceService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly seance = signal<Seance | undefined>(undefined);
  protected readonly suppressionEnCours = signal(false);

  protected readonly libelleType = libelleType;

  /**
   * Même garde que la liste : vraie dès qu'une mesure existe. Une ville et une
   * source sans aucune valeur ne font pas une météo.
   */
  protected aMeteo(seance: Seance): boolean {
    return seance.temperatureALHeureC !== null
      || seance.temperatureMaxC !== null
      || seance.temperatureMinC !== null
      || seance.ventKmH !== null
      || seance.precipitationMm !== null
      || seance.pm25 !== null
      || seance.alertesMeteo.length > 0;
  }

  /** Commencée mais pas terminée : la durée tient lieu d'heure de fin. */
  protected estEnCours(seance: Seance): boolean {
    const debut = new Date(seance.dateHeure).getTime();
    const maintenant = Date.now();
    return debut <= maintenant && maintenant < debut + seance.dureeMinutes * 60_000;
  }

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

  /**
   * ConfirmationService de PrimeNG : API à RAPPELS, là où le service maison
   * exposait un Observable qu'on chaînait en `filter(Boolean)` puis
   * `switchMap`. Le refus n'a plus besoin d'être exprimé — ne pas fournir
   * `reject` suffit, et rien ne part.
   */
  protected supprimer(id: number): void {
    this.confirmation.confirm({
      header: 'Supprimer cette séance ?',
      message: 'La séance et ses conditions météo seront effacées définitivement.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer la séance',
      rejectLabel: 'Annuler',
      // Le rouge PLEIN porte le verbe exact : c'est ce bouton que l'utilisateur
      // doit relire, pas un « OK » interchangeable.
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        this.suppressionEnCours.set(true);
        this.service.supprimer(id).subscribe({
          next: () => {
            this.notifications.succes('Séance supprimée.');
            void this.router.navigate(['/seances']);
          },
          error: () => this.suppressionEnCours.set(false)
        });
      }
    });
  }
}
