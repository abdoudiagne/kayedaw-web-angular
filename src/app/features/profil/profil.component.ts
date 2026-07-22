import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, switchMap, tap } from 'rxjs/operators';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LIBELLES_ROLE, Role } from '../../core/models/auth.model';
import { LANGUES, Langue, Preferences, THEMES, Theme } from '../../core/models/preferences.model';
import { Profil } from '../../core/models/profil.model';
import { libelleType, TypeSeance } from '../../core/models/seance.model';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { ProfilService } from '../../core/services/profil.service';
import { VilleService } from '../../core/services/ville.service';
import { SuggestionVille } from '../../core/models/seance.model';
import { Pays, PaysService } from '../../core/services/pays.service';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RadioButtonModule } from 'primeng/radiobutton';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DEUX FORMULAIRES INDÉPENDANTS SUR UN MÊME ÉCRAN                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le nom et le mot de passe sont deux FormGroup distincts, pas un seul.
 * Raison : ils partent vers deux endpoints différents, leurs validations n'ont
 * rien à voir, et un échec sur l'un ne doit pas invalider l'autre. Fusionner
 * les deux obligerait à démêler quel champ a échoué à chaque soumission.
 */
@Component({
    selector: 'app-profil',
    imports: [ReactiveFormsModule, DatePipe, InputTextModule, PasswordModule, ButtonModule,
      InputNumberModule, SelectModule, RadioButtonModule, SkeletonModule, TagModule,
      AutoCompleteModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './profil.component.html',
    styleUrl: './profil.component.scss'
})
export class ProfilComponent implements OnInit {

  private readonly fb = inject(FormBuilder);
  private readonly villes = inject(VilleService);
  private readonly service = inject(ProfilService);
  private readonly preferences = inject(PreferencesService);
  private readonly referentiel = inject(PaysService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  protected libelleRole(role: Role): string {
    return LIBELLES_ROLE[role];
  }

  protected readonly profil = signal<Profil | undefined>(undefined);
  protected readonly nomEnCours = signal(false);
  protected readonly mdpEnCours = signal(false);
  protected readonly erreurMdp = signal<string | null>(null);

  protected readonly formulaireNom = this.fb.nonNullable.group({
    nom: ['', [Validators.required, Validators.maxLength(100)]],
    villeParDefaut: ['', [Validators.required, Validators.maxLength(100)]],
    pays: ['France', [Validators.required, Validators.maxLength(100)]]
  });

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ La ville de référence s'autocomplète, sous le pays choisi juste avant │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * C'était une saisie libre : une faute de frappe ou une commune inconnue du
   * géocodeur passait sans broncher, et se payait plus tard — chaque séance
   * pré-remplie avec cette ville revenait sans météo, sans que rien ne relie
   * la panne au champ fautif.
   *
   * Les suggestions sont bornées par le PAYS du formulaire, d'où l'ordre à
   * l'écran : le pays commande la liste, il vient donc avant.
   */
  protected readonly suggestionsVilles = signal<SuggestionVille[]>([]);

  protected rechercherVille(terme: string): void {
    this.villes.rechercher(terme, this.formulaireNom.controls.pays.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(resultats => this.suggestionsVilles.set([...resultats]));
  }

  /**
   * ⚠️ Le contrôle porte une CHAÎNE, pas l'objet suggestion : l'API attend un
   * nom de ville. Sans ce réécrivain, `[object Object]` partait au serveur.
   */
  protected choisirVille(suggestion: SuggestionVille): void {
    this.formulaireNom.controls.villeParDefaut.setValue(suggestion.nom);
    this.formulaireNom.controls.villeParDefaut.markAsDirty();
    this.suggestionsVilles.set([]);
  }

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ Changer de pays VIDE la ville — règle unique à tout le site           │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Une ville appartient à son pays : « Lille » conservé après un passage au
   * Sénégal ne désigne plus rien, et la garder produirait une adresse de
   * référence sans lieu réel — donc des séances pré-remplies qui reviennent
   * sans météo, sans que rien ne relie la panne au champ fautif.
   *
   * ⚠️ Branché sur `onChange`, JAMAIS sur `valueChanges` : le second se
   * déclenche aussi au chargement du profil, ce qui effacerait la ville d'un
   * formulaire que personne n'a touché.
   *
   * L'impasse muette redoutée n'en est pas une : `enregistrerProfil` appelle
   * `markAllAsTouched` sur un formulaire invalide, et le message « La ville
   * est obligatoire » s'affiche sous le champ. « Annuler » rétablit d'ailleurs
   * la valeur du serveur en un clic.
   */
  protected changerPays(): void {
    this.formulaireNom.controls.villeParDefaut.setValue('');
    this.suggestionsVilles.set([]);
  }

  protected readonly formulaireMdp = this.fb.nonNullable.group({
    motDePasseActuel: ['', [Validators.required]],
    nouveauMotDePasse: ['', [Validators.required, Validators.minLength(5)]]
  });

  /** Copie mutable : p-select refuse un tableau readonly. */
  protected readonly pays = toSignal(
    this.referentiel.tous().pipe(map(liste => [...liste])),
    { initialValue: [] as Pays[] }
  );

  protected readonly themes = THEMES;
  protected readonly langues = LANGUES;
  protected readonly optionsLangue = [...LANGUES];
  protected readonly libelleType = libelleType;
  /** Retour discret de l'enregistrement automatique, à la place d'un bouton. */
  protected readonly etatEnregistrement =
    signal<'inactif' | 'encours' | 'ok' | 'erreur'>('inactif');

  /** Trois états explicites, comme dans administration.component.ts : sans eux,
      « en cours de chargement » et « échec » sont indiscernables à l'écran. */
  protected readonly etatPreferences = signal<'chargement' | 'pret' | 'erreur'>('chargement');

  /**
   * Le tableau des types est construit à la RÉPONSE du serveur, pas en dur :
   * c'est lui qui décide de la liste et de son ordre, y compris pour un type
   * ajouté côté serveur avant de l'être ici.
   */
  protected readonly formulairePreferences = this.fb.nonNullable.group({
    theme: this.fb.nonNullable.control<Theme>('SYSTEME'),
    langue: this.fb.nonNullable.control<Langue>('FR'),
    seances: this.fb.array<FormGroup<{
      type: FormControl<TypeSeance>;
      distanceKm: FormControl<number>;
      dureeMinutes: FormControl<number>;
    }>>([])
  });

  ngOnInit(): void {
    this.chargerPreferences();

    this.service.profil().subscribe({
      next: (p) => {
        this.profil.set(p);
        this.formulaireNom.patchValue({
          nom: p.nom, villeParDefaut: p.villeParDefaut, pays: p.pays
        });
        this.formulaireNom.markAsPristine();
      },
      error: () => this.notifications.erreur('Profil indisponible.')
    });
  }

  /**
   * Rétablit les valeurs du SERVEUR, et non un formulaire vide : on annule ses
   * modifications, on n'efface pas son identité. `profil()` porte la dernière
   * réponse connue, celle-là même qui a rempli le formulaire à l'ouverture.
   *
   * `markAsPristine` referme la boucle : le bouton « Annuler » disparaît et
   * « Enregistrer » se désactive, puisqu'il n'y a plus rien à enregistrer.
   */
  protected annulerProfil(): void {
    const courant = this.profil();
    if (!courant) {
      return;
    }
    this.formulaireNom.patchValue({
      nom: courant.nom,
      villeParDefaut: courant.villeParDefaut,
      pays: courant.pays
    });
    this.suggestionsVilles.set([]);
    this.formulaireNom.markAsPristine();
    this.formulaireNom.markAsUntouched();
  }

  protected enregistrerProfil(): void {
    if (this.formulaireNom.invalid) {
      this.formulaireNom.markAllAsTouched();
      return;
    }

    this.nomEnCours.set(true);
    const { nom, villeParDefaut, pays } = this.formulaireNom.getRawValue();
    this.service.modifierProfil(nom, villeParDefaut, pays).subscribe({
      next: (p) => {
        this.profil.set(p);
        this.formulaireNom.markAsPristine();
        this.nomEnCours.set(false);
        this.notifications.succes('Profil mis à jour.');
        // L'en-tête affiche les initiales et le formulaire de séance
        // pré-remplit la ville : on rafraîchit la session locale.
        this.auth.rafraichirProfil(p.nom, p.villeParDefaut);
      },
      error: (erreur: HttpErrorResponse) => {
        this.nomEnCours.set(false);
        // Même principe qu'à l'inscription : le serveur nomme le champ fautif,
        // le taire obligerait l'utilisateur à deviner.
        const detail = (erreur.error as { message?: string } | null)?.message;
        this.notifications.erreur(detail ?? 'Enregistrement impossible.');
      }
    });
  }

  protected chargerPreferences(): void {
    this.etatPreferences.set('chargement');
    this.preferences.charger().subscribe(preferences => {
      if (preferences) {
        this.remplirPreferences(preferences);
      } else {
        // `charger()` absorbe ses erreurs — c'est voulu ailleurs dans
        // l'application — mais ICI l'utilisateur est venu pour ces réglages :
        // un squelette éternel serait pire qu'un message.
        this.etatPreferences.set('erreur');
      }
    });
  }

  private remplirPreferences(preferences: Preferences): void {
    const lignes = this.formulairePreferences.controls.seances;
    lignes.clear();
    for (const defaut of preferences.seances) {
      lignes.push(this.fb.nonNullable.group({
        type: this.fb.nonNullable.control(defaut.type),
        distanceKm: this.fb.nonNullable.control(defaut.distanceKm,
          [Validators.required, Validators.min(0.1), Validators.max(200)]),
        dureeMinutes: this.fb.nonNullable.control(defaut.dureeMinutes,
          [Validators.required, Validators.min(1)])
      }));
    }
    this.formulairePreferences.patchValue({
      theme: preferences.theme, langue: preferences.langue
    });
    // Le bouton reste inactif tant que rien n'a bougé : le remplissage initial
    // ne doit pas compter comme une modification de l'utilisateur.
    this.formulairePreferences.markAsPristine();
    // Branché APRÈS le remplissage, et UNE SEULE FOIS : câblé avant, le
    // remplissage initial déclencherait lui-même un enregistrement ; câblé à
    // chaque « Réessayer », chaque modification partirait en double.
    if (!this.automatiqueBranche) {
      this.automatiqueBranche = true;
      this.brancherEnregistrementAutomatique();
    }
    // Écrit APRÈS le remplissage : ce signal est le seul déclencheur de rendu
    // de la section, un FormArray muté n'en produisant aucun sous OnPush.
    this.etatPreferences.set('pret');
  }

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ ENREGISTREMENT AUTOMATIQUE                                            │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Pas de bouton : un réglage d'affichage qu'il faut penser à valider est un
   * réglage qu'on croit avoir posé. Trois précautions rendent la chose sûre :
   *
   *  - `debounceTime` : on attend la fin de la frappe, sinon chaque chiffre
   *    tapé dans « distance » déclencherait sa propre requête ;
   *  - `filter(valide)` : une saisie momentanément invalide (champ vidé pour
   *    être réécrit) ne part pas au serveur et n'écrase rien ;
   *  - `switchMap` : une modification plus récente ANNULE la précédente, sans
   *    quoi deux réponses pourraient revenir dans le désordre et la dernière
   *    écrite ne serait pas la dernière voulue.
   *
   * Le THÈME, lui, est appliqué immédiatement et hors du debounce : l'aperçu
   * doit suivre le clic, pas la latence réseau.
   */
  private automatiqueBranche = false;

  private brancherEnregistrementAutomatique(): void {
    this.formulairePreferences.controls.theme.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(theme => this.preferences.previsualiserTheme(theme));

    this.formulairePreferences.valueChanges.pipe(
      debounceTime(600),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      filter(() => this.formulairePreferences.valid),
      tap(() => this.etatEnregistrement.set('encours')),
      switchMap(() => this.preferences.enregistrer(this.formulairePreferences.getRawValue())
        .pipe(catchError(() => of(null)))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(resultat => {
      this.etatEnregistrement.set(resultat ? 'ok' : 'erreur');
      if (resultat) {
        this.formulairePreferences.markAsPristine();
      }
    });
  }

  protected changerMotDePasse(): void {
    if (this.formulaireMdp.invalid) {
      this.formulaireMdp.markAllAsTouched();
      return;
    }

    this.mdpEnCours.set(true);
    this.erreurMdp.set(null);

    this.service.changerMotDePasse(this.formulaireMdp.getRawValue()).subscribe({
      next: () => {
        this.mdpEnCours.set(false);
        this.formulaireMdp.reset();
        this.notifications.succes('Mot de passe changé.');
      },
      error: (erreur: HttpErrorResponse) => {
        this.mdpEnCours.set(false);
        // 422 = mot de passe actuel faux ; le reste est technique
        this.erreurMdp.set(erreur.status === 422
          ? 'Le mot de passe actuel est incorrect.'
          : 'Changement impossible pour le moment.');
      }
    });
  }
}
