import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { PLAFOND_HEBDO_KM, TYPES_SEANCE } from '../../core/models/seance.model';
import { HORIZON_PLANIFICATION_JOURS } from '../../shared/validators/seance.validators';
import { PaysService } from '../../core/services/pays.service';
import { AuthService } from '../../core/services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PAGE D'ACCUEIL PUBLIQUE                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * La racine menait directement à l'écran de connexion : un visiteur devait
 * saisir des identifiants avant même de savoir ce que fait l'application.
 * L'argumentaire vivait d'ailleurs SUR la page de connexion, où il encombrait
 * un formulaire de deux champs.
 *
 * Il est ici, et l'écran de connexion redevient ce qu'il doit être : un
 * formulaire.
 *
 * ⚠️ Les chiffres affichés sont IMPORTÉS des constantes qui font foi
 * (`PLAFOND_HEBDO_KM`, `HORIZON_PLANIFICATION_JOURS`, `TYPES_SEANCE`, le
 * référentiel des pays), jamais recopiés. Une page vitrine qui annonce
 * « 14 jours » quand le code en applique 30 est pire que muette : elle ment,
 * et personne ne pense à la relire en changeant une règle.
 */
@Component({
  selector: 'app-accueil',
  imports: [RouterLink, ButtonModule, CardModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accueil.component.html',
  styleUrl: './accueil.component.scss'
})
export class AccueilComponent {

  private readonly referentiel = inject(PaysService);
  /** Lu par le gabarit : les appels à l'action dépendent de la session. */
  protected readonly auth = inject(AuthService);

  /**
   * L'écran d'arrivée du rôle — la même règle que partout ailleurs : un
   * administrateur administre, un membre consulte son carnet.
   */
  protected readonly accueilDuRole = computed(
    () => this.auth.estAdmin() ? '/administration' : '/seances'
  );
  protected readonly libelleAccueilDuRole = computed(
    () => this.auth.estAdmin() ? 'Administrer les comptes' : 'Mes séances'
  );

  protected readonly plafondKm = PLAFOND_HEBDO_KM;
  protected readonly horizonJours = HORIZON_PLANIFICATION_JOURS;
  protected readonly types = TYPES_SEANCE;

  /** Le nombre réel de pays couverts, lu à la source plutôt qu'annoncé. */
  protected readonly nombrePays = toSignal(
    this.referentiel.tous().pipe(map(liste => liste.length)),
    { initialValue: 0 }
  );

  protected readonly atouts = [
    {
      icone: 'pi pi-stopwatch',
      titre: 'Allure et vitesse calculées',
      texte: 'Distance et durée suffisent. L\'allure en min/km et la vitesse en '
        + 'km/h sont dérivées, et affichées côte à côte : elles se lisent en sens '
        + 'inverse, les voir ensemble évite de les confondre.'
    },
    {
      icone: 'pi pi-cloud',
      titre: 'La météo, sans la saisir',
      texte: 'Chaque séance est enrichie automatiquement : température à l\'heure '
        + 'exacte de la sortie, minimum et maximum du jour, vent, pluie et '
        + 'particules fines. Rien à renseigner.'
    },
    {
      icone: 'pi pi-calendar',
      titre: 'Planifier, pas seulement consigner',
      texte: 'Une séance peut être posée à l\'avance, avec la prévision du '
        + 'créneau choisi. Déplacez l\'heure, la météo suit.'
    },
    {
      icone: 'pi pi-chart-line',
      titre: 'Des statistiques honnêtes',
      texte: 'Volume, allure moyenne, évolution hebdomadaire et records. Les '
        + 'séances planifiées en sont exclues : les statistiques reflètent ce qui '
        + 'a été couru, pas ce qui était prévu.'
    }
  ];

  /**
   * Résumé de la pile, affiché sous l'invitation à essayer.
   *
   * Volontairement COURT et sans numéro de version pour les éléments qui
   * bougent : une vitrine qui affiche « Angular 20 » six mois après la montée
   * en 21 décrédibilise tout le reste. Les deux versions citées sont celles
   * qui portent une décision explicite — la pile est figée en 21 côté PrimeNG
   * faute de licence en 22.
   */
  protected readonly pile = [
    'Angular 21', 'PrimeNG 21', 'TypeScript', 'Signals', 'RxJS',
    'Kotlin', 'Spring Boot', 'JWT', 'JPA / H2', 'Playwright'
  ];

  protected readonly sources = [
    {
      nom: 'Observations Météo-France',
      quand: 'Séance passée en France',
      detail: 'Relevés réels de la station la plus proche, avec la température '
        + 'à l\'heure de la sortie.'
    },
    {
      nom: 'Archive Open-Meteo',
      quand: 'Séance passée ailleurs',
      detail: 'Réanalyse mondiale, quand aucune station Météo-France ne couvre '
        + 'le lieu.'
    },
    {
      nom: 'Prévision Open-Meteo',
      quand: 'Séance à venir',
      detail: 'Prévision du créneau choisi, jusqu\'à quatorze jours à l\'avance.'
    }
  ];
}
