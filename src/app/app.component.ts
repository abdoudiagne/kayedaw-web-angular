import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { NotificationService } from './core/services/notification.service';

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
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="evitement" href="#contenu">Aller au contenu</a>

    <header class="entete">
      <a routerLink="/" class="marque" aria-label="KayeDaw, accueil">
        <!--
          width/height explicites : le navigateur réserve la place avant même
          d'avoir chargé l'image, ce qui évite le décalage de mise en page (CLS).
        -->
        <img src="assets/logo.png" alt="KayeDaw" width="150" height="44" />
      </a>

      @if (auth.estConnecte()) {
        <nav class="navigation">
          <a routerLink="/seances" routerLinkActive="actif">Mes séances</a>
          <a routerLink="/statistiques" routerLinkActive="actif">Statistiques</a>
          @if (auth.estAdmin()) {
            <a routerLink="/administration" routerLinkActive="actif">Administration</a>
          }
        </nav>

        <div class="utilisateur">
          <!-- Tout le bloc identité est cliquable, pas seulement l'avatar :
               une cible de 2,3 rem seule est petite, surtout au doigt. -->
          <a routerLink="/profil" class="identite" routerLinkActive="actif"
             [attr.aria-label]="'Mon profil, ' + (auth.utilisateur()?.nom ?? '')">
            <span class="avatar" aria-hidden="true">{{ auth.initiales() }}</span>
            <span class="nom">
              <strong>{{ auth.utilisateur()?.nom }}</strong>
              <small>{{ auth.villeParDefaut() }}</small>
            </span>
          </a>
          <button type="button" class="deconnexion" (click)="auth.deconnecter()">Déconnexion</button>
        </div>
      } @else {
        <nav class="navigation fin">
          <a routerLink="/connexion" routerLinkActive="actif">Connexion</a>
          <a routerLink="/inscription" class="bouton compact">Créer un compte</a>
        </nav>
      }
    </header>

    <!-- Zone d'annonce accessible : les notifications sont lues par les lecteurs d'écran -->
    <div class="notifications" role="status" aria-live="polite">
      @for (notification of notifications.notifications(); track notification.id) {
        <div class="notification" [class]="notification.type">
          <span class="pastille" aria-hidden="true">
            @switch (notification.type) {
              @case ('succes') { ✓ }
              @case ('erreur') { ! }
              @default { i }
            }
          </span>
          <span class="texte">{{ notification.texte }}</span>
          <button type="button" (click)="notifications.fermer(notification.id)" aria-label="Fermer">×</button>
        </div>
      }
    </div>

    <main class="contenu" id="contenu">
      <router-outlet />
    </main>
  `,
  styles: [`
    /* Lien d'évitement : caché jusqu'à la tabulation, exigé par le RGAA */
    .evitement { position: absolute; left: -999px; z-index: 30; padding: .7rem 1rem;
                 background: var(--surface); border-radius: .5rem; box-shadow: var(--ombre-3); }
    .evitement:focus { left: 1rem; top: 1rem; }

    /* En-tête « verre dépoli » : le contenu défile visiblement en dessous.
       -webkit- reste nécessaire pour Safari. */
    .entete {
      position: sticky; top: 0; z-index: 20;
      display: flex; align-items: center; gap: 2rem;
      padding: .7rem clamp(1rem, 4vw, 2rem);
      background: color-mix(in srgb, var(--surface) 82%, transparent);
      backdrop-filter: saturate(180%) blur(14px);
      -webkit-backdrop-filter: saturate(180%) blur(14px);
      border-bottom: 1px solid var(--bordure);
    }
    .marque { display: flex; align-items: center; text-decoration: none;
              transition: transform var(--transition); }
    .marque:hover { transform: scale(1.03); }
    .marque img { display: block; height: 2.4rem; width: auto; }
    /* Le logo est dessiné en bleu foncé sur fond clair : en thème sombre, on le
       pose sur une pastille blanche plutôt que de le laisser disparaître. */
    @media (prefers-color-scheme: dark) {
      .marque img { background: #fff; border-radius: .5rem; padding: .2rem .45rem; }
    }

    .navigation { display: flex; align-items: center; gap: .35rem; margin-right: auto; }
    .navigation.fin { margin-right: 0; margin-left: auto; }
    .navigation a {
      position: relative; padding: .5rem .8rem; border-radius: .55rem;
      color: var(--texte-doux); text-decoration: none; font-weight: 550;
      transition: color var(--transition), background var(--transition);
    }
    .navigation a:hover { color: var(--texte); background: var(--surface-douce); }
    .navigation a.actif { color: var(--marine); background: transparent; }
    /* Soulignement animé de l'onglet actif, tracé en dégradé de marque */
    .navigation a.actif::after {
      content: ''; position: absolute; left: .8rem; right: .8rem; bottom: .15rem;
      height: 2px; border-radius: 2px; background: var(--degrade-marque);
      animation: apparition 220ms ease-out;
    }
    .navigation a.bouton { color: #fff; padding: .5rem 1rem; }

    .utilisateur { display: flex; align-items: center; gap: .75rem; }
    .identite { display: flex; align-items: center; gap: .55rem; padding: .3rem .55rem .3rem .3rem;
                border-radius: 999px; text-decoration: none; color: inherit;
                transition: background var(--transition); }
    .identite:hover { background: var(--surface-douce); }
    .identite.actif { background: var(--surface-douce); outline: 2px solid var(--azur);
                      outline-offset: 1px; }
    .avatar {
      display: grid; place-items: center; width: 2.35rem; height: 2.35rem; flex: 0 0 2.35rem;
      border-radius: 50%; background: var(--degrade-marque); color: #fff;
      font-size: .82rem; font-weight: 700; letter-spacing: .02em;
      box-shadow: var(--ombre-2);
    }
    .nom { display: grid; line-height: 1.15; }
    .nom strong { font-size: .9rem; font-weight: 650; }
    .nom small { font-size: .72rem; color: var(--texte-doux); }
    .deconnexion {
      padding: .5rem .9rem; border: 1px solid var(--bordure); border-radius: .55rem;
      background: transparent; color: var(--texte-doux); font: inherit; cursor: pointer;
      transition: color var(--transition), border-color var(--transition);
    }
    .deconnexion:hover { color: var(--danger); border-color: var(--danger); }

    .notifications { position: fixed; top: 5rem; right: 1rem; display: grid; gap: .6rem;
                     z-index: 25; max-width: min(24rem, calc(100vw - 2rem)); }
    .notification {
      display: flex; align-items: center; gap: .75rem;
      padding: .8rem 1rem; border-radius: var(--rayon);
      background: var(--surface); color: var(--texte);
      border: 1px solid var(--bordure); border-left: 4px solid var(--azur);
      box-shadow: var(--ombre-3);
      animation: glissement 260ms cubic-bezier(.2, .8, .3, 1);
    }
    /* Entrée par la droite : la notification vient de là où elle s'affiche */
    @keyframes glissement {
      from { opacity: 0; transform: translateX(18px) scale(.97); }
      to { opacity: 1; transform: none; }
    }
    .pastille { display: grid; place-items: center; flex: 0 0 1.5rem; height: 1.5rem;
                border-radius: 50%; color: #fff; font-size: .8rem; font-weight: 700; }
    .notification .texte { flex: 1; font-size: .92rem; }
    .notification.succes { border-left-color: var(--succes); }
    .notification.succes .pastille { background: var(--succes); }
    .notification.erreur { border-left-color: var(--danger); }
    .notification.erreur .pastille { background: var(--danger); }
    .notification.info .pastille { background: var(--azur); }
    .notification button { background: none; border: 0; color: var(--texte-doux);
                           font-size: 1.2rem; line-height: 1; cursor: pointer; padding: 0 .15rem; }
    .notification button:hover { color: var(--texte); }

    .contenu { max-width: 68rem; margin: 0 auto; padding: clamp(1.5rem, 4vw, 2.75rem) clamp(1rem, 4vw, 2rem); }
    /* Chaque écran entre en fondu : la navigation paraît plus fluide */
    .contenu > * { animation: apparition 320ms cubic-bezier(.2, .8, .3, 1); }

    @media (max-width: 40rem) {
      .entete { flex-wrap: wrap; gap: .75rem; }
      .navigation { order: 3; width: 100%; overflow-x: auto; }
      .utilisateur { margin-left: auto; }
      /* On raccourcit la déconnexion sans jamais la supprimer :
         une action de sortie doit rester atteignable sur mobile. */
      .deconnexion { padding: .45rem .7rem; font-size: .85rem; }
      /* Le nom s'efface au profit de l'avatar : le lien reste, pas la place. */
      .nom { display: none; }
    }
  `]
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationService);
}
