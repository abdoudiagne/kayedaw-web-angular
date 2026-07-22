import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, combineLatest, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap }
  from 'rxjs/operators';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { Metriques, RapportSuppression, UtilisateurResume } from '../../core/models/admin.model';
import { LIBELLES_ROLE, Role } from '../../core/models/auth.model';
import { libelleType, Page, Seance } from '../../core/models/seance.model';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { Pays, PaysService } from '../../core/services/pays.service';
import { nomDuJour, telecharger } from '../../core/services/telechargement';

interface TableauDeBord {
  readonly utilisateurs: Page<UtilisateurResume>;
  readonly metriques: Metriques;
}

/** Union discriminée : les trois états de l'écran, jamais deux à la fois. */
type Etat =
  | { readonly statut: 'chargement' }
  | { readonly statut: 'ok'; readonly tableau: TableauDeBord }
  | { readonly statut: 'erreur' };

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ QUESTION — forkJoin vs combineLatest                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Deux appels INDÉPENDANTS partent en parallèle et l'écran n'a de sens que
 * lorsque les deux sont revenus : c'est exactement forkJoin. Il n'émet qu'une
 * fois, à la COMPLÉTION de toutes les sources — parfait pour des requêtes HTTP.
 *
 * combineLatest, lui, réémet à CHAQUE émission de n'importe quelle source :
 * c'est le bon choix pour des flux durables — ici la recherche et la page,
 * qui pilotent le rechargement.
 *
 * ⚠️ Rappel de sécurité : adminGuard n'empêche que l'affichage. La vraie
 * protection est le hasRole("ADMIN") de SecurityConfig + le @PreAuthorize du
 * AdminController. Les garde-fous métier (dernier admin, auto-suppression)
 * sont eux aussi côté serveur — le front ne fait que relayer leurs messages.
 */
