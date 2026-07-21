import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, combineLatest, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';
import { Metriques, UtilisateurResume } from '../../core/models/admin.model';
import { Role } from '../../core/models/auth.model';
import { Page, Seance } from '../../core/models/seance.model';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

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
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="titre">
      <div>
        <h1>Administration</h1>
        <p class="sous-titre">Connecté en tant que {{ auth.utilisateur()?.email }}</p>
      </div>
      <button type="button" class="bouton fantome" (click)="rafraichir()">Rafraîchir</button>
    </header>

    @if (donnees(); as tableau) {
      <dl class="indicateurs">
        <div><dt>Utilisateurs</dt><dd>{{ tableau.utilisateurs.totalElements }}</dd></div>
        <div><dt>Administrateurs</dt><dd>{{ nombreAdmins() }}</dd></div>
        <div><dt>Requêtes servies</dt><dd>{{ tableau.metriques.totalRequetes }}</dd></div>
        <div><dt>Routes appelées</dt><dd>{{ routes().length }}</dd></div>
      </dl>

      <section>
        <h2>Utilisateurs</h2>

        <div class="filtres">
          <label class="etiquette" for="recherche">Rechercher</label>
          <input id="recherche" class="champ" type="search" [formControl]="recherche"
                 placeholder="nom ou email" />
        </div>

        <table>
          <caption class="sr-only">Liste des comptes enregistrés</caption>
          <thead>
            <tr>
              <th scope="col">Nom</th>
              <th scope="col">Email</th>
              <th scope="col">Rôle</th>
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <!--
              track sur l'identifiant technique : Angular réutilise les lignes
              existantes au lieu de recréer le DOM à chaque rafraîchissement.
            -->
            @for (utilisateur of tableau.utilisateurs.content; track utilisateur.id) {
              <tr [class.soi-meme]="estSoiMeme(utilisateur)">
                <td data-intitule="Nom">{{ utilisateur.nom }}</td>
                <td data-intitule="Email" class="email">{{ utilisateur.email }}</td>
                <td data-intitule="Rôle">
                  <span class="role" [attr.data-role]="utilisateur.role">{{ utilisateur.role }}</span>
                </td>
                <td class="actions">
                  <!-- Sur soi-même, le serveur refuse : on n'affiche pas de piège -->
                  @if (!estSoiMeme(utilisateur)) {
                    <button type="button" class="lien"
                            (click)="basculerRole(utilisateur)">
                      {{ utilisateur.role === 'ADMIN' ? 'Rétrograder' : 'Promouvoir' }}
                    </button>
                    <button type="button" class="lien" (click)="voirSeances(utilisateur)">Séances</button>
                    <button type="button" class="lien danger" (click)="supprimer(utilisateur)">Supprimer</button>
                  } @else {
                    <span class="silence">vous</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="vide">Aucun utilisateur ne correspond.</td></tr>
            }
          </tbody>
        </table>

        @if (tableau.utilisateurs.totalPages > 1) {
          <nav class="pagination" aria-label="Pagination">
            <button type="button" class="bouton fantome" [disabled]="tableau.utilisateurs.first"
                    (click)="allerPage(tableau.utilisateurs.number - 1)">Précédent</button>
            <span class="silence">
              Page {{ tableau.utilisateurs.number + 1 }} sur {{ tableau.utilisateurs.totalPages }}
            </span>
            <button type="button" class="bouton fantome" [disabled]="tableau.utilisateurs.last"
                    (click)="allerPage(tableau.utilisateurs.number + 1)">Suivant</button>
          </nav>
        }
      </section>

      @if (seancesConsultees(); as consultation) {
        <section class="consultation carte">
          <header class="entete-consultation">
            <h2>Séances de {{ consultation.nom }}</h2>
            <button type="button" class="lien" (click)="fermerSeances()">Fermer</button>
          </header>

          @if (consultation.page.content.length === 0) {
            <p class="vide">Cet utilisateur n'a aucune séance.</p>
          } @else {
            <ul class="seances">
              @for (seance of consultation.page.content; track seance.id) {
                <li>
                  <span class="type" [attr.data-type]="seance.type">{{ seance.type }}</span>
                  <span>{{ seance.dateHeure | date:'dd/MM/yy HH:mm' }}</span>
                  <span>{{ seance.distanceKm }} km</span>
                  @if (seance.estPlanifiee) { <span class="planifiee">planifiée</span> }
                </li>
              }
            </ul>
            <p class="silence">{{ consultation.page.totalElements }} séance(s) au total.</p>
          }
        </section>
      }

      <section>
        <h2>Trafic par route</h2>
        @if (routes().length > 0) {
          <ul class="routes">
            @for (ligne of routes(); track ligne.route) {
              <li>
                <span class="chemin">{{ ligne.route }}</span>
                <span class="barre"><span [style.width.%]="ligne.pourcentage"></span></span>
                <span class="valeur">{{ ligne.appels }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="vide">Aucune requête comptabilisée depuis le démarrage.</p>
        }
      </section>
    } @else if (enErreur()) {
      <p class="vide" role="alert">Données d'administration indisponibles.</p>
    } @else {
      <p class="vide" aria-busy="true">Chargement…</p>
    }
  `,
  styles: [`
    .titre { display: flex; align-items: flex-end; justify-content: space-between;
             gap: 1rem; flex-wrap: wrap; }
    .sous-titre { margin: .25rem 0 0; font-size: .88rem; color: var(--texte-doux); }

    .indicateurs { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
                   gap: 1rem; margin: 1.75rem 0; }
    .indicateurs > div {
      position: relative; overflow: hidden;
      padding: 1.15rem 1.25rem; border-radius: var(--rayon);
      background: var(--surface); border: 1px solid var(--bordure); box-shadow: var(--ombre-1);
      transition: transform var(--transition), box-shadow var(--transition);
    }
    .indicateurs > div:hover { transform: translateY(-3px); box-shadow: var(--ombre-2); }
    .indicateurs > div::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px;
                                 background: var(--degrade-marque); }
    dt { font-size: .8rem; color: var(--texte-doux); }
    dd { margin: .3rem 0 0; font-size: 1.7rem; font-weight: 700; letter-spacing: -.02em;
         font-variant-numeric: tabular-nums; }

    .filtres { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; }
    .filtres .etiquette { margin: 0; white-space: nowrap; }
    .filtres .champ { max-width: 22rem; }

    table { width: 100%; border-collapse: collapse; background: var(--surface);
            border: 1px solid var(--bordure); border-radius: var(--rayon);
            overflow: hidden; box-shadow: var(--ombre-1); }
    th, td { text-align: left; padding: .75rem 1rem; border-bottom: 1px solid var(--bordure); }
    tbody tr:last-child td { border-bottom: 0; }
    tbody tr { transition: background var(--transition); }
    tbody tr:hover { background: var(--surface-douce); }
    tbody tr.soi-meme { background: color-mix(in srgb, var(--azur) 5%, transparent); }
    th { font-size: .78rem; color: var(--texte-doux); text-transform: uppercase;
         letter-spacing: .04em; background: var(--surface-douce); }
    .email { color: var(--texte-doux); font-size: .9rem; }
    .actions { text-align: right; white-space: nowrap; }
    .lien { background: none; border: 0; padding: .2rem .45rem; margin-left: .2rem;
            color: var(--azur); font: inherit; font-size: .85rem; cursor: pointer;
            border-radius: .35rem; transition: background var(--transition); }
    .lien:hover { background: var(--surface-douce); text-decoration: underline; }
    .lien.danger { color: var(--danger); }

    .role { display: inline-block; padding: .22rem .6rem; border-radius: 999px;
            font-size: .72rem; font-weight: 700; letter-spacing: .02em;
            background: var(--surface-douce); color: var(--texte-doux); }
    .role[data-role="ADMIN"] { background: rgba(240, 126, 43, .14); color: #c05f16; }

    .consultation { margin: 1.5rem 0; padding: 1.25rem; }
    .entete-consultation { display: flex; align-items: center; justify-content: space-between; }
    .entete-consultation h2 { margin: 0; }
    .seances { list-style: none; padding: 0; margin: 1rem 0; display: grid; gap: .4rem; }
    .seances li { display: flex; align-items: center; gap: 1rem; font-size: .9rem;
                  padding: .5rem 0; border-bottom: 1px solid var(--bordure); }
    .type { padding: .2rem .5rem; border-radius: 999px; font-size: .68rem; font-weight: 700;
            background: var(--surface-douce); color: var(--texte-doux); }
    .planifiee { font-size: .68rem; font-weight: 700; text-transform: uppercase;
                 color: var(--azur); }

    .routes { list-style: none; padding: 0; display: grid; gap: .65rem; }
    .routes li { display: grid; grid-template-columns: minmax(9rem, 20rem) 1fr 4rem;
                 align-items: center; gap: 1rem; }
    .chemin { font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .barre { height: .9rem; background: var(--surface-douce); border: 1px solid var(--bordure);
             border-radius: 999px; overflow: hidden; }
    .barre > span { display: block; height: 100%; border-radius: 999px;
                    background: var(--degrade-marque);
                    animation: deploiement 620ms cubic-bezier(.2, .8, .3, 1); }
    @keyframes deploiement { from { width: 0 !important; } }
    .valeur { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .vide { color: var(--texte-doux); padding: 1.5rem 0; }
    .pagination { display: flex; align-items: center; gap: 1rem; justify-content: center;
                  margin-top: 1.25rem; }

    @media (max-width: 46rem) {
      /*
         Un tableau à quatre colonnes ne rentre pas sur un téléphone : il
         débordait de 136 px, mesuré par le test Playwright. Plutôt que de
         réduire la police jusqu'à l'illisible ou d'imposer un défilement
         horizontal, chaque ligne devient une CARTE.

         L'en-tête disparaît, donc chaque cellule doit porter son intitulé —
         d'où l'attribut data-intitule repris ici en ::before.
      */
      table, thead, tbody, tr, td { display: block; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      table { border: 0; box-shadow: none; background: none; }
      tbody tr { margin-bottom: .75rem; padding: .35rem .25rem; border-radius: var(--rayon);
                 background: var(--surface); border: 1px solid var(--bordure);
                 box-shadow: var(--ombre-1); }
      td { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
           padding: .5rem .85rem; border-bottom: 0; }
      td[data-intitule]::before {
        content: attr(data-intitule);
        font-size: .68rem; font-weight: 700; letter-spacing: .04em;
        text-transform: uppercase; color: var(--texte-doux);
      }
      .email { word-break: break-all; text-align: right; }
      .actions { justify-content: flex-start; flex-wrap: wrap; gap: .25rem;
                 border-top: 1px solid var(--bordure); margin-top: .25rem; }
      .lien { margin-left: 0; }

      .routes li { grid-template-columns: 1fr 3.5rem; }
      .barre { grid-column: 1 / -1; }
      .chemin { word-break: break-all; white-space: normal; }
      .filtres { flex-wrap: wrap; }
      .filtres .champ { max-width: 100%; }
    }
  `]
})
export class AdministrationComponent {

  private readonly service = inject(AdminService);
  private readonly notifications = inject(NotificationService);
  protected readonly auth = inject(AuthService);

  protected readonly recherche = new FormControl('', { nonNullable: true });
  private readonly page$ = new BehaviorSubject<number>(0);
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
      this.declencheur$
    ]).pipe(
      switchMap(([recherche, page]) =>
        forkJoin({
          utilisateurs: this.service.utilisateurs({
            page, taille: 10, tri: 'nom', recherche
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

  protected estSoiMeme(utilisateur: UtilisateurResume): boolean {
    return utilisateur.email === this.auth.utilisateur()?.email;
  }

  protected basculerRole(utilisateur: UtilisateurResume): void {
    const cible: Role = utilisateur.role === 'ADMIN' ? 'USER' : 'ADMIN';

    this.service.changerRole(utilisateur.id, cible).subscribe({
      next: () => {
        this.notifications.succes(`${utilisateur.nom} est désormais ${cible}.`);
        this.rafraichir();
      },
      error: (erreur: HttpErrorResponse) => this.signalerRefus(erreur)
    });
  }

  protected supprimer(utilisateur: UtilisateurResume): void {
    // Action irréversible qui emporte aussi les séances : on confirme
    if (!confirm(`Supprimer définitivement ${utilisateur.nom} et toutes ses séances ?`)) {
      return;
    }

    this.service.supprimer(utilisateur.id).subscribe({
      next: () => {
        this.notifications.succes(`${utilisateur.nom} a été supprimé.`);
        this.rafraichir();
      },
      error: (erreur: HttpErrorResponse) => this.signalerRefus(erreur)
    });
  }

  protected voirSeances(utilisateur: UtilisateurResume): void {
    this.service.seancesDe(utilisateur.id).subscribe({
      next: (page) => this.seancesConsultees.set({ nom: utilisateur.nom, page }),
      error: () => this.notifications.erreur('Séances indisponibles.')
    });
  }

  protected fermerSeances(): void {
    this.seancesConsultees.set(undefined);
  }

  protected allerPage(numero: number): void {
    this.page$.next(Math.max(0, numero));
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
}
