import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthResponse, ConnexionRequest, InscriptionRequest, Utilisateur } from '../models/auth.model';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ QUESTION — Composant ou service ? Et pourquoi les SIGNALS ?             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le service porte l'état partagé et les appels HTTP ; le composant se limite
 * à la vue. `providedIn: 'root'` en fait un singleton applicatif, arborescent
 * (tree-shakable) : s'il n'est jamais injecté, il n'est pas embarqué.
 *
 * ÉTAT EN SIGNALS plutôt qu'en BehaviorSubject :
 *   - lecture SYNCHRONE (`utilisateur()`), pas de souscription
 *   - AUCUN risque de fuite mémoire : rien à désabonner
 *   - `computed` recalcule automatiquement et seulement si nécessaire
 *   - la détection de changement devient fine (granularité du signal)
 *
 * On garde les Observables pour l'HTTP : un appel réseau est un flux unique
 * qu'on veut pouvoir annuler et composer avec les opérateurs RxJS.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly http = inject(HttpClient);     // inject() : plus concis qu'un constructeur
  private readonly router = inject(Router);

  private static readonly CLE_TOKEN = 'kayedaw.token';
  private static readonly CLE_UTILISATEUR = 'kayedaw.utilisateur';

  /** Signal privé en écriture, exposé en lecture seule : encapsulation. */
  private readonly _utilisateur = signal<Utilisateur | null>(this.lireUtilisateurStocke());
  readonly utilisateur = this._utilisateur.asReadonly();

  /** Signaux dérivés : recalculés automatiquement quand la source change. */
  readonly estConnecte = computed(() => this._utilisateur() !== null);
  readonly estAdmin = computed(() => this._utilisateur()?.role === 'ADMIN');
  /** Ville de référence, utilisée pour pré-remplir les formulaires de séance. */
  readonly villeParDefaut = computed(() => this._utilisateur()?.villeParDefaut ?? '');

  readonly initiales = computed(() => {
    const nom = this._utilisateur()?.nom ?? '';
    return nom.split(' ').map(m => m.charAt(0)).join('').toUpperCase().slice(0, 2);
  });

  inscrire(requete: InscriptionRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/inscription', requete)
      .pipe(tap(reponse => this.enregistrerSession(reponse)));
  }

  connecter(requete: ConnexionRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/connexion', requete)
      .pipe(tap(reponse => this.enregistrerSession(reponse)));
  }

  deconnecter(redirection = true): void {
    localStorage.removeItem(AuthService.CLE_TOKEN);
    localStorage.removeItem(AuthService.CLE_UTILISATEUR);
    this._utilisateur.set(null);
    if (redirection) {
      void this.router.navigate(['/connexion']);
    }
  }

  /**
   * Met à jour le nom ET la ville en session après modification du profil.
   * Sans cela, l'en-tête garderait les anciennes initiales jusqu'à la
   * prochaine reconnexion — le jeton, lui, n'a pas besoin d'être réémis :
   * il ne porte que l'email et le rôle.
   */
  rafraichirProfil(nom: string, villeParDefaut: string): void {
    const courant = this._utilisateur();
    if (!courant) {
      return;
    }
    const misAJour: Utilisateur = { ...courant, nom, villeParDefaut };
    localStorage.setItem(AuthService.CLE_UTILISATEUR, JSON.stringify(misAJour));
    this._utilisateur.set(misAJour);
  }

  token(): string | null {
    return localStorage.getItem(AuthService.CLE_TOKEN);
  }

  private enregistrerSession(reponse: AuthResponse): void {
    localStorage.setItem(AuthService.CLE_TOKEN, reponse.token);

    const utilisateur: Utilisateur = {
      email: reponse.email,
      nom: reponse.nom,
      role: reponse.role,
      villeParDefaut: reponse.villeParDefaut
    };
    localStorage.setItem(AuthService.CLE_UTILISATEUR, JSON.stringify(utilisateur));
    this._utilisateur.set(utilisateur);
  }

  /**
   * NOTE DE SÉCURITÉ (à savoir défendre en entretien).
   * localStorage est vulnérable au XSS : un script injecté peut lire le jeton.
   * L'alternative robuste est un cookie httpOnly + SameSite, posé par le serveur,
   * inaccessible au JavaScript — mais elle impose de gérer le CSRF.
   * localStorage est retenu ici pour la simplicité de la démo ; en production
   * sur une application sensible, je recommanderais le cookie httpOnly.
   */
  private lireUtilisateurStocke(): Utilisateur | null {
    const brut = localStorage.getItem(AuthService.CLE_UTILISATEUR);
    if (!brut) {
      return null;
    }
    try {
      return JSON.parse(brut) as Utilisateur;
    } catch {
      // Donnée corrompue : on repart proprement plutôt que de planter
      localStorage.removeItem(AuthService.CLE_UTILISATEUR);
      return null;
    }
  }
}
