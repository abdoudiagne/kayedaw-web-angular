import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { NotificationService } from './core/services/notification.service';
import { PreferencesService } from './core/services/preferences.service';
import { TraductionService } from './core/services/traduction.service';
import { Langue, Theme } from './core/models/preferences.model';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ QUESTION — Comment fonctionne la détection de changement ?              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Par DÉFAUT, Angular revérifie tout l'arbre de composants à chaque événement
 * (clic, requête HTTP, timer). Avec `OnPush`, un composant n'est revérifié que si :
 *   - une @Input change par RÉFÉRENCE
 *   - un événement provient du composant ou de ses enfants
 *   - le pipe `async` émet
 *   - un SIGNAL lu dans le template change
 *
 * C'est le premier levier de performance, et ça pousse à travailler avec des
 * données IMMUABLES. Combiné aux signals, OnPush devient le choix par défaut.
 *
 * Nouvelle syntaxe de contrôle de flux (@if / @for) : intégrée au compilateur
 * depuis Angular 17, elle remplace *ngIf et *ngFor. Plus besoin d'importer
 * CommonModule, et le rendu des listes est plus performant.
 */
@Component({
    selector: 'app-root',
    imports: [ToastModule, ConfirmDialogModule, ButtonModule, SelectModule,
      FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationService);
  private readonly preferences = inject(PreferencesService);
  protected readonly traduction = inject(TraductionService);

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ THÈME ET LANGUE DANS L'EN-TÊTE — donc à la portée d'un VISITEUR       │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Ils vivaient dans les préférences du compte, sur `/profil` : inaccessibles
   * sans session, et à trois clics pour les autres. Or lire une page en
   * plein soleil ou dans le noir ne demande pas de créer un compte.
   *
   * Deux niveaux de persistance, dans cet ordre :
   *   1. le navigateur, TOUJOURS — c'est la seule mémoire d'un visiteur ;
   *   2. le compte, si une session est ouverte, pour que le réglage suive
   *      l'utilisateur d'un appareil à l'autre.
   *
   * Icônes seules, avec `ariaLabel` : un sélecteur de thème étiqueté
   * « Automatique / Clair / Sombre » occuperait la moitié de l'en-tête.
   */
  protected readonly optionsTheme = [
    { valeur: 'SYSTEME' as Theme, icone: 'pi pi-desktop', libelle: 'Automatique' },
    { valeur: 'CLAIR' as Theme, icone: 'pi pi-sun', libelle: 'Clair' },
    { valeur: 'SOMBRE' as Theme, icone: 'pi pi-moon', libelle: 'Sombre' }
  ];

  /* Le gabarit de la valeur retenue ne reçoit que le CODE du thème, pas
     l'option entière : ces deux fonctions font la correspondance. */
  protected iconeTheme(valeur: Theme): string {
    return this.optionsTheme.find(o => o.valeur === valeur)?.icone ?? 'pi pi-desktop';
  }
  protected libelleTheme(valeur: Theme): string {
    return this.optionsTheme.find(o => o.valeur === valeur)?.libelle ?? 'Automatique';
  }
  protected libelleLangue(valeur: Langue): string {
    return this.optionsLangue.find(o => o.valeur === valeur)?.libelle ?? 'Français';
  }

  protected readonly optionsLangue = [
    { valeur: 'FR' as Langue, libelle: 'Français' },
    { valeur: 'EN' as Langue, libelle: 'English' }
  ];

  protected themeCourant: Theme = this.preferences.themeChoisi();
  protected get langueCourante(): Langue { return this.traduction.langue(); }

  protected changerTheme(theme: Theme | null): void {
    if (!theme) {
      return;
    }
    this.themeCourant = theme;
    this.preferences.choisirThemeLocalement(theme);
    this.preferences.persisterAuCompteSiConnecte({ theme });
  }

  protected changerLangue(langue: Langue | null): void {
    if (!langue || langue === this.traduction.langue()) {
      return;
    }
    /*
     * ⚠️ L'ORDRE compte : `appliquer` RECHARGE la page, ce qui annulerait une
     * requête partie après lui. On persiste donc d'abord, et l'on n'attend pas
     * la réponse — le réglage local suffit à rendre la bascule correcte même
     * si l'enregistrement échoue.
     */
    this.preferences.persisterAuCompteSiConnecte({ langue });
    this.traduction.appliquer(langue);
  }

  constructor() {
    /*
     * Les préférences suivent la SESSION, pas un écran.
     *
     * Placé ici et non dans AuthService : le thème et la langue doivent aussi
     * être rétablis au rechargement d'une page alors qu'une session existe
     * déjà — cas que ne couvrirait pas un appel posé dans `connecter()`.
     * L'effet réagit aux deux transitions, entrée comme sortie de session.
     */
    effect(() => {
      if (this.auth.estConnecte()) {
        this.preferences.charger().subscribe();
      } else {
        this.preferences.oublier();
      }
    }, { allowSignalWrites: true });
  }

}
