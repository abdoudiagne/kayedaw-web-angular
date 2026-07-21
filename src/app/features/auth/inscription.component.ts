import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs/operators';
import { SuggestionVille } from '../../core/models/seance.model';
import { emailValide, motDePasseNonTrivial, robustesseMotDePasse }
  from '../../shared/validators/auth.validators';
import { AuthService } from '../../core/services/auth.service';
import { VilleService } from '../../core/services/ville.service';
import { NotificationService } from '../../core/services/notification.service';

/** Validateur de groupe : les deux mots de passe doivent correspondre. */
const motsDePasseIdentiques = (groupe: AbstractControl): ValidationErrors | null => {
  const mdp = groupe.get('motDePasse')?.value as string;
  const confirmation = groupe.get('confirmation')?.value as string;
  return mdp && confirmation && mdp !== confirmation ? { motsDePasseDifferents: true } : null;
};

@Component({
  selector: 'app-inscription',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="carte formulaire">
      <img src="assets/favicon.png" alt="" width="48" height="48" class="embleme" />
      <h1>Créer un compte</h1>
      <p class="silence sous-titre">Un carnet d'entraînement, en trente secondes.</p>
      <p class="legende-requis"><span class="obligatoire" aria-hidden="true">*</span> champ obligatoire</p>

      <form [formGroup]="formulaire" (ngSubmit)="soumettre()">
        <label class="etiquette requis" for="nom">Nom</label>
        <input id="nom" aria-required="true" class="champ" type="text" formControlName="nom" autocomplete="name" />
        @if (champInvalide('nom')) { <p class="erreur">Le nom est obligatoire.</p> }

        <label class="etiquette requis" for="villeParDefaut">Ville habituelle</label>
        <div class="autocompletion">
          <input id="villeParDefaut" aria-required="true" class="champ" type="text" formControlName="villeParDefaut"
                 placeholder="Lille" autocomplete="off" role="combobox"
                 [attr.aria-expanded]="suggestions().length > 0"
                 [attr.aria-activedescendant]="indexActif() >= 0 ? 'ville-' + indexActif() : null"
                 aria-controls="suggestions-ville"
                 (input)="rechercherVille($any($event.target).value)"
                 (keydown)="naviguer($event)" (blur)="fermerSuggestions()" />
          @if (suggestions().length > 0) {
            <ul id="suggestions-ville" class="suggestions" role="listbox">
              @for (suggestion of suggestions(); track suggestion.nom; let i = $index) {
                <li [id]="'ville-' + i" role="option" [attr.aria-selected]="i === indexActif()"
                    [class.actif]="i === indexActif()" (mousedown)="choisir(suggestion)">
                  <span>{{ suggestion.nom }}</span>
                  @if (suggestion.departement) {
                    <span class="departement">{{ suggestion.departement }}</span>
                  }
                </li>
              }
            </ul>
          }
        </div>
        @if (champInvalide('villeParDefaut')) { <p class="erreur">La ville est obligatoire.</p> }
        <p class="aide">
          Elle pré-remplira vos séances et permettra d'afficher la météo prévue
          dès que vous choisirez une date.
        </p>

        <label class="etiquette requis" for="email">Email</label>
        <input id="email" aria-required="true" class="champ" type="email" formControlName="email" autocomplete="email"
               placeholder="vous@exemple.fr" inputmode="email" spellcheck="false"
               [attr.aria-invalid]="champInvalide('email')" />
        @if (champInvalide('email')) {
          <p class="erreur">
            @if (formulaire.controls.email.hasError('required')) { L'email est obligatoire. }
            @else { Adresse incomplète — il manque le domaine, par exemple .fr ou .com. }
          </p>
        }

        <label class="etiquette requis" for="motDePasse">Mot de passe</label>
        <div class="champ-mdp">
          <input id="motDePasse" aria-required="true" class="champ" [type]="mdpVisible() ? 'text' : 'password'"
                 formControlName="motDePasse" autocomplete="new-password"
                 (keyup)="detecterMajuscules($event)"
                 [attr.aria-invalid]="champInvalide('motDePasse')" />
          <!-- type="button" : sans lui, la bascule soumettrait le formulaire -->
          <!-- Texte plutôt qu'emoji : rendu stable sur toutes les plateformes.
               Le sr-only complète le nom accessible sans alourdir l'affichage. -->
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
        <!-- Jauge de robustesse : un retour immédiat vaut mieux qu'un message d'erreur -->
        <div class="jauge" role="presentation">
          <span [style.width.%]="robustesse()" [attr.data-niveau]="niveauRobustesse()"></span>
        </div>
        @if (champInvalide('motDePasse')) {
          <p class="erreur">
            @if (formulaire.controls.motDePasse.hasError('motDePasseTropCourant')) {
              Ce mot de passe est trop courant — c'est le premier essai d'une attaque.
            } @else {
              8 caractères minimum.
            }
          </p>
        }
        @if (majusculesActives()) {
          <p class="avertissement" role="status">⚠ La touche Verr. Maj semble active.</p>
        }

        <label class="etiquette requis" for="confirmation">Confirmer le mot de passe</label>
        <input id="confirmation" aria-required="true" class="champ" [type]="mdpVisible() ? 'text' : 'password'"
               formControlName="confirmation" autocomplete="new-password"
               [attr.aria-invalid]="formulaire.hasError('motsDePasseDifferents')" />
        @if (formulaire.hasError('motsDePasseDifferents') && formulaire.controls.confirmation.touched) {
          <p class="erreur">Les mots de passe ne correspondent pas.</p>
        }

        <!-- Désactivé tant que le formulaire est invalide (champs obligatoires,
             email, robustesse du mot de passe, concordance) ou pendant l'envoi. -->
        <button type="submit" class="bouton large"
                [disabled]="formulaire.invalid || envoiEnCours()">
          @if (envoiEnCours()) {
            <span class="rouet" aria-hidden="true"></span> Création…
          } @else {
            Créer mon compte
          }
        </button>

        @if (messageErreur(); as message) {
          <p class="erreur globale" role="alert">{{ message }}</p>
        }
      </form>

      <div class="bascule">
        <span class="silence">Déjà inscrit ?</span>
        <a routerLink="/connexion" class="bouton fantome large">Se connecter</a>
      </div>
    </section>
  `,
  styles: [`
    .formulaire { max-width: 27rem; margin: clamp(1rem, 4vw, 2.5rem) auto;
                  padding: clamp(1.5rem, 3vw, 2.25rem); box-shadow: var(--ombre-3); }
    .embleme { display: block; margin-bottom: .75rem; }
    .sous-titre { margin: .1rem 0 1.5rem; font-size: .92rem; }
    form { display: grid; gap: .3rem; }
    .bouton.large { width: 100%; margin-top: 1.5rem; padding: .8rem; }
    .erreur { color: var(--danger); font-size: .85rem; margin: .15rem 0 0; }
    .erreur.globale { margin-top: 1rem; padding: .7rem .9rem; border-radius: .6rem;
                      background: color-mix(in srgb, var(--danger) 10%, transparent); }
    .lien { margin: 1.5rem 0 0; font-size: .9rem; color: var(--texte-doux); }

    .autocompletion { position: relative; }
    .suggestions { position: absolute; z-index: 5; left: 0; right: 0; top: calc(100% + .25rem);
                   list-style: none; margin: 0; padding: .25rem;
                   background: var(--surface); border: 1px solid var(--bordure);
                   border-radius: .65rem; box-shadow: var(--ombre-3);
                   max-height: 14rem; overflow-y: auto; animation: apparition 160ms ease-out; }
    .suggestions li { display: flex; align-items: center; justify-content: space-between;
                      gap: .75rem; padding: .5rem .65rem; border-radius: .45rem;
                      cursor: pointer; font-size: .92rem; }
    .suggestions li:hover { background: var(--surface-douce); }
    .departement { font-size: .75rem; color: var(--texte-doux); }
    .aide { color: var(--texte-doux); font-size: .78rem; margin: .3rem 0 0; }
    .suggestions li.actif { background: var(--surface-douce);
                            outline: 2px solid var(--azur); outline-offset: -2px; }

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

    .bascule { display: grid; gap: .5rem; justify-items: center; margin-top: 1.5rem;
               padding-top: 1.25rem; border-top: 1px solid var(--bordure); font-size: .9rem; }
    .bascule .bouton { width: 100%; }

    .jauge { height: 4px; margin-top: .45rem; border-radius: 2px;
             background: var(--bordure); overflow: hidden; }
    .jauge > span { display: block; height: 100%; border-radius: 2px;
                    transition: width var(--transition), background var(--transition); }
    .jauge > span[data-niveau="faible"] { background: var(--danger); }
    .jauge > span[data-niveau="moyen"] { background: var(--orange); }
    .jauge > span[data-niveau="fort"] { background: var(--succes); }

    .rouet { width: 1rem; height: 1rem; border-radius: 50%;
             border: 2px solid rgba(255, 255, 255, .45); border-top-color: #fff;
             animation: rotation .7s linear infinite; }
    @keyframes rotation { to { transform: rotate(1turn); } }
  `]
})
export class InscriptionComponent {

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly villes = inject(VilleService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly suggestions = signal<readonly SuggestionVille[]>([]);
  protected readonly indexActif = signal(-1);
  protected readonly mdpVisible = signal(false);
  protected readonly majusculesActives = signal(false);

  protected readonly envoiEnCours = signal(false);
  protected readonly messageErreur = signal<string | null>(null);

  protected readonly formulaire = this.fb.nonNullable.group({
    nom: ['', [Validators.required]],
    villeParDefaut: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, emailValide]],
    motDePasse: ['', [Validators.required, Validators.minLength(8), motDePasseNonTrivial]],
    confirmation: ['', [Validators.required]]
  }, { validators: motsDePasseIdentiques });   // validateur au niveau du GROUPE

  /**
   * Le flux du champ devient un signal : la jauge se met à jour à la frappe,
   * sans abonnement manuel ni risque de fuite (toSignal gère le cycle de vie).
   * Déclaré APRÈS `formulaire` : un champ ne peut pas lire un champ défini plus bas.
   */
  private readonly motDePasseSaisi = toSignal(
    this.formulaire.controls.motDePasse.valueChanges.pipe(startWith('')),
    { initialValue: '' }
  );

  /**
   * Score indicatif, jamais bloquant. La fonction vit dans les validateurs
   * partagés : elle est ainsi testable sans monter le composant.
   */
  protected readonly robustesse = computed(() => robustesseMotDePasse(this.motDePasseSaisi()));

  /** Alimenté uniquement par la frappe : un remplissage automatique du
      navigateur ne doit pas déplier la liste tout seul. */
  private readonly saisieVille$ = new Subject<string>();

  protected rechercherVille(terme: string): void {
    this.saisieVille$.next(terme);
  }

  /** Autocomplétion : même mécanique que dans le formulaire de séance. */
  private readonly villeSaisie = toSignal(
    this.saisieVille$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(terme => this.villes.rechercher(terme)),
      takeUntilDestroyed(this.destroyRef)
    ),
    { initialValue: [] as readonly SuggestionVille[] }
  );

  protected choisir(suggestion: SuggestionVille): void {
    this.formulaire.controls.villeParDefaut.setValue(suggestion.nom);
    this.suggestions.set([]);
    this.indexActif.set(-1);
  }

  protected basculerMdp(): void {
    this.mdpVisible.update(v => !v);
  }

  protected detecterMajuscules(evenement: KeyboardEvent): void {
    this.majusculesActives.set(evenement.getModifierState?.('CapsLock') ?? false);
  }

  /** Flèches pour parcourir, Entrée pour choisir, Échap pour fermer. */
  protected naviguer(evenement: KeyboardEvent): void {
    const total = this.suggestions().length;
    if (total === 0) {
      return;
    }

    switch (evenement.key) {
      case 'ArrowDown':
        evenement.preventDefault();
        this.indexActif.update(i => (i + 1) % total);
        break;
      case 'ArrowUp':
        evenement.preventDefault();
        this.indexActif.update(i => (i - 1 + total) % total);
        break;
      case 'Enter':
        if (this.indexActif() >= 0) {
          // Sans preventDefault, Entrée soumettrait le formulaire entier
          evenement.preventDefault();
          this.choisir(this.suggestions()[this.indexActif()]);
        }
        break;
      case 'Escape':
        this.suggestions.set([]);
        this.indexActif.set(-1);
        break;
    }
  }

  protected fermerSuggestions(): void {
    // Différé : sinon le blur ferme la liste avant que le clic soit pris
    setTimeout(() => this.suggestions.set([]), 150);
  }

  protected readonly niveauRobustesse = computed(() => {
    const score = this.robustesse();
    return score < 40 ? 'faible' : score < 75 ? 'moyen' : 'fort';
  });

  protected champInvalide(nom: 'nom' | 'email' | 'motDePasse' | 'villeParDefaut'): boolean {
    const champ = this.formulaire.controls[nom];
    return champ.invalid && (champ.dirty || champ.touched);
  }

  constructor() {
    // Le flux alimente le signal affiché ; passer par un effect évite
    // d'écrire un signal pendant le calcul d'un autre.
    effect(() => this.suggestions.set(this.villeSaisie()), { allowSignalWrites: true });
  }

  protected soumettre(): void {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }

    this.envoiEnCours.set(true);
    this.messageErreur.set(null);

    // On n'envoie pas le champ de confirmation au serveur
    const { nom, email, motDePasse, villeParDefaut } = this.formulaire.getRawValue();

    // Même normalisation que le backend : l'email est stocké en minuscules
    this.auth.inscrire({
      nom, motDePasse, villeParDefaut,
      email: email.trim().toLowerCase()
    }).subscribe({
      next: () => {
        this.notifications.succes('Compte créé, bienvenue !');
        void this.router.navigate(['/seances']);
      },
      error: (erreur: HttpErrorResponse) => {
        this.envoiEnCours.set(false);
        this.messageErreur.set(
          erreur.status === 409
            ? 'Un compte existe déjà avec cet email.'
            : "La création du compte a échoué."
        );
      }
    });
  }
}
