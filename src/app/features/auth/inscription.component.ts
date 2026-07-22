import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Pays } from '../../core/services/pays.service';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';
import { SuggestionVille } from '../../core/models/seance.model';
import { emailValide, robustesseMotDePasse }
  from '../../shared/validators/auth.validators';
import { AuthService } from '../../core/services/auth.service';
import { VilleService } from '../../core/services/ville.service';
import { PaysService } from '../../core/services/pays.service';
import { NotificationService } from '../../core/services/notification.service';

/** Validateur de groupe : les deux mots de passe doivent correspondre. */
const motsDePasseIdentiques = (groupe: AbstractControl): ValidationErrors | null => {
  const mdp = groupe.get('motDePasse')?.value as string;
  const confirmation = groupe.get('confirmation')?.value as string;
  return mdp && confirmation && mdp !== confirmation ? { motsDePasseDifferents: true } : null;
};

@Component({
    selector: 'app-inscription',
    imports: [ReactiveFormsModule, RouterLink, InputTextModule, PasswordModule, ButtonModule, SelectModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './inscription.component.html',
    styleUrl: './inscription.component.scss'
})
export class InscriptionComponent {

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly villes = inject(VilleService);
  private readonly referentiel = inject(PaysService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Référentiel chargé une fois, partagé par tous les écrans qui le portent.
   * Copie mutable : p-select refuse un tableau `readonly`.
   */
  protected readonly pays = toSignal(
    this.referentiel.tous().pipe(map(liste => [...liste])),
    { initialValue: [] as Pays[] }
  );

  protected readonly suggestions = signal<readonly SuggestionVille[]>([]);
  protected readonly indexActif = signal(-1);
  protected readonly mdpVisible = signal(false);
  protected readonly majusculesActives = signal(false);

  protected readonly envoiEnCours = signal(false);
  protected readonly messageErreur = signal<string | null>(null);

  protected readonly formulaire = this.fb.nonNullable.group({
    nom: ['', [Validators.required]],
    pays: ['France', [Validators.required, Validators.maxLength(100)]],
    villeParDefaut: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, emailValide]],
    motDePasse: ['', [Validators.required, Validators.minLength(5)]],
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

  /**
   * Changer de pays vide la ville — même règle sur tout le site : une ville
   * appartient à son pays, et « Lille » conservé après un passage au Sénégal
   * ne désigne plus rien. Le compte serait créé sur un lieu introuvable, donc
   * sans météo, sans qu'aucun message ne le signale.
   *
   * ⚠️ Sur `onChange`, jamais sur `valueChanges` : le second se déclenche aussi
   * à l'initialisation du formulaire, sur « France ».
   */
  protected changerPays(): void {
    this.formulaire.controls.villeParDefaut.setValue('');
    this.suggestions.set([]);
    this.indexActif.set(-1);
  }

  protected rechercherVille(terme: string): void {
    this.saisieVille$.next(terme);
  }

  /** Autocomplétion : même mécanique que dans le formulaire de séance. */
  private readonly villeSaisie = toSignal(
    this.saisieVille$.pipe(
      debounceTime(250),
      /*
       * Aucune session n'existe encore : le pays vient du FORMULAIRE, pas du
       * compte. C'est pourquoi il est demandé avant la ville — l'ordre des
       * champs suit la dépendance réelle.
       *
       * ⚠️ Le pays entre dans la clé de déduplication : sans lui, retaper le
       * MÊME nom de ville après avoir corrigé le pays n'émettait aucune
       * requête, et la liste restait obstinément vide sur une ville pourtant
       * connue. Défaut constaté sur le formulaire de séance, corrigé ici aussi.
       */
      map(terme => [terme, this.formulaire.controls.pays.value] as const),
      distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
      switchMap(([terme, pays]) => this.villes.rechercher(terme, pays)),
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

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ RELAYER LE MOTIF DU SERVEUR, PAS UN MESSAGE PASSE-PARTOUT             │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Le repli était « La création du compte a échoué. » pour tout ce qui
   * n'était pas un 409 : l'utilisateur voyait un échec sans jamais savoir
   * QUOI corriger, alors que le serveur le disait précisément — « le nom ne
   * peut pas dépasser 100 caractères », « email invalide ».
   *
   * Le contrat d'erreur est normalisé par le @RestControllerAdvice côté
   * Kotlin : `{ statut, erreur, message, horodatage }`. On lit `message`.
   *
   * Le 409 garde une formulation maison : « email déjà utilisé : x@y.fr »
   * répète l'adresse que l'utilisateur vient de saisir, sans rien apprendre.
   */
  private expliquer(erreur: HttpErrorResponse): string {
    if (erreur.status === 409) {
      return 'Un compte existe déjà avec cet email.';
    }

    const detail = (erreur.error as { message?: string } | null)?.message;
    if (erreur.status === 400 && detail) {
      // Le serveur préfixe par le champ (« nom : … ») : utile en débogage,
      // bruyant à l'écran quand le libellé est déjà explicite.
      return detail.includes(' : ') ? detail.slice(detail.indexOf(' : ') + 3) : detail;
    }

    // 0 (serveur injoignable) et 5xx sont traités par l'intercepteur : ici on
    // ne peut rien dire de plus utile que « ce n'est pas de votre fait ».
    return 'La création du compte a échoué. Réessayez dans un instant.';
  }

  protected soumettre(): void {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }

    this.envoiEnCours.set(true);
    this.messageErreur.set(null);

    // On n'envoie pas le champ de confirmation au serveur
    const { nom, email, motDePasse, villeParDefaut, pays } = this.formulaire.getRawValue();

    // Même normalisation que le backend : l'email est stocké en minuscules
    this.auth.inscrire({
      nom, motDePasse, villeParDefaut, pays,
      email: email.trim().toLowerCase()
    }).subscribe({
      next: () => {
        /*
         * La notification survit à la navigation : `p-toast` est monté dans
         * AppComponent, hors du router-outlet, donc il n'est pas détruit au
         * changement d'écran. Le message s'affiche bien SUR la page de
         * connexion, là où l'utilisateur en a besoin.
         */
        this.notifications.succes('Compte créé. Connectez-vous pour commencer.');
        void this.router.navigate(['/connexion']);
      },
      error: (erreur: HttpErrorResponse) => {
        this.envoiEnCours.set(false);
        this.messageErreur.set(this.expliquer(erreur));
      }
    });
  }
}