@Component({
    selector: 'app-administration',
    imports: [ReactiveFormsModule, DatePipe, TableModule, ButtonModule, InputTextModule, TagModule,
      DialogModule, PasswordModule, TooltipModule, SelectModule,
      IconFieldModule, InputIconModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './administration.component.html',
    styleUrl: './administration.component.scss'
})
export class AdministrationComponent {

  private readonly service = inject(AdminService);
  private readonly notifications = inject(NotificationService);
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly confirmation = inject(ConfirmationService);
  private readonly referentiel = inject(PaysService);
  protected readonly auth = inject(AuthService);

  protected readonly recherche = new FormControl('', { nonNullable: true });
  private readonly page$ = new BehaviorSubject<number>(0);

  /**
   * Nombre de lignes par page, ajustable par l'administrateur.
   *
   * ⚠️ Déclaré AVANT le flux qui le lit : les champs s'initialisent dans
   * l'ordre où ils sont écrits, et le placer plus bas donnait « Property
   * 'taille$' is used before its initialization ».
   *
   * Dix par défaut : au-delà, le tableau dépasse la hauteur d'un écran et l'on
   * perd les en-têtes de colonnes en défilant.
   */
  private readonly taille$ = new BehaviorSubject<number>(10);

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ TRI SERVEUR, et non tri de la page affichée                           │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * La table est en mode `lazy` : elle n'a qu'UNE page en mémoire. Trier
   * localement classerait dix lignes sur quarante et donnerait un ordre faux
   * dès la seconde page. Le critère part donc au serveur, au format Spring
   * Data `propriété,sens` — le même que celui du tri des séances.
   */
  private readonly tri$ = new BehaviorSubject<string>('nom,asc');

  /** Reflète l'état des icônes de tri dans les en-têtes. */
  protected readonly champTri = signal<string>('nom');
  protected readonly sensTri = signal<number>(1);
  private readonly declencheur$ = new BehaviorSubject<void>(undefined);

  protected readonly seancesConsultees =
    signal<{ nom: string; page: Page<Seance> } | undefined>(undefined);

  /**
   * ÉTAT EXPLICITE plutôt qu'un `undefined` ambigu : sans lui, « en cours de
   * chargement » et « échec » seraient indiscernables, et un rafraîchissement
   * raté afficherait un écran figé sur les anciennes données.
   */
  private readonly etat = toSignal(
    combineLatest([
      this.recherche.valueChanges.pipe(
        startWith(this.recherche.value),
        debounceTime(300),          // on attend la fin de la frappe
        distinctUntilChanged()
      ),
      this.page$,
      this.tri$,
      this.taille$,
      this.declencheur$
    ]).pipe(
      switchMap(([recherche, page, tri, taille]) =>
        forkJoin({
          utilisateurs: this.service.utilisateurs({
            page, taille, tri, recherche
          }),
          metriques: this.service.metriques()
        }).pipe(
          map((tableau): Etat => ({ statut: 'ok', tableau })),
          // catchError À L'INTÉRIEUR du switchMap : placé à l'extérieur, une
          // seule erreur terminerait le flux et la recherche n'aurait plus
          // jamais d'effet. L'intercepteur a déjà notifié l'utilisateur.
          catchError(() => of<Etat>({ statut: 'erreur' })),
          startWith<Etat>({ statut: 'chargement' })
        )
      )
    ),
    { initialValue: { statut: 'chargement' } as Etat }
  );

  protected readonly donnees = computed(() => {
    const etat = this.etat();
    return etat.statut === 'ok' ? etat.tableau : undefined;
  });

  protected readonly enErreur = computed(() => this.etat().statut === 'erreur');

  /** p-table attend un tableau mutable ; la page Spring Data est readonly. */
  /**
   * Sélection courante. Signal côté composant, mais p-table travaille avec une
   * propriété ordinaire : `selectionTable` fait le pont dans les deux sens.
   */
  protected readonly selection = signal<readonly UtilisateurResume[]>([]);
  protected readonly suppressionEnMasse = signal(false);

  protected get selectionTable(): UtilisateurResume[] {
    return [...this.selection()];
  }

  protected set selectionTable(valeur: UtilisateurResume[]) {
    this.selection.set(valeur);
  }

  /**
   * ⚠️ Son PROPRE compte n'est jamais sélectionnable.
   *
   * Le serveur le refuserait de toute façon (motif AUTO_SUPPRESSION), mais
   * offrir la case reviendrait à proposer une action vouée à l'échec — et à
   * faire compter dans « 3 comptes sélectionnés » un compte qui ne partira pas.
   * La méthode est passée à `rowSelectable`, ce qui exclut aussi la ligne de la
   * case « tout sélectionner ».
   */
  protected readonly ligneSelectionnable = (evenement: { data: UtilisateurResume }) =>
    !this.estSoiMeme(evenement.data);

  protected readonly lignesUtilisateurs = computed(
    () => [...(this.donnees()?.utilisateurs.content ?? [])]
  );

  protected readonly nombreAdmins = computed(
    () => this.donnees()?.utilisateurs.content.filter(u => u.role === 'ADMIN').length ?? 0
  );

  /** Signal dérivé : la Map du backend devient des lignes triées et graduées. */
  protected readonly routes = computed(() => {
    const metriques = this.donnees()?.metriques;
    if (!metriques) {
      return [];
    }

    // Object.entries perd le type sur un index signature readonly : on le
    // restaure explicitement plutôt que de laisser filer des `unknown`.
    const entrees = Object.entries(metriques.parRoute) as Array<[string, number]>;
    const maximum = entrees.reduce((haut, [, appels]) => Math.max(haut, appels), 0);

    return entrees
      .map(([route, appels]) => ({
        route,
        appels,
        pourcentage: maximum > 0 ? Math.round((appels / maximum) * 100) : 0
      }))
      .sort((a, b) => b.appels - a.appels);
  });

  protected readonly libelleType = libelleType;

  protected libelleRole(role: Role): string {
    return LIBELLES_ROLE[role];
  }

  protected estSoiMeme(utilisateur: UtilisateurResume): boolean {
    return utilisateur.email === this.auth.utilisateur()?.email;
  }

  protected basculerRole(utilisateur: UtilisateurResume): void {
    const cible: Role = utilisateur.role === 'ADMIN' ? 'USER' : 'ADMIN';

    this.service.changerRole(utilisateur.id, cible).subscribe({
      next: () => {
        this.notifications.succes(`${utilisateur.nom} est désormais ${LIBELLES_ROLE[cible]}.`);
        this.rafraichir();
      },
      error: (erreur: HttpErrorResponse) => this.signalerRefus(erreur)
    });
  }

  protected supprimer(utilisateur: UtilisateurResume): void {
    // Action irréversible qui emporte aussi les séances : on confirme, et le
    // message NOMME le compte visé — une boîte générique ne protège de rien
    // quand la ligne cliquée n'est plus visible derrière le dialogue.
    this.confirmation.confirm({
      header: 'Supprimer ce compte ?',
      message: `${utilisateur.nom} (${utilisateur.email}) et toutes ses séances `
        + `seront effacés définitivement.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer le compte',
      rejectLabel: 'Annuler',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        this.service.supprimer(utilisateur.id).subscribe({
          next: () => {
            this.notifications.succes(`${utilisateur.nom} a été supprimé.`);
            this.rafraichir();
          },
          error: (erreur: HttpErrorResponse) => this.signalerRefus(erreur)
        });
      }
    });
  }

  protected voirSeances(utilisateur: UtilisateurResume): void {
    this.service.seancesDe(utilisateur.id).subscribe({
      next: (page) => {
        this.seancesConsultees.set({ nom: utilisateur.nom, page });
        this.revelerConsultation();
      },
      error: () => this.notifications.erreur('Séances indisponibles.')
    });
  }

  /**
   * Le panneau s'ouvrait SOUS la ligne de flottaison, sans rien déplacer :
   * sur mobile, cliquer « Séances » ne produisait visiblement aucun effet.
   * On l'amène à l'écran et on y pose le focus.
   *
   * Le `setTimeout` attend le rendu : le panneau est derrière un `@if`, il
   * n'existe pas encore dans le DOM à l'instant où le signal est écrit.
   * Le défilement doux est conditionné à la préférence système — une
   * animation de défilement non désirée peut provoquer un malaise.
   */
  private revelerConsultation(): void {
    setTimeout(() => {
      const titre = this.hote.nativeElement.querySelector<HTMLElement>('#titre-consultation');
      const doux = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      titre?.scrollIntoView({ behavior: doux ? 'smooth' : 'auto', block: 'center' });
      titre?.focus();
    });
  }

  protected fermerSeances(): void {
    this.seancesConsultees.set(undefined);
  }

  /**
   * Suppression groupée. Le compte rendu du serveur est PARTIEL par nature :
   * on l'affiche tel quel plutôt que d'annoncer un succès global qui serait
   * faux dès qu'un compte est refusé.
   */
  // ─────────────────── Édition d'un compte ───────────────────

  /** Copie mutable : p-select refuse un tableau readonly. */
  protected readonly pays = toSignal(
    this.referentiel.tous().pipe(map(liste => [...liste])),
    { initialValue: [] as Pays[] }
  );

  protected readonly enEdition = signal<UtilisateurResume | undefined>(undefined);
  protected readonly editionEnCours = signal(false);
  protected readonly mdpAdminEnCours = signal(false);

  private readonly fb = inject(FormBuilder);

  protected readonly formulaireEdition = this.fb.nonNullable.group({
    nom: ['', [Validators.required, Validators.maxLength(100)]],
    villeParDefaut: ['', [Validators.required, Validators.maxLength(100)]],
    pays: ['France', [Validators.required, Validators.maxLength(100)]]
  });

  protected readonly formulaireMdpAdmin = this.fb.nonNullable.group({
    nouveau: ['', [Validators.required, Validators.minLength(5)]]
  });

  /**
   * Changer de pays vide la ville — la même règle que sur les autres écrans :
   * une ville appartient à son pays, et la conserver après un changement
   * produirait une adresse de référence sans lieu réel.
   *
   * ⚠️ Sur `onChange`, jamais sur `valueChanges` : le second se déclencherait
   * à l'ouverture de la boîte, quand on remplit le formulaire avec les valeurs
   * du compte — et effacerait la ville qu'on vient d'y mettre.
   *
   * Le formulaire devient invalide, ce que le message « Le nom et la ville
   * sont obligatoires » signale déjà sous les champs.
   */
  protected changerPays(): void {
    this.formulaireEdition.controls.villeParDefaut.setValue('');
  }

  protected ouvrirEdition(utilisateur: UtilisateurResume): void {
    // Le formulaire s'ouvre sur les valeurs RÉELLES du compte : une ville vide
    // obligeait à la ressaisir de mémoire, ou l'écrasait sans le vouloir.
    this.formulaireEdition.reset({
      nom: utilisateur.nom,
      villeParDefaut: utilisateur.villeParDefaut,
      pays: utilisateur.pays
    });
    this.formulaireMdpAdmin.reset({ nouveau: '' });
    this.enEdition.set(utilisateur);
  }

  protected fermerEdition(): void {
    this.enEdition.set(undefined);
  }

  protected enregistrerEdition(): void {
    const cible = this.enEdition();
    if (!cible || this.formulaireEdition.invalid) {
      this.formulaireEdition.markAllAsTouched();
      return;
    }

    const { nom, villeParDefaut, pays } = this.formulaireEdition.getRawValue();
    this.editionEnCours.set(true);
    this.service.modifierUtilisateur(cible.id, nom, villeParDefaut, pays).subscribe({
      next: () => {
        this.editionEnCours.set(false);
        this.notifications.succes('Compte modifié.');
        this.fermerEdition();
        this.rafraichir();
      },
      error: (erreur: HttpErrorResponse) => {
        this.editionEnCours.set(false);
        this.signalerRefus(erreur);
      }
    });
  }

  protected reinitialiserMotDePasse(): void {
    const cible = this.enEdition();
    if (!cible || this.formulaireMdpAdmin.invalid) {
      this.formulaireMdpAdmin.markAllAsTouched();
      return;
    }

    this.mdpAdminEnCours.set(true);
    this.service.reinitialiserMotDePasse(cible.id, this.formulaireMdpAdmin.getRawValue().nouveau)
      .subscribe({
        next: () => {
          this.mdpAdminEnCours.set(false);
          this.formulaireMdpAdmin.reset({ nouveau: '' });
          this.notifications.succes('Mot de passe réinitialisé.');
        },
        error: (erreur: HttpErrorResponse) => {
          this.mdpAdminEnCours.set(false);
          this.signalerRefus(erreur);
        }
      });
  }

  /**
   * Le BLOCAGE est confirmé, le déblocage non : suspendre l'accès de quelqu'un
   * mérite un temps d'arrêt, le lui rendre ne casse rien.
   */
  protected basculerBlocage(utilisateur: UtilisateurResume): void {
    const appliquer = () => this.service.bloquer(utilisateur.id, !utilisateur.actif).subscribe({
      next: () => {
        this.notifications.succes(
          utilisateur.actif ? `${utilisateur.nom} est bloqué.` : `${utilisateur.nom} est débloqué.`);
        this.rafraichir();
      },
      error: (erreur: HttpErrorResponse) => this.signalerRefus(erreur)
    });

    if (!utilisateur.actif) {
      appliquer();
      return;
    }

    this.confirmation.confirm({
      header: 'Bloquer ce compte ?',
      message: `${utilisateur.nom} (${utilisateur.email}) ne pourra plus se connecter. `
        + `Ses séances sont conservées et le blocage est réversible.`,
      icon: 'pi pi-ban',
      acceptLabel: 'Bloquer',
      rejectLabel: 'Annuler',
      acceptButtonStyleClass: 'p-button-warn',
      rejectButtonStyleClass: 'p-button-text',
      accept: appliquer
    });
  }

  protected supprimerSelection(): void {
    const cibles = this.selection();
    if (cibles.length === 0) {
      return;
    }

    this.confirmation.confirm({
      header: `Supprimer ${cibles.length} compte(s) ?`,
      // Les emails sont ÉNUMÉRÉS jusqu'à cinq : « 3 comptes » ne permet pas de
      // vérifier qu'on a coché ce que l'on croit. Au-delà, la liste devient
      // illisible et le compte suffit.
      message: cibles.length <= 5
        ? `${cibles.map(c => c.email).join(', ')} et toutes leurs séances seront `
          + `effacés définitivement.`
        : `${cibles.length} comptes et toutes leurs séances seront effacés `
          + `définitivement.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer la sélection',
      rejectLabel: 'Annuler',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        this.suppressionEnMasse.set(true);
        this.service.supprimerPlusieurs(cibles.map(c => c.id)).subscribe({
          next: (rapport) => {
            this.suppressionEnMasse.set(false);
            this.selection.set([]);
            this.rendreCompte(rapport);
            this.rafraichir();
          },
          error: (erreur: HttpErrorResponse) => {
            this.suppressionEnMasse.set(false);
            this.signalerRefus(erreur);
          }
        });
      }
    });
  }

  /** Un succès et un refus dans le même lot : deux messages, pas un compromis. */
  private rendreCompte(rapport: RapportSuppression): void {
    if (rapport.supprimes.length > 0) {
      this.notifications.succes(`${rapport.supprimes.length} compte(s) supprimé(s).`);
    }
    for (const refus of rapport.refuses) {
      this.notifications.erreur(refus.detail);
    }
  }

  /**
   * p-table émet `field` et `order` (1 croissant, -1 décroissant).
   *
   * ⚠️ Le tri REMET À LA PREMIÈRE PAGE. Sans cela, trier depuis la page 3
   * affiche la page 3 du nouvel ordre : l'utilisateur a demandé « les noms de
   * A à Z » et reçoit une tranche arbitraire du milieu. Le test de garde vaut
   * pour la recherche exactement de la même façon.
   */
  protected trier(evenement: { field?: string; order?: number }): void {
    const champ = evenement.field ?? 'nom';
    const ordre = evenement.order ?? 1;
    const critere = `${champ},${ordre === -1 ? 'desc' : 'asc'}`;
    if (critere === this.tri$.value) {
      return;                       // p-table réémet à chaque rendu
    }
    this.champTri.set(champ);
    this.sensTri.set(ordre);
    this.tri$.next(critere);
    this.revenirPremierePage();
  }

  /** Idempotent : republier 0 alors qu'on y est relancerait une requête. */
  private revenirPremierePage(): void {
    if (this.page$.value !== 0) {
      this.page$.next(0);
    }
  }

  /**
   * Le paginateur émet un PREMIER ÉLÉMENT et un nombre de lignes ; Spring Data
   * raisonne en numéro de page. La conversion se fait ici, une fois.
   *
   * ⚠️ Changer le nombre de lignes REMET à la première page. Passer de 10 à 50
   * en étant sur la page 3 demanderait les lignes 100 à 150 d'un jeu qui n'en
   * compte plus que deux pages : l'écran reviendrait vide.
   */
  protected allerPage(premier: number, lignes: number): void {
    if (lignes !== this.taille$.value) {
      this.taille$.next(lignes);
      this.page$.next(0);
      return;
    }
    this.page$.next(Math.max(0, Math.floor(premier / lignes)));
  }

  protected rafraichir(): void {
    this.declencheur$.next();
  }

  /**
   * Le backend refuse certaines opérations pour des raisons MÉTIER (422) et
   * fournit le détail : on le relaie tel quel plutôt que d'inventer un message
   * générique, qui masquerait la vraie raison du refus.
   */
  private signalerRefus(erreur: HttpErrorResponse): void {
    const detail = erreur.status === 422 ? erreur.error?.detail : null;
    this.notifications.erreur(detail ?? 'Opération impossible.');
  }

  protected readonly exportEnCours = signal(false);

  /**
   * Le refus d'un export ne doit pas passer inaperçu.
   *
   * ⚠️ `erreur.interceptor` laisse remonter les statuts métier, mais un échec
   * de téléchargement n'affiche RIEN par lui-même : sans ce `error`,
   * l'utilisateur verrait le bouton tourner puis s'arrêter, sans fichier et
   * sans explication.
   */
  protected exporter(): void {
    this.exportEnCours.set(true);
    this.service.exporterPdf().subscribe({
      next: (fichier) => {
        telecharger(fichier, nomDuJour('utilisateurs'));
        this.exportEnCours.set(false);
      },
      error: () => {
        this.exportEnCours.set(false);
        this.notifications.erreur("L'export n'a pas pu être généré.");
      }
    });
  }
}
