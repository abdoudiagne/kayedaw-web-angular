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
   * ACCUEIL — la racine mène à la CONNEXION tant qu'on n'est pas identifié.
   *
   * `redirectTo` accepte une FONCTION depuis Angular 18 : on décide la cible à
   * l'exécution, en injectant un service. Avant, il fallait un guard factice ou
   * un composant vide dont le seul rôle était de rediriger.
   *
   * Sans cela, la racine renvoyait vers /seances, que authGuard rejetait
   * ensuite vers /connexion : deux navigations, et une URL polluée par un
   * paramètre `redirige` inutile.
   */
  {
    path: '',
    pathMatch: 'full',
    redirectTo: () => (inject(AuthService).estConnecte() ? '/seances' : '/connexion')
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
  { path: '**', redirectTo: () => (inject(AuthService).estConnecte() ? '/seances' : '/connexion') }
];
