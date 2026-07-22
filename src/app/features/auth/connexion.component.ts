import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
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
    imports: [ReactiveFormsModule, RouterLink, InputTextModule, PasswordModule, ButtonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './connexion.component.html',
    styleUrl: './connexion.component.scss'
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
        /*
         * Deux niveaux, dans cet ordre :
         *
         *  1. `redirige` — la page que l'utilisateur voulait avant d'être
         *     renvoyé ici par le garde. Elle prime toujours : l'y ramener est
         *     tout l'objet du paramètre.
         *  2. À défaut, l'écran d'accueil de son RÔLE. Le repli était codé en
         *     dur sur /seances : un administrateur atterrissait sur un carnet
         *     vide alors que son compte sert à administrer, et devait cliquer
         *     pour rejoindre le seul écran qui le concerne.
         *
         * On lit `reponse.role` et non `auth.estAdmin()` : c'est la réponse du
         * serveur qui fait foi, et elle est déjà là.
         */
        const parDefaut = reponse.role === 'ADMIN' ? '/administration' : '/seances';
        const redirige = this.route.snapshot.queryParamMap.get('redirige') ?? parDefaut;
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
