import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Profil } from '../../core/models/profil.model';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ProfilService } from '../../core/services/profil.service';

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
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Mon profil</h1>
    <p class="silence">Vos informations de compte et votre activité.</p>

    @if (profil(); as p) {
      <section class="entete carte">
        <span class="avatar">{{ auth.initiales() }}</span>
        <div class="identite">
          <strong>{{ p.nom }}</strong>
          <span class="silence">{{ p.email }}</span>
        </div>
        <span class="role" [attr.data-role]="p.role">{{ p.role }}</span>
      </section>

      <dl class="chiffres">
        <div class="tuile"><dt>Séances réalisées</dt><dd>{{ p.nombreSeances }}</dd></div>
        <div class="tuile"><dt>Distance cumulée</dt><dd>{{ p.distanceTotaleKm }} <small>km</small></dd></div>
        <div class="tuile"><dt>Ville de référence</dt><dd class="ville">{{ p.villeParDefaut }}</dd></div>
        <div class="tuile">
          <dt>Depuis</dt>
          <dd>
            @if (p.premiereSeance) { {{ p.premiereSeance | date:'MMMM y' }} }
            @else { <span class="silence">aucune séance</span> }
          </dd>
        </div>
      </dl>

      <section class="carte bloc">
        <h2>Informations</h2>
        <form [formGroup]="formulaireNom" (ngSubmit)="enregistrerProfil()">
          <label class="etiquette requis" for="nom">Nom</label>
          <input id="nom" aria-required="true" class="champ" type="text" formControlName="nom" autocomplete="name" />
          @if (formulaireNom.controls.nom.invalid && formulaireNom.controls.nom.touched) {
            <p class="erreur">Le nom est obligatoire.</p>
          }

          <label class="etiquette requis" for="ville">Ville de référence</label>
          <input id="ville" aria-required="true" class="champ" type="text" formControlName="villeParDefaut" />
          @if (formulaireNom.controls.villeParDefaut.invalid
               && formulaireNom.controls.villeParDefaut.touched) {
            <p class="erreur">La ville est obligatoire.</p>
          }
          <p class="aide">
            Elle pré-remplit vos nouvelles séances et permet d'afficher la météo
            prévue dès que vous choisissez une date, avant même d'enregistrer.
          </p>

          <button type="submit" class="bouton" [disabled]="nomEnCours() || formulaireNom.pristine">
            {{ nomEnCours() ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </form>
      </section>

      <section class="carte bloc">
        <h2>Mot de passe</h2>
        <form [formGroup]="formulaireMdp" (ngSubmit)="changerMotDePasse()">
          <label class="etiquette requis" for="actuel">Mot de passe actuel</label>
          <input id="actuel" aria-required="true" class="champ" type="password" formControlName="motDePasseActuel"
                 autocomplete="current-password" />

          <label class="etiquette requis" for="nouveau">Nouveau mot de passe</label>
          <input id="nouveau" aria-required="true" class="champ" type="password" formControlName="nouveauMotDePasse"
                 autocomplete="new-password" />
          @if (formulaireMdp.controls.nouveauMotDePasse.hasError('minlength')
               && formulaireMdp.controls.nouveauMotDePasse.touched) {
            <p class="erreur">8 caractères minimum.</p>
          }

          <p class="aide">
            Le mot de passe actuel est exigé : sans lui, un jeton volé permettrait
            de vous verrouiller hors de votre propre compte.
          </p>

          <button type="submit" class="bouton" [disabled]="mdpEnCours()">
            {{ mdpEnCours() ? 'Changement…' : 'Changer le mot de passe' }}
          </button>

          @if (erreurMdp(); as message) {
            <p class="erreur globale" role="alert">{{ message }}</p>
          }
        </form>
      </section>
    } @else {
      <div class="squelette bloc-attente"></div>
    }
  `,
  styles: [`
    .entete { display: flex; align-items: center; gap: 1rem; padding: 1.25rem;
              margin: 1.5rem 0; }
    .avatar { display: grid; place-items: center; width: 3.25rem; height: 3.25rem;
              border-radius: 50%; background: var(--degrade-marque); color: #fff;
              font-weight: 700; box-shadow: var(--ombre-2); }
    .identite { display: grid; margin-right: auto; }
    .identite strong { font-size: 1.1rem; }
    .role { padding: .28rem .7rem; border-radius: 999px; font-size: .72rem; font-weight: 700;
            background: var(--surface-douce); color: var(--texte-doux); }
    .role[data-role="ADMIN"] { background: rgba(240, 126, 43, .14); color: #c05f16; }

    .chiffres { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
                gap: 1rem; margin: 1.5rem 0 2rem; }
    .tuile { position: relative; overflow: hidden; padding: 1.15rem 1.25rem;
             border-radius: var(--rayon); background: var(--surface);
             border: 1px solid var(--bordure); box-shadow: var(--ombre-1); }
    .tuile::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px;
                     background: var(--degrade-marque); }
    dt { font-size: .8rem; color: var(--texte-doux); }
    dd { margin: .3rem 0 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -.02em;
         font-variant-numeric: tabular-nums; text-transform: capitalize; }
    dd small { font-size: .9rem; color: var(--texte-doux); }

    .bloc { padding: clamp(1.25rem, 3vw, 1.75rem); margin-bottom: 1.25rem; max-width: 34rem; }
    .bloc h2 { margin: 0 0 .75rem; }
    form { display: grid; gap: .3rem; }
    .bouton { justify-self: start; margin-top: 1.25rem; }
    .erreur { color: var(--danger); font-size: .85rem; margin: .2rem 0 0; }
    .erreur.globale { margin-top: 1rem; padding: .7rem .9rem; border-radius: .6rem;
                      background: color-mix(in srgb, var(--danger) 10%, transparent); }
    .aide { color: var(--texte-doux); font-size: .8rem; margin: .75rem 0 0; }
    .bloc-attente { height: 12rem; margin-top: 1.5rem; }
    dd.ville { font-size: 1.2rem; }
  `]
})
export class ProfilComponent implements OnInit {

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ProfilService);
  private readonly notifications = inject(NotificationService);
  protected readonly auth = inject(AuthService);

  protected readonly profil = signal<Profil | undefined>(undefined);
  protected readonly nomEnCours = signal(false);
  protected readonly mdpEnCours = signal(false);
  protected readonly erreurMdp = signal<string | null>(null);

  protected readonly formulaireNom = this.fb.nonNullable.group({
    nom: ['', [Validators.required, Validators.maxLength(100)]],
    villeParDefaut: ['', [Validators.required, Validators.maxLength(100)]]
  });

  protected readonly formulaireMdp = this.fb.nonNullable.group({
    motDePasseActuel: ['', [Validators.required]],
    nouveauMotDePasse: ['', [Validators.required, Validators.minLength(8)]]
  });

  ngOnInit(): void {
    this.service.profil().subscribe({
      next: (p) => {
        this.profil.set(p);
        this.formulaireNom.patchValue({ nom: p.nom, villeParDefaut: p.villeParDefaut });
        this.formulaireNom.markAsPristine();
      },
      error: () => this.notifications.erreur('Profil indisponible.')
    });
  }

  protected enregistrerProfil(): void {
    if (this.formulaireNom.invalid) {
      this.formulaireNom.markAllAsTouched();
      return;
    }

    this.nomEnCours.set(true);
    const { nom, villeParDefaut } = this.formulaireNom.getRawValue();
    this.service.modifierProfil(nom, villeParDefaut).subscribe({
      next: (p) => {
        this.profil.set(p);
        this.formulaireNom.markAsPristine();
        this.nomEnCours.set(false);
        this.notifications.succes('Profil mis à jour.');
        // L'en-tête affiche les initiales et le formulaire de séance
        // pré-remplit la ville : on rafraîchit la session locale.
        this.auth.rafraichirProfil(p.nom, p.villeParDefaut);
      },
      error: () => {
        this.nomEnCours.set(false);
        this.notifications.erreur('Enregistrement impossible.');
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
