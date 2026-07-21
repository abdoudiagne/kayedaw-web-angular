import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { emailValide } from '../../shared/validators/auth.validators';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ QUESTION — Reactive Forms ou Template-driven ?                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Reactive Forms dans la quasi-totalité des cas : la structure est définie en
 * TypeScript, donc TYPÉE, testable sans DOM, et adaptée aux validations
 * complexes ou aux formulaires dynamiques. On peut aussi écouter les
 * changements comme un flux (`valueChanges`).
 *
 * Template-driven convient à un formulaire trivial (une case à cocher).
 *
 * `nonNullable: true` : le contrôle revient à sa valeur initiale sur reset()
 * au lieu de devenir null — et le type devient `string` plutôt que
 * `string | null`, ce qui supprime beaucoup de tests de nullité.
 */
@Component({
  selector: 'app-connexion',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="accueil">
      <!-- Colonne de présentation : donne du contexte avant même la connexion -->
      <section class="presentation">
        <img src="assets/logo.png" alt="KayeDaw" width="260" height="142" class="logo" />
        <h1>Chaque foulée compte.</h1>
        <p class="accroche">
          Enregistrez vos séances, suivez vos allures et laissez la météo
          s'ajouter toute seule à votre carnet d'entraînement.
        </p>
        <ul class="atouts">
          <li><span aria-hidden="true">🏃</span> Séances, allures et intensité calculées</li>
          <li><span aria-hidden="true">📈</span> Statistiques sur la période de votre choix</li>
          <li><span aria-hidden="true">🌦️</span> Conditions météo du jour de la sortie</li>
        </ul>
      </section>

      <section class="carte formulaire">
        <h2 class="titre-carte">Connexion</h2>
        <p class="silence sous-titre">Content de vous revoir.</p>
        <p class="legende-requis"><span class="obligatoire" aria-hidden="true">*</span> champ obligatoire</p>

        <form [formGroup]="formulaire" (ngSubmit)="soumettre()">
          <label class="etiquette requis" for="email">Email</label>
          <input id="email" class="champ" type="email" formControlName="email" autocomplete="email"
                 aria-required="true"
                 placeholder="vous@exemple.fr" inputmode="email" spellcheck="false"
                 [attr.aria-invalid]="champInvalide('email')"
                 [attr.aria-describedby]="champInvalide('email') ? 'erreur-email' : null" />
          @if (champInvalide('email')) {
            <p class="erreur" id="erreur-email">
              @if (formulaire.controls.email.hasError('required')) { L'email est obligatoire. }
              @else { Adresse incomplète — il manque le domaine, par exemple .fr ou .com. }
            </p>
          }

          <label class="etiquette requis" for="motDePasse">Mot de passe</label>
          <div class="champ-mdp">
            <input id="motDePasse" class="champ" [type]="mdpVisible() ? 'text' : 'password'"
                   formControlName="motDePasse" autocomplete="current-password" aria-required="true"
                   placeholder="••••••••" (keyup)="detecterMajuscules($event)"
                   [attr.aria-invalid]="champInvalide('motDePasse')" />
            <!--
              type="button" IMPÉRATIF : dans un formulaire, un bouton sans type
              vaut submit et déclencherait la connexion à chaque bascule.
            -->
            <!--
              Libellé TEXTE plutôt qu'un pictogramme : un emoji dépend de la
              police du système et rend différemment sur chaque plateforme.

              Le texte visible (« Afficher ») est CONTENU dans le nom accessible
              (« Afficher le mot de passe ») grâce au complément en sr-only.
              Un aria-label qui ne contient pas le texte visible casserait le
              pilotage vocal : dire « cliquer Afficher » ne trouverait rien.
            -->
            <button type="button" class="revelateur" (click)="basculerMdp()"
                    [attr.aria-pressed]="mdpVisible()">
              <!--
              SVG EN LIGNE plutôt qu'un emoji : net à toutes les tailles et sur
              les écrans à haute densité, il se colore via currentColor donc
              suit le thème clair/sombre. Un emoji dépend, lui, de la police du
              système et change d'aspect d'une plateforme à l'autre.

              aria-hidden sur le dessin : le nom accessible du bouton vient du
              texte en sr-only, seul porteur de l'information.
            -->
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true"
                 stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
                 stroke-linejoin="round">
              <path d="M2.2 12S6 5.8 12 5.8 21.8 12 21.8 12 18 18.2 12 18.2 2.2 12 2.2 12Z" />
              <circle cx="12" cy="12" r="2.9" />
              @if (mdpVisible()) {
                <!-- Barre oblique : l'état « visible » propose de masquer -->
                <path d="M4.4 4.4 19.6 19.6" />
              }
            </svg>
            <span class="sr-only">
              {{ mdpVisible() ? 'Masquer le mot de passe' : 'Afficher le mot de passe' }}
            </span>
            </button>
          </div>
          @if (champInvalide('motDePasse')) {
            <p class="erreur">Le mot de passe est obligatoire.</p>
          }
          <!-- Cause n°1 des échecs de connexion inexpliqués -->
          @if (majusculesActives()) {
            <p class="avertissement" role="status">⚠ La touche Verr. Maj semble active.</p>
          }

          <!-- Désactivé tant que le formulaire est invalide ou pendant l'envoi.
               Les champs affichent leur erreur au blur (dirty/touched), donc
               l'utilisateur voit ce qui manque avant même d'atteindre le bouton. -->
          <button type="submit" class="bouton large"
                  [disabled]="formulaire.invalid || envoiEnCours()"
                  [attr.aria-busy]="envoiEnCours()">
            @if (envoiEnCours()) {
              <span class="rouet" aria-hidden="true"></span> Connexion…
            } @else {
              Se connecter
            }
          </button>

          @if (messageErreur(); as message) {
            <p class="erreur globale" role="alert">{{ message }}</p>
          }
        </form>

        <div class="bascule">
          <span class="silence">Pas encore de compte ?</span>
          <a routerLink="/inscription" class="bouton fantome large">Créer un compte</a>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .accueil {
      display: grid; grid-template-columns: 1.05fr .95fr; align-items: center;
      gap: clamp(2rem, 6vw, 4.5rem); padding: clamp(.5rem, 3vw, 2rem) 0;
    }
    .presentation { animation: apparition 500ms cubic-bezier(.2, .8, .3, 1); }
    .logo { width: min(16rem, 70%); height: auto; margin-bottom: 1.25rem; }
    @media (prefers-color-scheme: dark) {
      .logo { background: #fff; border-radius: .75rem; padding: .5rem .75rem; }
    }
    h1 { font-size: clamp(1.9rem, 1.2rem + 2.4vw, 2.9rem); }
    /* Dégradé appliqué au texte : l'accroche devient le point focal de la page */
    h1 {
      background: var(--degrade-marque);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .accroche { color: var(--texte-doux); font-size: 1.05rem; max-width: 32rem; margin: .5rem 0 1.75rem; }
    .atouts { list-style: none; padding: 0; margin: 0; display: grid; gap: .7rem; }
    .atouts li { display: flex; align-items: center; gap: .7rem; color: var(--texte-doux); font-size: .95rem; }
    .atouts span { display: grid; place-items: center; width: 2rem; height: 2rem; flex: 0 0 2rem;
                   border-radius: .6rem; background: var(--surface); box-shadow: var(--ombre-1); }

    .formulaire { padding: clamp(1.5rem, 3vw, 2.25rem); box-shadow: var(--ombre-3);
                  animation: apparition 500ms 80ms cubic-bezier(.2, .8, .3, 1) backwards; }
    .titre-carte { margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -.01em; }
    .sous-titre { margin: .15rem 0 1.25rem; font-size: .92rem; }
    form { display: grid; gap: .3rem; }
    .bouton.large { width: 100%; margin-top: 1.5rem; padding: .8rem; }
    .erreur { color: var(--danger); font-size: .85rem; margin: .15rem 0 0; }
    .erreur.globale { margin-top: 1rem; padding: .7rem .9rem; border-radius: .6rem;
                      background: color-mix(in srgb, var(--danger) 10%, transparent); }
    .bascule { display: grid; gap: .5rem; justify-items: center; margin-top: 1.5rem;
               padding-top: 1.25rem; border-top: 1px solid var(--bordure); font-size: .9rem; }
    .bascule .bouton { width: 100%; }

    .champ-mdp { position: relative; display: block; }
    /* Le champ réserve la place de l'icône, sinon la saisie passe dessous */
    .champ-mdp .champ { padding-right: 2.9rem; }
    .revelateur { position: absolute; right: .3rem; top: 50%; transform: translateY(-50%);
                  width: 2.2rem; height: 2.2rem; display: grid; place-items: center;
                  background: none; border: 0; border-radius: .5rem; cursor: pointer;
                  color: var(--texte-doux);
                  transition: background var(--transition), color var(--transition); }
    .revelateur:hover { background: var(--surface-douce); color: var(--azur); }
    /* L'état actif se lit sur l'icône, pas seulement au survol */
    .revelateur[aria-pressed="true"] { color: var(--azur); }
    .avertissement { margin: .3rem 0 0; font-size: .82rem; color: var(--alerte); }

    /* Indicateur d'attente : le bouton reste en place, seul son contenu change */
    .rouet { width: 1rem; height: 1rem; border-radius: 50%;
             border: 2px solid rgba(255, 255, 255, .45); border-top-color: #fff;
             animation: rotation .7s linear infinite; }
    @keyframes rotation { to { transform: rotate(1turn); } }

    @media (max-width: 52rem) {
      .accueil { grid-template-columns: 1fr; }
      /* Sur mobile, le formulaire passe DEVANT l'argumentaire : on est
         d'abord venu se connecter. */
      .presentation { order: 2; text-align: center; }
      .logo { margin-inline: auto; }
      .accroche { margin-inline: auto; }
      .atouts li { justify-content: center; }
    }
  `]
})
export class ConnexionComponent {

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);

  protected readonly envoiEnCours = signal(false);
  protected readonly messageErreur = signal<string | null>(null);

  /** Formulaire TYPÉ : formulaire.value.email est un string, pas un any. */
  protected readonly mdpVisible = signal(false);
  protected readonly majusculesActives = signal(false);

  /** Formulaire TYPÉ : formulaire.value.email est un string, pas un any. */
  protected readonly formulaire = this.fb.nonNullable.group({
    email: ['', [Validators.required, emailValide]],
    motDePasse: ['', [Validators.required]]
  });

  protected basculerMdp(): void {
    this.mdpVisible.update(v => !v);
  }

  /**
   * `getModifierState` interroge l'état RÉEL du clavier, il ne devine pas
   * à partir des caractères saisis — ce qui serait faux avec un mot de passe
   * volontairement en majuscules.
   */
  protected detecterMajuscules(evenement: KeyboardEvent): void {
    this.majusculesActives.set(evenement.getModifierState?.('CapsLock') ?? false);
  }

  protected champInvalide(nom: 'email' | 'motDePasse'): boolean {
    const champ = this.formulaire.controls[nom];
    // On n'affiche l'erreur qu'après interaction : ne pas agresser l'utilisateur
    return champ.invalid && (champ.dirty || champ.touched);
  }

  protected soumettre(): void {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();     // révèle toutes les erreurs d'un coup
      return;
    }

    this.envoiEnCours.set(true);
    this.messageErreur.set(null);

    // Normalisation identique à celle du backend : une adresse saisie
    // « User@Kayedaw.fr » doit fonctionner comme « user@kayedaw.fr ».
    const { email, motDePasse } = this.formulaire.getRawValue();

    this.auth.connecter({ email: email.trim().toLowerCase(), motDePasse }).subscribe({
      next: (reponse) => {
        this.notifications.succes(`Bienvenue ${reponse.nom} !`);
        // Retour à la page demandée avant la redirection vers la connexion
        const redirige = this.route.snapshot.queryParamMap.get('redirige') ?? '/seances';
        void this.router.navigateByUrl(redirige);
      },
      error: (erreur: HttpErrorResponse) => {
        this.envoiEnCours.set(false);
        this.messageErreur.set(
          erreur.status === 401
            ? 'Email ou mot de passe incorrect.'
            : 'Connexion impossible pour le moment.'
        );
      }
    });
  }
}
