import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard, invitéGuard } from './core/guards/auth.guard';
import { AuthService } from './core/services/auth.service';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LAZY LOADING — `loadComponent` sur des composants standalone            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Chaque route charge son composant à la demande : le bundle initial ne
 * contient que le strict nécessaire, ce qui améliore le temps de premier
 * affichage. Avant les standalone components, il fallait `loadChildren`
 * et un NgModule par fonctionnalité.
 */
export const routes: Routes = [
  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ ACCUEIL PUBLIC — sans garde, et c'est un revirement assumé            │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * La racine menait droit à l'écran de connexion : un visiteur devait saisir
   * des identifiants avant même de savoir ce que fait l'application. Elle a
   * d'abord porté une page d'accueil réservée aux VISITEURS (`invitéGuard`),
   * qui renvoyait un compte ouvert vers l'écran de son rôle.
   *
   * L'accueil était réservé aux visiteurs : un compte ouvert y était renvoyé
   * Cette garde est tombée : « Accueil » figure désormais en permanence dans
   * l'en-tête, connecté ou non, et un lien qui rebondit ailleurs est un lien
   * MENTEUR — il annonce une destination et en livre une autre, sans jamais
   * s'allumer en `routerLinkActive` puisque l'URL finale n'est pas la sienne.
   *
   * La page s'adapte donc à la session plutôt que de se fermer : ses appels à
   * l'action deviennent ceux du rôle (voir `accueil.component.html`).
   */
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/accueil/accueil.component')
      .then(m => m.AccueilComponent)
  },

  /**
   * « À propos » : carte d'identité technique du projet, lisible connecté ou
   * non. Sans garde, comme l'accueil — les deux liens que l'en-tête conserve
   * en permanence mènent l'un comme l'autre à une vraie page.
   */
  {
    path: 'a-propos',
    loadComponent: () => import('./features/accueil/a-propos.component')
      .then(m => m.AProposComponent),
    title: 'À propos — KayeDaw'
  },

  {
    path: 'connexion',
    canActivate: [invitéGuard],
    loadComponent: () => import('./features/auth/connexion.component').then(m => m.ConnexionComponent),
    title: 'Connexion — KayeDaw'
  },
  {
    path: 'inscription',
    canActivate: [invitéGuard],
    loadComponent: () => import('./features/auth/inscription.component').then(m => m.InscriptionComponent),
    title: 'Inscription — KayeDaw'
  },
  {
    path: 'seances',
    canActivate: [authGuard],
    loadComponent: () => import('./features/seances/seance-liste.component').then(m => m.SeanceListeComponent),
    title: 'Mes séances — KayeDaw'
  },
  {
    path: 'seances/nouvelle',
    canActivate: [authGuard],
    loadComponent: () => import('./features/seances/seance-formulaire.component').then(m => m.SeanceFormulaireComponent),
    title: 'Nouvelle séance — KayeDaw'
  },
  {
    path: 'seances/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/seances/seance-detail.component').then(m => m.SeanceDetailComponent),
    title: 'Détail séance — KayeDaw'
  },
  {
    path: 'seances/:id/modifier',
    canActivate: [authGuard],
    loadComponent: () => import('./features/seances/seance-formulaire.component').then(m => m.SeanceFormulaireComponent),
    title: 'Modifier la séance — KayeDaw'
  },
  {
    path: 'profil',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profil/profil.component').then(m => m.ProfilComponent),
    title: 'Mon profil — KayeDaw'
  },
  {
    path: 'statistiques',
    canActivate: [authGuard],
    loadComponent: () => import('./features/statistiques/statistiques.component').then(m => m.StatistiquesComponent),
    title: 'Statistiques — KayeDaw'
  },
  {
    path: 'administration',
    canActivate: [authGuard, adminGuard],   // les guards s'enchaînent
    loadComponent: () => import('./features/admin/administration.component').then(m => m.AdministrationComponent),
    title: 'Administration — KayeDaw'
  },

  // Même logique pour une URL inconnue : jamais d'écran vide, jamais de boucle
  { path: '**', redirectTo: () => {
      const auth = inject(AuthService);
      if (!auth.estConnecte()) {
        return '/connexion';
      }
      // L'administrateur atterrit sur SON écran : le carnet de séances d'un
      // compte d'administration est vide par nature.
      return auth.estAdmin() ? '/administration' : '/seances';
    } }
];
