import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { PLAFOND_HEBDO_KM, TYPES_SEANCE } from '../../core/models/seance.model';
import { HORIZON_PLANIFICATION_JOURS } from '../../shared/validators/seance.validators';
import { PaysService } from '../../core/services/pays.service';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PAGE « À PROPOS » — ce que l'accueil ne doit PAS porter                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * L'accueil s'adresse à quelqu'un qui se demande « à quoi ça sert ». Cette
 * page-ci répond à « comment c'est fait », et les deux publics ne sont pas le
 * même : empiler la pile technique sous l'argumentaire allongeait l'accueil
 * pour un lecteur sur dix.
 *
 * Elle est PUBLIQUE et sans garde : c'est la carte d'identité du projet, elle
 * n'a rien à cacher et doit rester lisible sans compte — y compris une fois
 * connecté, contrairement à l'accueil qui, lui, renvoie vers son propre écran.
 *
 * ⚠️ Aucun chiffre de règle métier n'est recopié ici : plafond, horizon,
 * nombre de types et de pays sont IMPORTÉS de ce qui fait foi. Une page « à
 * propos » qui décrit une version antérieure du logiciel est pire que muette.
 */
@Component({
  selector: 'app-a-propos',
  imports: [RouterLink, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './a-propos.component.html',
  styleUrl: './a-propos.component.scss'
})
export class AProposComponent {

  private readonly referentiel = inject(PaysService);

  protected readonly plafondKm = PLAFOND_HEBDO_KM;
  protected readonly horizonJours = HORIZON_PLANIFICATION_JOURS;
  protected readonly nombreTypes = TYPES_SEANCE.length;

  protected readonly nombrePays = toSignal(
    this.referentiel.tous().pipe(map(liste => liste.length)),
    { initialValue: 0 }
  );

  /**
   * Les deux moitiés du projet, chacune dans son dépôt.
   *
   * Les versions sont écrites ici et non lues dans `package.json` : ce fichier
   * n'est pas accessible au navigateur, et l'y exposer par un import forcerait
   * le bundler à embarquer tout le manifeste dans le lot livré.
   */
  protected readonly piles = [
    {
      cote: 'Frontend',
      depot: 'kayedaw-web-angular',
      lignes: [
        { quoi: 'Angular 21', pourquoi: 'entièrement standalone, aucun NgModule' },
        { quoi: 'Signals + RxJS', pourquoi: 'signaux pour l\'état, flux pour l\'HTTP' },
        { quoi: 'PrimeNG 21 · thème Aura', pourquoi: 'figé en 21 : la 22 exige une licence' },
        { quoi: 'TypeScript 5.9 strict', pourquoi: 'templates typés, formulaires typés' },
        { quoi: 'SCSS + jetons de marque', pourquoi: 'thème clair et sombre, aucun hex en dur' },
        { quoi: 'Karma · Playwright', pourquoi: 'fonctions pures en unitaire, interface en e2e' }
      ]
    },
    {
      cote: 'Backend',
      depot: 'kayedaw-api-kotlin',
      lignes: [
        { quoi: 'Kotlin 1.9 · Java 21', pourquoi: 'threads virtuels activés' },
        { quoi: 'Spring Boot 3.3', pourquoi: 'Web, Data JPA, Security, Validation' },
        { quoi: 'JWT · BCrypt', pourquoi: 'sans état, autorisation en double barrière' },
        { quoi: 'H2 en mémoire', pourquoi: 'démonstration : tout repart à chaque démarrage' },
        { quoi: 'WebClient + coroutines', pourquoi: 'appels météo concurrents, sous budget' },
        { quoi: 'JUnit 5 · MockK · MockWebServer', pourquoi: 'pyramide, du pur Kotlin au bout en bout' }
      ]
    }
  ];

  /** Les partis pris qu'on défend en entretien, pas la liste des dépendances. */
  protected readonly choix = [
    {
      titre: 'Les refus métier ne sont pas des exceptions',
      texte: 'Dépasser le plafond hebdomadaire ou planifier trop loin sont des '
        + 'issues NORMALES : elles vivent dans le type de retour (une sealed '
        + 'interface Kotlin), visibles dans la signature et vérifiées par le '
        + 'compilateur. Ajouter un cas casse la compilation partout où il '
        + 'manque — c\'est la fonctionnalité, pas l\'inconvénient.'
    },
    {
      titre: 'Un garde de route n\'est pas de la sécurité',
      texte: 'Les guards Angular évitent d\'afficher un écran vide. N\'importe '
        + 'qui peut appeler l\'API directement : l\'autorisation est côté '
        + 'serveur, en deux couches (règles d\'URL et @PreAuthorize), et la '
        + 'propriété des données est vérifiée dans le service.'
    },
    {
      titre: 'La météo ne doit jamais casser un écran',
      texte: 'Tout appel sortant retombe sur null plutôt que de lever : une '
        + 'séance s\'enregistre même si les trois services météo sont muets. '
        + 'Chaque appel a son budget de temps, et le client sait toujours '
        + 'laquelle des trois sources a répondu.'
    },
    {
      titre: 'Les validations du front doublent celles du serveur',
      texte: 'Volontairement. Le front donne un retour immédiat, le serveur '
        + 'reste la seule autorité. Les deux seuils sont documentés comme '
        + 'devant rester alignés — ils ont divergé une fois, et c\'était un '
        + 'échec de création sans cause visible.'
    }
  ];
}
